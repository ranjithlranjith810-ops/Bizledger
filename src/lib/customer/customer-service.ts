// Server-side Customer service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` first (via getBusinessForMember). The `businessId` is
// treated as a REQUESTED TARGET only — it is always validated against the
// authenticated user's own BusinessMember. All reads/writes are then scoped to
// the VERIFIED membership's businessId, so a caller can never read or write
// another tenant's customers. Names/emails/phones are business-scoped and NOT
// globally unique (duplicates are allowed across businesses).

import { prisma } from "@/lib/prisma";
import { requireBusinessPermission } from "@/lib/business/business-service";
import { withEntitlementCheck } from "@/lib/billing/entitlements-server";
import {
  ValidationError,
  ResourceNotFoundError,
  DuplicateResourceError,
} from "@/lib/business/api-error";
import type { Prisma } from "@/generated/prisma/client";

const MAX_LENGTH = 500;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value == null || value === "") return undefined;
  const v = String(value);
  if (!(allowed as readonly string[]).includes(v)) {
    throw new ValidationError(`Invalid ${field}. Must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
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

const CUSTOMER_TYPES = ["business", "individual"] as const;
const GST_STATUSES = ["registered", "composite", "unregistered", "consumer"] as const;
const CUSTOMER_STATUSES = ["Active", "Pending", "Overdue", "Inactive"] as const;

/**
 * Validates and normalizes customer create/update input. Throws ValidationError
 * on any invalid value. Unknown extra fields are ignored.
 */
function normalizeCustomerInput(raw: Record<string, unknown>) {
  const name = str(raw.name);
  if (!name) throw new ValidationError("Customer name is required");
  if (name.length > MAX_LENGTH) throw new ValidationError("Customer name is too long");

  const type = validateEnum(raw.type, CUSTOMER_TYPES, "type") ?? "business";
  const gstStatus =
    validateEnum(raw.gstStatus, GST_STATUSES, "gstStatus") ?? "unregistered";
  const status =
    validateEnum(raw.status, CUSTOMER_STATUSES, "status") ?? "Active";

  const gstin = str(raw.gstin);
  if (gstin && gstin.length > 15) throw new ValidationError("GSTIN is too long");
  const pan = str(raw.panNumber);
  if (pan && pan.length > 10) throw new ValidationError("PAN is too short or long");

  return {
    code: str(raw.code),
    type,
    name,
    avatarInitials: str(raw.avatarInitials) ?? "CU",
    businessType: str(raw.businessType),
    gstStatus,
    gstin,
    panNumber: pan,
    website: str(raw.website),
    contactName: str(raw.contactName),
    contactDesignation: str(raw.contactDesignation),
    contactMobile: str(raw.contactMobile),
    contactEmail: str(raw.contactEmail),
    billingAddressLine1: str(raw.billingAddressLine1),
    billingAddressLine2: str(raw.billingAddressLine2),
    billingCity: str(raw.billingCity),
    billingState: str(raw.billingState),
    billingPincode: str(raw.billingPincode),
    billingCountry: str(raw.billingCountry),
    shippingAddressLine1: str(raw.shippingAddressLine1),
    shippingAddressLine2: str(raw.shippingAddressLine2),
    shippingCity: str(raw.shippingCity),
    shippingState: str(raw.shippingState),
    shippingPincode: str(raw.shippingPincode),
    shippingCountry: str(raw.shippingCountry),
    sameAsBilling: raw.sameAsBilling == null ? true : Boolean(raw.sameAsBilling),
    stateCode: str(raw.stateCode),
    creditLimit: num(raw.creditLimit) ?? 0,
    paymentTerms: str(raw.paymentTerms),
    notes: str(raw.notes),
    status,
    outstandingBalance: num(raw.outstandingBalance) ?? 0,
    totalSales: num(raw.totalSales) ?? 0,
    totalInvoices: Math.trunc(num(raw.totalInvoices) ?? 0),
    sinceDate: str(raw.sinceDate),
  };
}

function toCustomerJson(c: {
  id: string;
  code: string;
  type: string;
  name: string;
  avatarInitials: string;
  businessType: string | null;
  gstStatus: string;
  gstin: string | null;
  panNumber: string | null;
  website: string | null;
  contactName: string | null;
  contactDesignation: string | null;
  contactMobile: string | null;
  contactEmail: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPincode: string | null;
  billingCountry: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPincode: string | null;
  shippingCountry: string | null;
  sameAsBilling: boolean;
  stateCode: string | null;
  creditLimit: Prisma.Decimal | number;
  paymentTerms: string | null;
  notes: string | null;
  status: string;
  outstandingBalance: Prisma.Decimal | number;
  totalSales: Prisma.Decimal | number;
  totalInvoices: number;
  lastPaymentAmount: Prisma.Decimal | number | null;
  lastPaymentDate: Date | null;
  lastPaymentMethod: string | null;
  createdDate: Date;
  sinceDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    name: c.name,
    avatarInitials: c.avatarInitials,
    businessType: c.businessType,
    gstStatus: c.gstStatus,
    gstin: c.gstin,
    panNumber: c.panNumber,
    website: c.website,
    primaryContact: {
      name: c.contactName,
      designation: c.contactDesignation,
      mobile: c.contactMobile,
      email: c.contactEmail,
    },
    billingAddress: {
      addressLine1: c.billingAddressLine1,
      addressLine2: c.billingAddressLine2,
      city: c.billingCity,
      state: c.billingState,
      pincode: c.billingPincode,
      country: c.billingCountry,
    },
    shippingAddress: {
      addressLine1: c.shippingAddressLine1,
      addressLine2: c.shippingAddressLine2,
      city: c.shippingCity,
      state: c.shippingState,
      pincode: c.shippingPincode,
      country: c.shippingCountry,
    },
    sameAsBilling: c.sameAsBilling,
    stateCode: c.stateCode,
    creditLimit: Number(c.creditLimit),
    paymentTerms: c.paymentTerms,
    notes: c.notes,
    status: c.status,
    outstandingBalance: Number(c.outstandingBalance),
    totalSales: Number(c.totalSales),
    totalInvoices: c.totalInvoices,
    lastPaymentAmount: c.lastPaymentAmount == null ? null : Number(c.lastPaymentAmount),
    lastPaymentDate: c.lastPaymentDate ? c.lastPaymentDate.toISOString() : null,
    lastPaymentMethod: c.lastPaymentMethod,
    createdDate: c.createdDate.toISOString(),
    sinceDate: c.sinceDate ? c.sinceDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export type CustomerJson = ReturnType<typeof toCustomerJson>;

/**
 * Create a customer in the member's verified business.
 */
export async function createCustomer(businessIdInput: unknown, raw: Record<string, unknown>) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "customers", "manage");
  const data = normalizeCustomerInput(raw);

  // F3: plan ceiling for customers enforced server-side inside ONE transaction
  // (business-row lock → count → check → insert).
  const created = await withEntitlementCheck(businessId, "customers", (tx) =>
    tx.customer.create({
      data: {
        businessId,
        ...data,
        code: data.code ?? `CUST-${Date.now().toString().slice(-6)}`,
        createdDate: data.sinceDate ? new Date(data.sinceDate) : new Date(),
      },
    }),
  );

  return toCustomerJson(created);
}

/**
 * List customers for the member's verified business, with optional
 * case-insensitive partial search across the same fields the frontend searches.
 * Empty/whitespace query returns all customers.
 */
export async function listCustomers(businessIdInput: unknown, opts: { q?: string }) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "customers", "view");

  const q = String(opts?.q ?? "").trim().toLowerCase();

  const where: Prisma.CustomerWhereInput = { businessId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { gstin: { contains: q, mode: "insensitive" } },
      { billingCity: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toCustomerJson);
}

/**
 * Get one customer by id within the member's verified business.
 */
export async function getCustomer(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "customers", "view");

  const customer = await prisma.customer.findFirst({
    where: { id, businessId },
  });
  if (!customer) throw new ResourceNotFoundError("Customer not found");
  return toCustomerJson(customer);
}

/**
 * Update a customer within the member's verified business. Only fields present
 * in the payload are updated.
 */
export async function updateCustomer(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "customers", "manage");

  const existing = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Customer not found");

  const data = normalizeCustomerInput(raw);
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...data,
      // Preserve required fields not present in a PATCH payload so nullable
      // fields always carry their own value.
      code: data.code ?? existing.code,
      name: data.name,
      avatarInitials: data.avatarInitials ?? existing.avatarInitials,
      type: data.type,
      gstStatus: data.gstStatus,
      status: data.status,
    },
  });

  return toCustomerJson(updated);
}

/**
 * Delete a customer within the member's verified business. This performs a
 * HARD delete. Invoices are still localStorage-based in this phase, so no
 * financial records are affected yet; when financial records move to the DB,
 * this delete policy must be revisited (likely soft-delete or restrict).
 */
export async function deleteCustomer(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "customers", "manage");

  const existing = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Customer not found");

  await prisma.customer.delete({ where: { id } });
  return { id };
}

// Detect a business-scoped uniqueness violation from a thrown Prisma error.
export function isDuplicateError(error: unknown): error is { code: string } {
  const e = error as { code?: string };
  return e?.code === "P2002";
}

export { DuplicateResourceError };
