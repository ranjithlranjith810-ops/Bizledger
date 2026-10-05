// Step 8 — Platform Admin PAYMENT read service (admin backend surface).
//
// BOUNDARY: strict READ-ONLY. There is deliberately no create/update/refund
// export — payment/webhook behavior is owned by the billing services, and a
// mutation/refund endpoint will NEVER be bolted onto a read DTO. Nothing in
// this module mints, updates, or deletes rows.
//
// AUTHORIZATION (server-side, resolved from the session at every call):
//   - anonymous                        -> 401 (requireUser inside the gate)
//   - signed-in non-admin              -> 403 (ForbiddenError)
//   - SUPPORT_ADMIN / SUPER_ADMIN      -> 200 (requirePlatformAdminRole gate;
//                                        the browser-supplied role is NEVER
//                                        trusted — identity comes from the
//                                        Better Auth session + platform_admin)
//
// FINANCIAL AUTHORITY. PaymentRecord is the historical financial authority:
//   - amounts are read VERBATIM from the stored PaymentRecord row and
//     serialized with the shared `moneyString` 2dp convention — NEVER
//     recalculated, NEVER re-derived from PlanCatalog. A later catalog price
//     change or plan deactivation cannot alter what was actually charged.
//   - historical planName is read from the stored PaymentRecord.planName value
//     (the plan label captured at payment time), so a removed/inactive catalog
//     entry stays fully readable.
//   - payment `status` is returned from PaymentRecord.status (the stored
//     attempt truth), never inferred from subscription status.
//
// RETURNED DATA. Platform admins may read payments, but ONLY the safe
// operational surface the billing history already shows:
//   - the payment fields listed below (id/identity link/plan label/period/
//     money/status/provider order+payment refs/createdAt), plus
//   - when a BillingInvoice exists for the payment, four and only four invoice
//     identity/dates fields (billingInvoiceId/invoiceNumber/invoiceDate/
//     paymentDate). Identity snapshots and invoice amounts are excluded.
//   - NEVER: webhook payloads, razorpaySubscriptionId, razorpayEventId,
//     credentials/secrets, user/session/account records, planSnapshot,
//     supplier/customer snapshots, raw provider payloads, or internal fields
//     (method/currency not in the surfaced surface, updatedAt, DTO-internal
//     database plumbing).

import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { moneyString } from "@/lib/billing/calculator";
import { ResourceNotFoundError } from "@/lib/business/api-error";
import { requirePlatformAdminRole } from "@/lib/directory/directory-admin-service";
import { ADMIN_LIST_MAX_ROWS } from "@/lib/admin/admin-list-bounds";

/** Safe operational fields stored on every PaymentRecord (the customer's own
 * billing history surface) — never provider-internal/webhook/snapshot data. */
const PAYMENT_SELECT = {
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
  status: true,
  orderId: true,
  paymentId: true,
  description: true,
  createdAt: true,
  business: { select: { name: true } },
  billingInvoice: {
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      paymentDate: true,
    },
  },
} as const satisfies Prisma.PaymentRecordSelect;

type PaymentRow = {
  id: string;
  businessId: string;
  subscriptionId: string | null;
  planId: string;
  planName: string;
  billingPeriod: string;
  baseAmount: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  status: string;
  orderId: string | null;
  paymentId: string | null;
  description: string | null;
  createdAt: Date;
  business: { name: string };
  billingInvoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    paymentDate: Date;
  } | null;
};

/**
 * One safe payment DTO. Money is the exact stored Decimal serialized to the
 * billing 2dp string convention (historical authority, never PlanCatalog);
 * `status` is the stored PaymentRecord attempt truth. When the payment has a
 * billing invoice, exactly billingInvoiceId/invoiceNumber/invoiceDate/
 * paymentDate are surfaced — snapshot/provider data never is.
 */
export interface AdminPaymentDto {
  id: string;
  businessId: string;
  businessName: string;
  subscriptionId: string | null;
  planId: string;
  planName: string;
  billingPeriod: string;
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  status: string;
  orderId: string | null;
  paymentId: string | null;
  description: string | null;
  createdAt: string;
  billingInvoiceId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  paymentDate: string | null;
}

function toPaymentDto(row: PaymentRow): AdminPaymentDto {
  return {
    id: row.id,
    businessId: row.businessId,
    businessName: row.business.name,
    subscriptionId: row.subscriptionId,
    planId: row.planId,
    planName: row.planName,
    billingPeriod: row.billingPeriod,
    baseAmount: moneyString(row.baseAmount),
    gstRate: moneyString(row.gstRate),
    gstAmount: moneyString(row.gstAmount),
    totalAmount: moneyString(row.totalAmount),
    status: row.status,
    orderId: row.orderId,
    paymentId: row.paymentId,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    billingInvoiceId: row.billingInvoice?.id ?? null,
    invoiceNumber: row.billingInvoice?.invoiceNumber ?? null,
    invoiceDate: row.billingInvoice ? row.billingInvoice.invoiceDate.toISOString() : null,
    paymentDate: row.billingInvoice ? row.billingInvoice.paymentDate.toISOString() : null,
  };
}

/**
 * GET /api/admin/payments — every payment record across businesses, newest
 * first (createdAt DESC, id ASC for full determinism). SUPPORT_ADMIN and
 * SUPER_ADMIN may read; anonymous -> 401; signed-in non-admin -> 403; roles
 * come from the server session + platform_admin row, never the request.
 *
 * PAGINATION: deliberately none (task constraint) — no offset/cursor, no
 * response-shape change. This append-only financial table is expected to grow
 * unboundedly, so the read is bounded by ADMIN_LIST_MAX_ROWS rather than left
 * open-ended; see admin-list-bounds.ts.
 */
export async function listAdminPayments(): Promise<AdminPaymentDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

      const rows = await prisma.paymentRecord.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: ADMIN_LIST_MAX_ROWS,
        select: PAYMENT_SELECT,
      });

  return rows.map(toPaymentDto);
}

/**
 * GET /api/admin/payments/[id] — one payment record with its safe detail.
 * Unknown payment id -> 404. Strictly read-only; the same financial-authority
 * rules as the list apply (amounts verbatim from PaymentRecord, status from
 * PaymentRecord, historical plan label from PaymentRecord).
 */
export async function getAdminPaymentDetail(
  idInput: string,
): Promise<AdminPaymentDto> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  if (!idInput) throw new ResourceNotFoundError("Payment not found");

  const row = await prisma.paymentRecord.findUnique({
    where: { id: idInput },
    select: PAYMENT_SELECT,
  });
  if (!row) throw new ResourceNotFoundError("Payment not found");

  return toPaymentDto(row);
}