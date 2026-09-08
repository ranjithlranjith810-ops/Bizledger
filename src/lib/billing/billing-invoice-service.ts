// Phase 6A — SaaS billing document (Billing Invoice / Payment Receipt) domain.
//
// DELIBERATELY SEPARATE from the customer sales-document system: this module
// mints the platform-global subscription receipt AFTER a verified payment, and
// its numbering is a platform-global counter per India fiscal year (BillingSequence),
// NOT the business-scoped FinancialYear/DocumentSequence used by customer sales
// invoices/quotations/estimates/purchase-orders.
//
// MINT SEMANTICS (authority stays in the database):
//   • `mintBillingInvoice` runs INSIDE the webhook's activation transaction. Any
//     failure rolls the whole webhook back (Razorpay retries safely); a genuine
//     duplicate is idempotent via the paymentId @@unique + a pre-check, never a
//     continued P2002 (Postgres aborted-state 25P02 inside an interactive txn).
//   • Amounts/currency are COPIED VERBATIM from the stored, VERIFIED PaymentRecord
//     (never recalculated, never re-derived from the plan catalog, never trusted
//     from a request/webhook body).
//   • FAILED/CREATED/CANCELLED payments never get an invoice — mint throws.
//   • Customer + supplier identity are captured as immutable snapshots at mint
//     time; money is serialized to exactly 2dp strings across every API boundary.
//
// NUMBERING: platform-global counter keyed by the India fiscal-year label
// ("2026-27"). Number format BL-2026-000001 (prefix, FY start year, 6-digit
// zero padding). Allocation uses the same atomic
//   INSERT ... ON CONFLICT DO NOTHING + UPDATE ... RETURNING row-lock
// pattern as `allocateDocumentNumber`, but is intentionally NOT that function —
// the billing sequence is global (no business scope) and mints inside the
// webhook transaction which has no user session.
//
// SUPPLIER IDENTITY: the platform currently has no tax identity configured, so
// the supplier snapshot is a minimal branded constant (gstRegistered: false).
// The UI renders a single "GST @ 18%" line — never "GST Tax Invoice" — until a
// real supplier GSTIN is configured (a later marketing/admin phase). This is
// display-only; the snapshot never feeds tax decisions (the SaaS GST is the
// plan-catalog GST already stored on the PaymentRecord).

import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/business/api-error";
import { moneyString } from "@/lib/billing/calculator";

// Platform-global invoice prefix for SaaS billing receipts.
export const BILLING_PREFIX = "BL";

// Razorpay payment methods we surface on the receipt. Everything else is
// stored as null (the full payload stays private in webhook_event.payload).
export const BILLING_PAYMENT_METHODS = [
  "card",
  "netbanking",
  "upi",
  "wallet",
  "emi",
] as const;
export type BillingPaymentMethod = (typeof BILLING_PAYMENT_METHODS)[number];

// Branded supplier identity for now. Keep as an explicit constant so a real
// supplier GST identity can slot in without touching any mint logic.
export const SUPPLIER_NAME = "BizLedger";

/**
 * India financial-year label for a date: April 1 → March 31.
 *   Apr 2026 → "2026-27",  Mar 2026 → "2025-26",  Jan 2026 → "2025-26".
 */
export function fiscalYearLabelFor(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * BL-<FY start year>-<6-digit zero-padded sequence>  →  "BL-2026-000001".
 */
export function buildInvoiceNumber(
  prefix: string,
  fiscalYearLabel: string,
  sequence: number,
): string {
  const startYear = Number(fiscalYearLabel.split("-")[0]);
  return `${prefix}-${startYear}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Structural subset of a Prisma client / interactive-transaction client used by
 * the raw allocation statements, so mint can allocate inside the webhook
 * transaction (never a SELECT-then-increment, and a failure rolls back both the
 * number and the insert).
 */
export interface BillingSequenceDb {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/**
 * Idempotent, race-safe: ensure the platform-global counter row for a fiscal
 * year exists (INSERT ... ON CONFLICT DO NOTHING).
 */
export async function ensureBillingSequence(
  db: BillingSequenceDb,
  fiscalYearLabel: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `INSERT INTO "billing_sequence" ("id", "fiscalYear", "prefix", "nextNumber", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 1, now())
     ON CONFLICT ("fiscalYear") DO NOTHING`,
    fiscalYearLabel,
    BILLING_PREFIX,
  );
}

/**
 * Atomically take one number via row lock + RETURNING, then return the full
 * formatted invoice number. Mirrors `allocateDocumentNumber` semantics.
 */
export async function allocateBillingNumber(
  db: BillingSequenceDb,
  fiscalYearLabel: string,
): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ allocated: bigint }[]>(
    `UPDATE "billing_sequence"
        SET "nextNumber" = "nextNumber" + 1
      WHERE "fiscalYear" = $1
      RETURNING ("nextNumber" - 1) AS "allocated"`,
    fiscalYearLabel,
  );
  if (!rows.length) {
    throw new Error("Billing sequence not found for fiscal year");
  }
  return buildInvoiceNumber(BILLING_PREFIX, fiscalYearLabel, Number(rows[0].allocated));
}

/**
 * Normalizes a Razorpay payment `method` to the receipt allowlist. Returns null
 * for anything else — the original (full) payload is never persisted beyond the
 * webhook audit row.
 */
export function extractSafePaymentMethod(
  rawMethod: unknown,
): BillingPaymentMethod | null {
  const m = typeof rawMethod === "string" ? rawMethod.trim().toLowerCase() : "";
  return (BILLING_PAYMENT_METHODS as readonly string[]).includes(m)
    ? (m as BillingPaymentMethod)
    : null;
}

/**
 * Razorpay webhook `captured_at` is unix seconds; converts to a Date, or null
 * when absent/malformed (caller falls back to "now").
 */
export function capturedAtFromEntity(capturedAt: unknown): Date | null {
  if (typeof capturedAt !== "number" || !Number.isFinite(capturedAt) || capturedAt <= 0) {
    return null;
  }
  return new Date(capturedAt * 1000);
}

/** Immutable supplier snapshot (branded constant until a GST identity exists). */
export function buildSupplierSnapshot(): Record<string, unknown> {
  return { name: SUPPLIER_NAME, gstRegistered: false, gstin: null };
}

/** Immutable customer snapshot from the tenant's own Business row. */
export function buildCustomerSnapshot(
  business: {
    name: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    gstin: string | null;
    gstRegistered: boolean;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    pincode: string | null;
  },
): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string | null | undefined) => {
    const s = v ? String(v).trim() : "";
    if (s) out[k] = s;
  };
  set("name", business.name);
  set("legalName", business.legalName);
  set("email", business.email);
  set("phone", business.phone);
  set("gstin", business.gstin);
  if (business.gstRegistered) set("gstRegistered", "true");
  const address = [business.addressLine1, business.addressLine2]
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (address) out["address"] = address;
  set("city", business.city);
  set("state", business.state);
  set("stateCode", business.stateCode);
  set("pincode", business.pincode);
  return out;
}

// Structural subset of the stored payment needed to mint (amounts copied
// verbatim; authority stays in the database).
export const MINT_PAYMENT_SELECT = {
  id: true,
  businessId: true,
  subscriptionId: true,
  planId: true,
  planName: true,
  billingPeriod: true,
  baseAmount: true,
  gstRate: true,
  gstAmount: true,
  totalAmount: true,
  currency: true,
  status: true,
  orderId: true,
} as const satisfies Prisma.PaymentRecordSelect;

export type MintPaymentRow = Prisma.PaymentRecordGetPayload<{
  select: typeof MINT_PAYMENT_SELECT;
}>;

/** Wire-safe DTO of a BillingInvoice (2dp money strings, ISO dates). */
export interface BillingInvoiceDto {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  paymentDate: string;
  billingPeriod: string;
  planId: string;
  planName: string;
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  currency: string;
  orderId: string;
  paymentMethod: string | null;
  supplierSnapshot: Prisma.JsonValue;
  customerSnapshot: Prisma.JsonValue;
  createdAt: string;
}

export function toBillingInvoiceDto(inv: {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  paymentDate: Date;
  billingPeriod: string;
  planId: string;
  planName: string;
  baseAmount: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  currency: string;
  orderId: string;
  paymentMethod: string | null;
  supplierSnapshot: Prisma.JsonValue;
  customerSnapshot: Prisma.JsonValue;
  createdAt: Date;
}): BillingInvoiceDto {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate.toISOString(),
    paymentDate: inv.paymentDate.toISOString(),
    billingPeriod: inv.billingPeriod,
    planId: inv.planId,
    planName: inv.planName,
    baseAmount: moneyString(inv.baseAmount),
    gstRate: moneyString(inv.gstRate),
    gstAmount: moneyString(inv.gstAmount),
    totalAmount: moneyString(inv.totalAmount),
    currency: inv.currency,
    orderId: inv.orderId,
    paymentMethod: inv.paymentMethod,
    supplierSnapshot: inv.supplierSnapshot,
    customerSnapshot: inv.customerSnapshot,
    createdAt: inv.createdAt.toISOString(),
  };
}

export interface MintBillingInvoiceInput {
  /** PaymentRecord ROW id (always present — BillingInvoice.paymentId cites it). */
  paymentId: string;
  /** The activated BusinessSubscription id returned by activateSubscription. */
  subscriptionId: string;
  /** Payment date used for the fiscal-year (paymentDate → invoice date). */
  paymentDate: Date;
  /** Normalized payment method (allowlisted), or null. */
  paymentMethod: string | null;
}

/**
 * Mints exactly ONE BillingInvoice inside the caller's transaction for a
 * VERIFIED payment. Idempotent per PaymentRecord row. Throws for anything that
 * cannot be turned into a safe, immutable receipt (rolls the webhook back).
 */
export async function mintBillingInvoice(
  tx: Prisma.TransactionClient,
  input: MintBillingInvoiceInput,
): Promise<BillingInvoiceDto> {
  const record = await tx.paymentRecord.findUnique({
    where: { id: input.paymentId },
    select: MINT_PAYMENT_SELECT,
  });
  if (!record) {
    throw new ValidationError("Payment record not found");
  }
  if (record.status !== "VERIFIED") {
    throw new ValidationError(
      "Cannot issue a billing invoice for an unverified payment",
    );
  }

  // Idempotency: one invoice per PaymentRecord row (also backed by @@unique).
  const existing = await tx.billingInvoice.findUnique({
    where: { paymentId: record.id },
  });
  if (existing) {
    return toBillingInvoiceDto(existing);
  }

  if (!record.orderId) {
    throw new ValidationError("Cannot issue a billing invoice without an order id");
  }

  const business = await tx.business.findUnique({
    where: { id: record.businessId },
  });
  if (!business) {
    throw new ValidationError("Business profile not found");
  }

  const fiscalYearLabel = fiscalYearLabelFor(input.paymentDate);
  await ensureBillingSequence(tx, fiscalYearLabel);
  const invoiceNumber = await allocateBillingNumber(tx, fiscalYearLabel);

  // Amounts COPIED VERBATIM from the stored (verified) payment record.
  const created = await tx.billingInvoice.create({
    data: {
      businessId: record.businessId,
      paymentId: record.id,
      subscriptionId: input.subscriptionId,
      invoiceNumber,
      invoiceDate: new Date(),
      paymentDate: input.paymentDate,
      billingPeriod: record.billingPeriod,
      planId: record.planId,
      planName: record.planName,
      baseAmount: record.baseAmount,
      gstRate: record.gstRate,
      gstAmount: record.gstAmount,
      totalAmount: record.totalAmount,
      currency: record.currency,
      orderId: record.orderId,
      paymentMethod: input.paymentMethod,
      supplierSnapshot: buildSupplierSnapshot() as Prisma.InputJsonValue,
      customerSnapshot: buildCustomerSnapshot(business) as Prisma.InputJsonValue,
    },
  });

  return toBillingInvoiceDto(created);
}