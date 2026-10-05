// Step 5D — Platform Admin subscription READ service (admin backend surface).
//
// BOUNDARY: strict READ-ONLY. There is deliberately no PATCH/POST/DELETE here —
// subscription lifecycle (activation, expiry, cancellation, renewal) is owned
// by the existing billing/webhook services, and mutation will NEVER be bolted
// onto a read DTO. Nothing in this module creates, updates, or deletes rows.
//
// AUTHORIZATION (server-side, resolved from the session at every call):
//   - anonymous                        -> 401 (requireUser inside the gate)
//   - signed-in non-admin              -> 403 (ForbiddenError)
//   - SUPPORT_ADMIN / SUPER_ADMIN      -> 200 (requirePlatformAdminRole gate;
//                                        the browser-supplied role is NEVER
//                                        trusted — identity comes from the
//                                        Better Auth session + platform_admin)
//
// RETURNED DATA. Every field is chosen to avoid leaking anything that lives
// outside the subscription/payment billing domain:
//   - Subscription rows: the raw stored fields the Admin UI needs plus the
//     EFFECTIVE lifecycle verdict computed server-side (see below). Never
//     `razorpaySubscriptionId`, never `planSnapshot`, never account/session/
//     user records.
//   - Business: only id + name.
//   - Plan: only id + name (resolved from plan_catalog via the FK; the plan is
//     never deleted while referenced — onDelete: Restrict).
//   - Payments: the same safe billing fields already shown in the customer's
//     own billing history (ids, plan label, 2dp money strings, status, provider
//     order/payment references, description, timestamp). NEVER amounts beyond
//     those, NEVER the razorpayEventId, NEVER webhook payloads.
//   - Invoices: number/dates/amounts/label only — the business identity
//     snapshots (supplierSnapshot/customerSnapshot) are EXCLUDED.
//   - Subscription events: ONLY id/type/createdAt — the raw payload JSON is
//     never returned.
//
// EFFECTIVE LIFECYCLE (the API uses the existing shared helper, never a raw
// status guess). For every row the verdict comes from
// `computeSubscriptionLifecycle(renewsAt, server-now)`:
//   - rawStatus ACTIVE with a paid period still running (before renewsAt's
//     calendar day ends)        -> effectiveStatus ACTIVE, effectivePlan = paid
//   - rawStatus ACTIVE but now inside the 3-day grace window
//                               -> effectiveStatus GRACE_PERIOD, effectivePlan
//                                  stays PAID, renewalRequired = true
//   - rawStatus ACTIVE but now past grace
//                               -> effectiveStatus EXPIRED, effectivePlan =
//                                  FREE (the raw row is left untouched — expiry
//                                  is derived on every read, never a mutation)
//   - any non-ACTIVE raw status (PENDING/SUSPENDED/CANCELLED/EXPIRED)
//                               -> effectiveStatus = rawStatus, effectivePlan =
//                                  FREE (no paid period is pending or governing)
//   - missing/unknown renewsAt on an ACTIVE row -> ACTIVE (no expiry computable;
//     paid access preserved, exactly like the customer subscription DTO), unless
//     startedAt+period lets us derive renewsAt (30/365-day rule used by the
//     customer subscription service).
// This means a raw ACTIVE row with an elapsed period is NEVER treated as paid
// merely because status=ACTIVE — the stored dates vs the SERVER clock decide.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  computeSubscriptionLifecycle,
  FREE_PLAN_ID,
} from "@/lib/plans";
import { ResourceNotFoundError } from "@/lib/business/api-error";
import { requirePlatformAdminRole } from "@/lib/directory/directory-admin-service";
import { moneyString } from "@/lib/billing/calculator";
import { ADMIN_LIST_MAX_ROWS } from "@/lib/admin/admin-list-bounds";

/** One BUSINESS-month or business-year of subscription time, in days (mirrors
 * the customer `subscription-service` rule used to derive a missing renewsAt). */
const RENEWAL_DAYS: Record<string, number> = { month: 30, year: 365 };

interface SubscriptionRow {
  id: string;
  businessId: string;
  planId: string;
  status: string;
  period: string;
  startedAt: Date | null;
  renewsAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  business: { id: string; name: string } | null;
  plan: { id: string; name: string } | null;
}

const SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  planId: true,
  status: true,
  period: true,
  startedAt: true,
  renewsAt: true,
  endedAt: true,
  createdAt: true,
  business: { select: { id: true, name: true } },
  plan: { select: { id: true, name: true } },
} as const satisfies Prisma.BusinessSubscriptionSelect;

const ISO = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** Stored renewsAt, derived from startedAt + period when missing (30/365-day
 * rule, matching the customer subscription DTO so both seams agree). */
function resolveRenewsAt(row: {
  period: string;
  startedAt: Date | null;
  renewsAt: Date | null;
}): Date | null {
  if (row.renewsAt) return row.renewsAt;
  if (!row.startedAt) return null;
  const days = RENEWAL_DAYS[row.period] ?? RENEWAL_DAYS.month;
  return new Date(row.startedAt.getTime() + days * 86400000);
}

interface EffectiveVerdict {
  status: string;
  effectivePlanId: string;
  graceStartsAt: Date | null;
  graceEndsAt: Date | null;
  renewalRequired: boolean;
}

/**
 * Effective lifecycle for one subscription row, server-authoritative. Uses the
 * shared `computeSubscriptionLifecycle` helper (never a raw status guess) with
 * the SERVER clock; `now` is injectable ONLY for deterministic tests.
 */
export function deriveEffectiveVerdict(
  row: Pick<SubscriptionRow, "status" | "period" | "startedAt" | "renewsAt" | "planId">,
  now: Date = new Date(),
): EffectiveVerdict {
  if (row.status !== "ACTIVE") {
    // No paid period is pending (PENDING) or governing (SUSPENDED/CANCELLED/
    // EXPIRED) — access is FREE in every case. effectiveStatus mirrors the raw
    // lifecycle truth of the row.
    return {
      status: row.status,
      effectivePlanId: FREE_PLAN_ID,
      graceStartsAt: null,
      graceEndsAt: null,
      renewalRequired: false,
    };
  }
  const lifecycle = computeSubscriptionLifecycle(resolveRenewsAt(row), now);
  return {
    status: lifecycle.status,
    effectivePlanId:
      lifecycle.status === "EXPIRED" ? FREE_PLAN_ID : row.planId,
    graceStartsAt: lifecycle.graceStartsAt,
    graceEndsAt: lifecycle.graceEndsAt,
    renewalRequired: lifecycle.renewalRequired,
  };
}

/** Safe subscription record for the Admin UI (raw + effective lifecycle + the
 * minimal business/plan identity). */
export interface AdminSubscriptionDto {
  id: string;
  businessId: string;
  planId: string;
  rawStatus: string;
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
  endedAt: string | null;
  createdAt: string;
  effectiveStatus: string;
  effectivePlanId: string;
  graceStartsAt: string | null;
  graceEndsAt: string | null;
  renewalRequired: boolean;
  business: { id: string; name: string };
  plan: { id: string; name: string };
}

function toSubscriptionDto(row: SubscriptionRow): AdminSubscriptionDto {
  const verdict = deriveEffectiveVerdict(row);
  return {
    id: row.id,
    businessId: row.businessId,
    planId: row.planId,
    rawStatus: row.status,
    period: row.period,
    startedAt: ISO(row.startedAt),
    renewsAt: ISO(resolveRenewsAt(row)),
    endedAt: ISO(row.endedAt),
    createdAt: row.createdAt.toISOString(),
    effectiveStatus: verdict.status,
    effectivePlanId: verdict.effectivePlanId,
    graceStartsAt: ISO(verdict.graceStartsAt),
    graceEndsAt: ISO(verdict.graceEndsAt),
    renewalRequired: verdict.renewalRequired,
    business: {
      id: row.business?.id ?? row.businessId,
      name: row.business?.name ?? row.businessId,
    },
    plan: { id: row.plan?.id ?? row.planId, name: row.plan?.name ?? row.planId },
  };
}

/**
 * GET /api/admin/subscriptions — every subscription row across businesses,
 * newest first (createdAt DESC, id ASC for full determinism). SUPPORT_ADMIN and
 * SUPER_ADMIN may read; anonymous -> 401; signed-in non-admin -> 403; roles
 * come from the server session + platform_admin row, never the request.
 *
 * PAGINATION: deliberately none (task constraint) — no offset/cursor, no
 * response-shape change. The query IS bounded by ADMIN_LIST_MAX_ROWS purely so
 * a single read cannot materialize the whole table; see admin-list-bounds.ts.
 */
export async function listAdminSubscriptions(): Promise<AdminSubscriptionDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

      const rows = await prisma.businessSubscription.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: ADMIN_LIST_MAX_ROWS,
        select: SUBSCRIPTION_SELECT,
      });

  return rows.map(toSubscriptionDto);
}

/** Safe payment-record fields, exactly the ones already surfaced by the
 * customer's own billing history. Money is 2dp strings; provider-internal ids
 * (razorpayEventId) and webhook payloads are never included. */
export interface AdminSubscriptionPaymentDto {
  id: string;
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
}

/** Safe billing-invoice fields for the Admin subscription detail (number,
 * dates, plan label, 2dp amounts). Identity snapshots are excluded. */
export interface AdminSubscriptionInvoiceDto {
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
  createdAt: string;
}

/** Subscription event — id/type/createdAt ONLY. The raw payload JSON (which may
 * carry provider details) is never returned. */
export interface AdminSubscriptionEventDto {
  id: string;
  type: string;
  createdAt: string;
}

/** Detail: the subscription record + safe related history. */
export interface AdminSubscriptionDetailDto extends AdminSubscriptionDto {
  payments: AdminSubscriptionPaymentDto[];
  invoices: AdminSubscriptionInvoiceDto[];
  events: AdminSubscriptionEventDto[];
}

/**
 * GET /api/admin/subscriptions/[id] — one subscription + safe payment/invoice/
 * event history (newest first). Unknown subscription id -> 404. Reads only; no
 * payment/customer/user/session/provider data beyond the safe DTOs above.
 */
export async function getAdminSubscriptionDetail(
  idInput: string,
): Promise<AdminSubscriptionDetailDto> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  if (!idInput) throw new ResourceNotFoundError("Subscription not found");

  const row = await prisma.businessSubscription.findUnique({
    where: { id: idInput },
    select: SUBSCRIPTION_SELECT,
  });
  if (!row) throw new ResourceNotFoundError("Subscription not found");

  const [payments, invoices, events] = await Promise.all([
        prisma.paymentRecord.findMany({
          where: { subscriptionId: row.id },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: ADMIN_LIST_MAX_ROWS,
        }),
        prisma.billingInvoice.findMany({
          where: { subscriptionId: row.id },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: ADMIN_LIST_MAX_ROWS,
        }),
        prisma.subscriptionEvent.findMany({
          where: { subscriptionId: row.id },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: ADMIN_LIST_MAX_ROWS,
          select: { id: true, type: true, createdAt: true },
        }),
  ]);

  return {
    ...toSubscriptionDto(row),
    payments: payments.map((p) => ({
      id: p.id,
      planId: p.planId,
      planName: p.planName,
      billingPeriod: p.billingPeriod,
      baseAmount: moneyString(p.baseAmount),
      gstRate: moneyString(p.gstRate),
      gstAmount: moneyString(p.gstAmount),
      totalAmount: moneyString(p.totalAmount),
      status: p.status,
      orderId: p.orderId,
      paymentId: p.paymentId,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate.toISOString(),
      paymentDate: i.paymentDate.toISOString(),
      billingPeriod: i.billingPeriod,
      planId: i.planId,
      planName: i.planName,
      baseAmount: moneyString(i.baseAmount),
      gstRate: moneyString(i.gstRate),
      gstAmount: moneyString(i.gstAmount),
      totalAmount: moneyString(i.totalAmount),
      currency: i.currency,
      orderId: i.orderId,
      paymentMethod: i.paymentMethod,
      createdAt: i.createdAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}