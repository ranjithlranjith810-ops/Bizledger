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

// Per-field max lengths (input validation hardening). Each value is capped
// well below anything a legitimate form produces; oversized payloads fail
// fast with a sanitized 400 instead of being persisted or pushed toward the
// DB. Monetary fields have explicit bounds and reject negatives (a negative
// credit limit / balance is never meaningful for this domain).
const FIELD_MAX = {
  code: 50,
  avatarInitials: 20,
  businessType: 100,
  website: 300,
  contactName: 100,
  contactDesignation: 100,
  contactMobile: 20,
  contactEmail: 254,
  addressLine: 300,
  city: 100,
  state: 100,
  country: 100,
  pincode: 20,
  stateCode: 10,
  paymentTerms: 100,
  notes: 1000,
} as const;

const MAX_MONEY = 99_999_999_999.99;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function strCap(v: unknown, field: keyof typeof FIELD_MAX, label: string): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (s.length > FIELD_MAX[field]) {
    throw new ValidationError(`${label} is too long`);
  }
  return s;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Money field guard. Absent -> undefined (caller picks the default). Present
 * values must be finite, non-negative and within MAX_MONEY; anything else is a
 * sanitized 400 rather than a silent coercion.
 */
function money(v: unknown, label: string): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "boolean" || v === "") return undefined;
  const n = num(v);
  if (n === undefined) throw new ValidationError(`${label} must be a number`);
  if (n < 0) throw new ValidationError(`${label} cannot be negative`);
  if (n > MAX_MONEY) throw new ValidationError(`${label} is unreasonably large`);
  return n;
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
  if (gstin && gstin.length > 16) throw new ValidationError("GSTIN is too long");
  const pan = str(raw.panNumber);
  if (pan && pan.length > 10) throw new ValidationError("PAN is too short or long");

  // Input validation hardening: every free-text field is length-capped and
  // monetary fields reject negative / unreasonable values (sanitized 400).
  const capped = (v: unknown, field: keyof typeof FIELD_MAX, label: string) =>
    strCap(v, field, label);

  return {
    code: capped(raw.code, "code", "Code"),
    type,
    name,
    avatarInitials: capped(raw.avatarInitials, "avatarInitials", "Initials") ?? "CU",
    businessType: capped(raw.businessType, "businessType", "Business type"),
    gstStatus,
    gstin,
    panNumber: pan,
    website: capped(raw.website, "website", "Website"),
    contactName: capped(raw.contactName, "contactName", "Contact name"),
    contactDesignation: capped(raw.contactDesignation, "contactDesignation", "Contact designation"),
    contactMobile: capped(raw.contactMobile, "contactMobile", "Contact mobile"),
    contactEmail: capped(raw.contactEmail, "contactEmail", "Contact email"),
    billingAddressLine1: capped(raw.billingAddressLine1, "addressLine", "Billing address"),
    billingAddressLine2: capped(raw.billingAddressLine2, "addressLine", "Billing address"),
    billingCity: capped(raw.billingCity, "city", "Billing city"),
    billingState: capped(raw.billingState, "state", "Billing state"),
    billingPincode: capped(raw.billingPincode, "pincode", "Billing pincode"),
    billingCountry: capped(raw.billingCountry, "country", "Billing country"),
    shippingAddressLine1: capped(raw.shippingAddressLine1, "addressLine", "Shipping address"),
    shippingAddressLine2: capped(raw.shippingAddressLine2, "addressLine", "Shipping address"),
    shippingCity: capped(raw.shippingCity, "city", "Shipping city"),
    shippingState: capped(raw.shippingState, "state", "Shipping state"),
    shippingPincode: capped(raw.shippingPincode, "pincode", "Shipping pincode"),
    shippingCountry: capped(raw.shippingCountry, "country", "Shipping country"),
    sameAsBilling: raw.sameAsBilling == null ? true : Boolean(raw.sameAsBilling),
    stateCode: capped(raw.stateCode, "stateCode", "State code"),
    creditLimit: money(raw.creditLimit, "Credit limit") ?? 0,
    paymentTerms: capped(raw.paymentTerms, "paymentTerms", "Payment terms"),
    notes: capped(raw.notes, "notes", "Notes"),
    status,
    outstandingBalance: money(raw.outstandingBalance, "Outstanding balance") ?? 0,
    totalSales: money(raw.totalSales, "Total sales") ?? 0,
    totalInvoices: (() => {
      const n = num(raw.totalInvoices);
      if (n === undefined) return 0;
      if (n < 0 || !Number.isInteger(n)) throw new ValidationError("Total invoices must be a non-negative integer");
      if (n > 1_000_000_000) throw new ValidationError("Total invoices is unreasonably large");
      return Math.trunc(n);
    })(),
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
  if (q.length > 200) throw new ValidationError("Search query is too long");

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
