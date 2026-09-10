// Server-side Expense service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (getBusinessForMember) before touching data. All
// queries are scoped to the verified business; a caller can never read, write
// or delete another tenant's expenses. Optional `vehicleId` is verified to
// belong to the SAME business before linking (cross-tenant link -> 404).
//
// Field values mirror the frontend Expense type (AddExpenseModal /
// AddVehicleExpenseModal): category/paymentMethod/expenseType/status are
// validated Strings (they contain spaces / are plain text), amount is Decimal
// with server-side validation (> 0, finite, max 2 decimals), `date` is the
// transaction date, and `vehicleRegistration` is a historical snapshot stored
// at creation (re-rendering never depends on mutable Vehicle master data).
//
// Expense GST is NOT modelled: the current frontend expenses do not compute or
// store GST amounts (the AddExpenseModal only shows a "GST Input Credit
// Eligible" decorative badge). Expense GST calculation is therefore DEFERRED.

import { prisma } from "@/lib/prisma";
import {
  requireBusinessPermission,
  requireBusinessRole,
  assertPermission,
  ForbiddenError,
} from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  ConflictError,
} from "@/lib/business/api-error";
import type { Prisma } from "@/generated/prisma/client";

export const EXPENSE_CATEGORIES = [
  "Raw Material",
  "Utilities",
  "Fuel",
  "Maintenance",
  "Office Supplies",
  "Labour & Wages",
  "Marketing",
  "Rent",
  "Travel",
  "Vehicle",
  "Other",
] as const;
export const EXPENSE_PAYMENT_METHODS = [
  "Bank Transfer",
  "UPI",
  "Cash",
  "Cheque",
  "Credit Card",
] as const;
export const EXPENSE_TYPES = ["Direct", "Indirect"] as const;
export const EXPENSE_STATUSES = ["Paid", "Pending", "Approved", "Rejected"] as const;

const MAX_LEN = 500;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function amountNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function invalid(list: readonly string[], value: string, label: string) {
  if (!(list as readonly string[]).includes(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
}

function isoDate(s: string): Date {
  const d = new Date(s.length === 10 ? s + "T00:00:00.000Z" : s);
  if (Number.isNaN(d.getTime())) throw new ValidationError("Invalid date");
  return d;
}

function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

function validateId(id: unknown): string {
  const v = str(id);
  if (!v) throw new ValidationError("Missing resource id");
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

/** Server-side expense number fallback matching the frontend EXP- style. */
function generateExpenseNumber(): string {
  const n = Math.floor(100 + Math.random() * 900);
  return `EXP-${Date.now().toString().slice(-4)}${n}`;
}

function normalizeExpenseInput(raw: Record<string, unknown>, partial = false) {
  const title = str(raw.title);
  if (partial) {
    if (title === "") throw new ValidationError("Expense title cannot be empty");
  } else {
    if (!title) throw new ValidationError("Expense title is required");
  }
  if (title !== undefined && title.length > MAX_LEN) {
    throw new ValidationError("Expense title is too long");
  }

  const amount = amountNum(raw.amount);
  if (amount !== undefined) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError("Amount must be a positive number");
    }
    const [whole, frac] = String(amount).split(".");
    if ((frac?.length ?? 0) > 2) {
      throw new ValidationError("Amount supports at most 2 decimal places");
    }
    if (whole.length > 12) throw new ValidationError("Amount is too large");
  }

const category = str(raw.category);
  if (category !== undefined) invalid(EXPENSE_CATEGORIES, category, "expense category");

  const paymentMethod = str(raw.paymentMethod);
  if (paymentMethod !== undefined) {
    invalid(EXPENSE_PAYMENT_METHODS, paymentMethod, "payment method");
  }

  const expenseType = str(raw.expenseType);
  if (expenseType !== undefined) invalid(EXPENSE_TYPES, expenseType, "expense type");

  const status = str(raw.status);
  if (status !== undefined) invalid(EXPENSE_STATUSES, status, "expense status");

  const out: Record<string, unknown> = {};

  if (category !== undefined) out.category = category;
  if (paymentMethod !== undefined) out.paymentMethod = paymentMethod;
  if (expenseType !== undefined) out.expenseType = expenseType;
  if (status !== undefined) out.status = status;

  if (title !== undefined) out.title = title;
  if (amount !== undefined) out.amount = amount;

  const dateRaw = str(raw.date) ?? str(raw.expenseDate);
  if (dateRaw !== undefined) {
    if (!DATE_ONLY.test(dateRaw) && !/^\d{4}-\d{2}-\d{2}T/.test(dateRaw)) {
      throw new ValidationError("Invalid date");
    }
    out.date = isoDate(dateRaw);
  }

  for (const k of [
    "paidFromAccount",
    "referenceNumber",
    "vendor",
    "notes",
    "receiptUrl",
    "receiptName",
    "receiptSize",
    "vehicleRegistration",
  ]) {
    const v = str(raw[k]);
    if (v !== undefined) {
      if (v.length > MAX_LEN) throw new ValidationError(`${k} is too long`);
      out[k] = v;
    }
  }

  const vendor = str(raw.vendor);
  if (partial) {
    if (vendor === "") throw new ValidationError("Vendor cannot be empty");
  } else {
    if (!vendor) out.vendor = "Direct Counter Purchase";
  }
  if (vendor !== undefined) {
    if (vendor.length > MAX_LEN) throw new ValidationError("Vendor is too long");
    out.vendor = vendor;
  }
  // A blank referenceNumber is stored as NULL (matches optional semantics).
  if (out.referenceNumber === "") out.referenceNumber = undefined;

  const vehicleId = str(raw.vehicleId);
  if (vehicleId !== undefined) {
    if (vehicleId.length > 64) throw new ValidationError("vehicleId is invalid");
    out.vehicleId = vehicleId;
  }

  if (!partial) {
    // F5: the expense number is ALWAYS minted server-side. A forged
    // expenseNumber in the body is ignored — it never reaches the whitelist.
    out.expenseNumber = generateExpenseNumber();
    out.category = category ?? "Other";
    out.paymentMethod = paymentMethod ?? "Bank Transfer";
    out.expenseType = expenseType ?? "Direct";
    out.status = status ?? "Paid";
  }

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) if (v !== undefined) clean[k] = v;
  return {
    title: clean.title as string | undefined,
    amount: clean.amount as number | undefined,
    date: clean.date as Date | undefined,
    expenseNumber: clean.expenseNumber as string | undefined,
    category: clean.category as string | undefined,
    paymentMethod: clean.paymentMethod as string | undefined,
    expenseType: clean.expenseType as string | undefined,
    status: clean.status as string | undefined,
    paidFromAccount: clean.paidFromAccount as string | undefined,
    referenceNumber: clean.referenceNumber as string | undefined,
    vendor: clean.vendor as string | undefined,
    notes: clean.notes as string | undefined,
    receiptUrl: clean.receiptUrl as string | undefined,
    receiptName: clean.receiptName as string | undefined,
    receiptSize: clean.receiptSize as string | undefined,
    vehicleId: clean.vehicleId as string | undefined,
    vehicleRegistration: clean.vehicleRegistration as string | undefined,
    createdBy: clean.createdBy as string | undefined,
    approvedBy: clean.approvedBy as string | undefined,
  };
}

function toExpenseJson(e: {
  id: string;
  expenseNumber: string;
  title: string;
  category: string;
  amount: Prisma.Decimal | number;
  date: Date;
  paymentMethod: string;
  paidFromAccount: string | null;
  referenceNumber: string | null;
  vendor: string;
  expenseType: string;
  status: string;
  notes: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  receiptSize: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    expenseNumber: e.expenseNumber,
    title: e.title,
    category: e.category,
    amount: Number(e.amount),
    date: e.date.toISOString().slice(0, 10),
    paymentMethod: e.paymentMethod,
    paidFromAccount: e.paidFromAccount,
    referenceNumber: e.referenceNumber,
    vendor: e.vendor,
    expenseType: e.expenseType,
    status: e.status,
    notes: e.notes,
    receiptUrl: e.receiptUrl,
    receiptName: e.receiptName,
    receiptSize: e.receiptSize,
    vehicleId: e.vehicleId,
    vehicleRegistration: e.vehicleRegistration,
    createdBy: e.createdBy,
    approvedBy: e.approvedBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export type ExpenseJson = ReturnType<typeof toExpenseJson>;

async function resolveVehicleForExpense(vehicleId: string | undefined) {
  if (!vehicleId) return;
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId },
    select: { id: true, registrationNumber: true, businessId: true },
  });
  // If the vehicle exists in a DIFFERENT business, treat as not found (404,
  // no disclosure). The caller has already verified business membership.
  return vehicle;
}

export async function createExpense(businessIdInput: unknown, raw: Record<string, unknown>) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await requireBusinessPermission(businessId, "expenses", "create");
  const data = normalizeExpenseInput(raw);

  // Writing an Approved/Rejected status is an APPROVAL action — it requires
  // `expenses.approve` (F2), even when the expense itself is being created.
  if (data.status === "Approved" || data.status === "Rejected") {
    assertPermission(ctx, "expenses", "approve");
  }

  // F5 — server-authoritative provenance: the authenticated member is ALWAYS
  // recorded as the creator and nothing in the browser body can forge it (the
  // body's createdBy/approvedBy keys were stripped before normalization). The
  // expense number was already minted server-side in normalizeExpenseInput.
  // approvedBy stays null here — it is set only by the explicit approval op.

  let vehicleRegistration: string | undefined;
  const vehicleId = data.vehicleId as string | undefined;
  if (vehicleId) {
    const vehicle = await resolveVehicleForExpense(vehicleId);
    if (!vehicle || vehicle.businessId !== businessId) {
      throw new ResourceNotFoundError("Vehicle not found");
    }
    vehicleRegistration = vehicle.registrationNumber;
  }

  const created = await prisma.expense.create({
    data: {
      businessId,
      ...(data as Omit<Prisma.ExpenseUncheckedCreateInput, "businessId">),
      createdBy: ctx.user.name,
      approvedBy: null,
      ...(vehicleRegistration
        ? { vehicleRegistration }
        : { vehicleRegistration: (data.vehicleRegistration as string | null) ?? null }),
    },
  });
  return toExpenseJson(created);
}

export async function listExpenses(
  businessIdInput: unknown,
  opts: { q?: string; category?: string; paymentMethod?: string; status?: string },
) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "expenses", "view");

  const where: Prisma.ExpenseWhereInput = { businessId };
  const q = String(opts?.q ?? "").trim().toLowerCase();
  if (q) {
    where.OR = [
      { expenseNumber: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { vendor: { contains: q, mode: "insensitive" } },
      { referenceNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  const category = String(opts?.category ?? "").trim();
  if (category && category !== "All") {
    invalid(EXPENSE_CATEGORIES, category, "expense category");
    where.category = category;
  }
  const paymentMethod = String(opts?.paymentMethod ?? "").trim();
  if (paymentMethod && paymentMethod !== "All") {
    invalid(EXPENSE_PAYMENT_METHODS, paymentMethod, "payment method");
    where.paymentMethod = paymentMethod;
  }
  const status = String(opts?.status ?? "").trim();
  if (status && status !== "All") {
    invalid(EXPENSE_STATUSES, status, "expense status");
    where.status = status;
  }

  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toExpenseJson);
}

export async function getExpense(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "expenses", "view");

  const expense = await prisma.expense.findFirst({ where: { id, businessId } });
  if (!expense) throw new ResourceNotFoundError("Expense not found");
  return toExpenseJson(expense);
}

export async function updateExpense(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  // The expenses module has no `edit` permission (its keymap is only
  // view/create/approve/delete), so editing expense FIELDS is a sanctioned
  // action reserved for Owner / Accountant / Manager — apply the role gate.
  // F5 hardening keeps `status`/`createdBy`/`approvedBy`/`expenseNumber`
  // server-authoritative below; only explicit approval may change status.
  await requireBusinessRole(businessId, ["OWNER", "ADMIN", "MANAGER"]);

  // F5 — expense status is server-authoritative. Only the explicit approval
  // operation (approveExpense) may change it; a forged status on PATCH is
  // rejected outright. createdBy / approvedBy / expenseNumber were stripped
  // from the accepted whitelist, so they are ignored here too.
  if (raw.status !== undefined) {
    throw new ValidationError(
      "Expense status must be changed via the approve/reject endpoint",
    );
  }

  const existing = await prisma.expense.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Expense not found");

  const data = normalizeExpenseInput(raw, true);
  const patch: Record<string, unknown> = { ...data };

  // Explicit unlink is expressed as `vehicleId: ""` (or null) in the body. The
  // shared `str()` helper normalizes an empty string to `undefined`, so detect
  // it straight from the raw payload before normalization.
  const rawVehicleId = raw.vehicleId;
  const wantsUnlink =
    rawVehicleId === null ||
    (typeof rawVehicleId === "string" && rawVehicleId.trim() === "");

  const vehicleId = patch.vehicleId as string | undefined;
  if (wantsUnlink) {
    // Clear the vehicle link and its historical snapshot.
    patch.vehicleId = null;
    patch.vehicleRegistration = null;
  } else if (vehicleId) {
    const vehicle = await resolveVehicleForExpense(vehicleId);
    if (!vehicle || vehicle.businessId !== businessId) {
      throw new ResourceNotFoundError("Vehicle not found");
    }
    if (patch.vehicleRegistration === undefined) {
      patch.vehicleRegistration = vehicle.registrationNumber;
    }
  }

  const updated = await prisma.expense.update({
    where: { id },
    data: patch as Prisma.ExpenseUncheckedUpdateInput,
  });
  return toExpenseJson(updated);
}

// F5 — explicit, server-authorized approval operation. The ONLY path that
// changes expense status. Requires `expenses.approve`, sets `approvedBy` to
// the authenticated approver (never the browser), and REFUSES self-approval
// (the creator cannot approve/reject their own expense — creator is recorded
// server-side at create time). Unpermitted transitions -> 409.
const EXPENSE_APPROVAL_TRANSITIONS: Record<string, readonly string[]> = {
  Paid: ["Approved", "Rejected"],
  Pending: ["Approved", "Rejected"],
  Approved: ["Rejected"],
  Rejected: [],
};

export async function decideExpenseApproval(
  businessIdInput: unknown,
  idInput: unknown,
  decisionInput: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  const ctx = await requireBusinessPermission(businessId, "expenses", "approve");

  const decision = String(decisionInput ?? "").trim().toUpperCase();
  if (decision !== "APPROVE" && decision !== "REJECT") {
    throw new ValidationError('decision must be "APPROVE" or "REJECT"');
  }
  const targetStatus = decision === "APPROVE" ? "Approved" : "Rejected";

  const existing = await prisma.expense.findFirst({
    where: { id, businessId },
    select: { id: true, status: true, createdBy: true },
  });
  if (!existing) throw new ResourceNotFoundError("Expense not found");

  // F5 — self-approval prevention. The creator is server-recorded, so a creator
  // can never approve (or overturn) their own expense — an independent reviewer
  // must act.
  if (
    existing.createdBy &&
    ctx.user.name &&
    existing.createdBy === ctx.user.name
  ) {
    throw new ForbiddenError(
      "You cannot approve or reject an expense you created",
    );
  }

  const allowed = EXPENSE_APPROVAL_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(targetStatus)) {
    throw new ConflictError(
      `Expense cannot transition from ${existing.status} to ${targetStatus}`,
    );
  }

  const updated = await prisma.expense.update({
    where: { id },
    data: { status: targetStatus, approvedBy: ctx.user.name },
  });
  return toExpenseJson(updated);
}

export async function deleteExpense(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "expenses", "delete");

  const existing = await prisma.expense.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Expense not found");

  await prisma.expense.delete({ where: { id } });
  return { id };
}