// Step 7 — Platform Admin BUSINESS read service (admin backend surface).
//
// BOUNDARY: strict READ-ONLY. There is deliberately no POST/PATCH/DELETE here —
// business/member management and subscription mutation are owned by their own
// services, and mutation will NEVER be bolted onto a read DTO. Nothing in this
// module creates, updates, or deletes rows.
//
// AUTHORIZATION (server-side, resolved from the session at every call):
//   - anonymous                        -> 401 (requireUser inside the gate)
//   - signed-in non-admin              -> 403 (ForbiddenError)
//   - SUPPORT_ADMIN / SUPER_ADMIN      -> 200 (requirePlatformAdminRole gate;
//                                        the browser-supplied role is NEVER
//                                        trusted — identity comes from the
//                                        Better Auth session + platform_admin)
//
// RETURNED DATA. Platform admins may read businesses, but ONLY the safe
// operational surface the Admin UI needs — never entire customer records:
//   - List: id/name/status/createdAt, active-branch + member COUNTS (no member
//     rows, no permission JSON), and the EFFECTIVE subscription summary (see
//     below). No profile contact fields, no user/session/account data.
//   - Detail: the business's basic registered identity/profile fields (which
//     the Admin console already renders today), safe aggregate counts, an
//     effective-subscription summary, and the recent safe payment history
//     (the same billing fields the customer's own billing history shows).
//   - NEVER: passwords, tokens, sessions/accounts, the full BusinessMember
//     permission JSON, customer master-data content, payment provider secrets
//     (razorpayEventId/webhook payloads), or subscription `planSnapshot`.
//
// EFFECTIVE SUBSCRIPTION (the API uses the existing server-side lifecycle
// logic via `deriveEffectiveVerdict`, never a raw status guess — same as the
// subscriptions admin view):
//   - The governing row is the business's single ACTIVE-or-PENDING
//     subscription (the partial unique index guarantees at most one) — the
//     row carrying the paid-period timeline.
//   - With none, the most recent historical row (CANCELLED/EXPIRED/SUSPENDED)
//     is summarized so Admin sees the true subscription state.
//   - With no subscription rows at all, the business is on the FREE base plan:
//     effectivePlanId = base, effectiveSubscriptionStatus = null.
//   - A raw ACTIVE row past grace -> EXPIRED + FREE (derived on read, no
//     mutation); in grace -> GRACE_PERIOD with the paid plan still governing.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { FREE_PLAN_ID } from "@/lib/plans";
import { ResourceNotFoundError, ValidationError, ConflictError } from "@/lib/business/api-error";
import { requirePlatformAdminRole } from "@/lib/directory/directory-admin-service";
import { moneyString } from "@/lib/billing/calculator";
import { ADMIN_LIST_MAX_ROWS } from "@/lib/admin/admin-list-bounds";
import {
  deriveEffectiveVerdict,
  type AdminSubscriptionPaymentDto,
} from "@/lib/admin/admin-subscriptions-service";
import {
  writePlatformAdminLog,
  MAX_REASON_LENGTH,
} from "@/lib/admin/admin-audit-service";

/** One BUSINESS-month or business-year of subscription time, in days (mirrors
 * the customer `subscription-service` rule used to derive a missing renewsAt —
 * display-only, never written back). */
const RENEWAL_DAYS: Record<string, number> = { month: 30, year: 365 };

const ISO = (date: Date | null): string | null => (date ? date.toISOString() : null);

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
  plan: { select: { id: true, name: true } },
} as const satisfies Prisma.BusinessSubscriptionSelect;

/** Stored renewsAt, derived from startedAt + period when missing (30/365-day
 * rule — display-only, matching the customer subscription DTO). */
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

/**
 * The ONE subscription that governs a business's effective state:
 *   - the single ACTIVE-or-PENDING row (partial unique index allows at most
 *     one; it carries the paid-period timeline), else
 *   - the most recent historical row (CANCELLED/EXPIRED/SUSPENDED), else
 *   - null when the business has no subscription records at all (FREE base).
 */
function governingSubscription(rows: SubscriptionRow[]): SubscriptionRow | null {
  if (rows.length === 0) return null;
  const activeOrPending = rows.find(
    (r) => r.status === "ACTIVE" || r.status === "PENDING",
  );
  if (activeOrPending) return activeOrPending;
  return rows.reduce((a, b) =>
    a.createdAt.getTime() > b.createdAt.getTime()
      ? a
      : a.createdAt.getTime() < b.createdAt.getTime()
        ? b
        : a.id < b.id
          ? a
          : b,
  );
}

/** Safe, operational business row for the Admin list — counts only, no member
 * rows, no profile content beyond identity, no subscription internals. */
export interface AdminBusinessDto {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  activeBranchCount: number;
  memberCount: number;
  /** Raw stored status of the governing subscription (null when none). */
  subscriptionStatus: string | null;
  /** Server-derived lifecycle status (ACTIVE/GRACE_PERIOD/EXPIRED or the raw
   * PENDING/CANCELLED/SUSPENDED/EXPIRED truth; null when no subscription row). */
  effectiveSubscriptionStatus: string | null;
  /** The plan governing entitlements right now (base when no paid period). */
  effectivePlanId: string;
  effectivePlanName: string;
  renewsAt: string | null;
  graceEndsAt: string | null;
  renewalRequired: boolean;
}

/**
 * GET /api/admin/businesses — every business, newest first (createdAt DESC,
 * id ASC for deterministic order). SUPPORT_ADMIN and SUPER_ADMIN may read;
 * anonymous -> 401; signed-in non-admin -> 403; roles come from the server
 * session + platform_admin row, never the request. Read-only.
 */
export async function listAdminBusinesses(): Promise<AdminBusinessDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  const [businesses, subscriptions, plans] = await Promise.all([
      prisma.business.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: ADMIN_LIST_MAX_ROWS,
        select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            branches: { where: { isActive: true } },
          },
        },
      },
    }),
        prisma.businessSubscription.findMany({
          select: SUBSCRIPTION_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: ADMIN_LIST_MAX_ROWS,
        }),
    prisma.planCatalog.findMany({ select: { id: true, name: true } }),
  ]);

  const planNameById = new Map(plans.map((p) => [p.id, p.name]));
  const subscriptionsByBusiness = new Map<string, SubscriptionRow[]>();
  for (const s of subscriptions) {
    const list = subscriptionsByBusiness.get(s.businessId);
    if (list) list.push(s);
    else subscriptionsByBusiness.set(s.businessId, [s]);
  }

  return businesses.map((b) => {
    const gov = governingSubscription(subscriptionsByBusiness.get(b.id) ?? []);
    const verdict = gov ? deriveEffectiveVerdict(gov) : null;
    const effectivePlanId = gov && verdict ? verdict.effectivePlanId : FREE_PLAN_ID;
    return {
      id: b.id,
      name: b.name,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      activeBranchCount: b._count.branches,
      memberCount: b._count.memberships,
      subscriptionStatus: gov ? gov.status : null,
      effectiveSubscriptionStatus: gov && verdict ? verdict.status : null,
      effectivePlanId,
      effectivePlanName: planNameById.get(effectivePlanId) ?? effectivePlanId,
      renewsAt: gov ? ISO(resolveRenewsAt(gov)) : null,
      graceEndsAt: gov && verdict ? ISO(verdict.graceEndsAt) : null,
      renewalRequired: gov && verdict ? verdict.renewalRequired : false,
    };
  });
}

/** Effective-subscription summary embedded in the business detail — safe raw
 * fields + the server-derived lifecycle verdict + plan names. */
export interface AdminBusinessSubscriptionSummaryDto {
  id: string;
  planId: string;
  planName: string;
  rawStatus: string;
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
  endedAt: string | null;
  effectiveStatus: string;
  effectivePlanId: string;
  effectivePlanName: string;
  graceStartsAt: string | null;
  graceEndsAt: string | null;
  renewalRequired: boolean;
}

/** Business detail — registered identity/profile fields (already rendered by
 * the Admin console today), safe aggregate counts, effective-subscription
 * summary, and recent safe payments. Never entire customer/user records. */
export interface AdminBusinessDetailDto {
  id: string;
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
  country: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  subscription: AdminBusinessSubscriptionSummaryDto | null;
  members: { total: number; active: number };
  branches: { total: number; active: number };
  /** Safe counts only — never the underlying customer master-data content. */
  usage: {
    customers: number;
    products: number;
    invoices: number;
    expenses: number;
  };
  /** Most recent payments, same safe billing fields as the customer's own
   * billing history and the admin subscription detail. */
  payments: AdminSubscriptionPaymentDto[];
}

/**
 * GET /api/admin/businesses/[id] — one business with safe detail. Unknown
 * business id -> 404. Reads only; no payment/customer/user/session/provider
 * data beyond the safe DTOs above.
 */
export async function getAdminBusinessDetail(
  idInput: string,
): Promise<AdminBusinessDetailDto> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  if (!idInput) throw new ResourceNotFoundError("Business not found");

  const business = await prisma.business.findUnique({
    where: { id: idInput },
    select: {
      id: true,
      name: true,
      legalName: true,
      email: true,
      phone: true,
      gstin: true,
      gstRegistered: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      stateCode: true,
      pincode: true,
      country: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { memberships: true, branches: true } },
    },
  });
  if (!business) throw new ResourceNotFoundError("Business not found");

  const [subscriptions, plans, activeMembers, activeBranches, customers, products, invoices, expenses, payments] =
    await Promise.all([
          prisma.businessSubscription.findMany({
            where: { businessId: idInput },
            select: SUBSCRIPTION_SELECT,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: ADMIN_LIST_MAX_ROWS,
          }),
      prisma.planCatalog.findMany({ select: { id: true, name: true } }),
      prisma.businessMember.count({
        where: { businessId: idInput, status: "ACTIVE" },
      }),
      prisma.branch.count({ where: { businessId: idInput, isActive: true } }),
      prisma.customer.count({ where: { businessId: idInput } }),
      prisma.product.count({ where: { businessId: idInput } }),
      prisma.invoice.count({ where: { businessId: idInput } }),
      prisma.expense.count({ where: { businessId: idInput } }),
      prisma.paymentRecord.findMany({
        where: { businessId: idInput },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 20,
      }),
    ]);

  const planNameById = new Map(plans.map((p) => [p.id, p.name]));
  const gov = governingSubscription(subscriptions);
  const verdict = gov ? deriveEffectiveVerdict(gov) : null;
  const effectivePlanId = gov && verdict ? verdict.effectivePlanId : FREE_PLAN_ID;
  const planNameOf = (planId: string, row?: SubscriptionRow | null): string =>
    row?.plan?.name ?? planNameById.get(planId) ?? planId;

  return {
    id: business.id,
    name: business.name,
    legalName: business.legalName,
    email: business.email,
    phone: business.phone,
    gstin: business.gstin,
    gstRegistered: business.gstRegistered,
    addressLine1: business.addressLine1,
    addressLine2: business.addressLine2,
    city: business.city,
    state: business.state,
    stateCode: business.stateCode,
    pincode: business.pincode,
    country: business.country,
    status: business.status,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
    subscription: gov && verdict
      ? {
          id: gov.id,
          planId: gov.planId,
          planName: planNameOf(gov.planId, gov),
          rawStatus: gov.status,
          period: gov.period,
          startedAt: ISO(gov.startedAt),
          renewsAt: ISO(resolveRenewsAt(gov)),
          endedAt: ISO(gov.endedAt),
          effectiveStatus: verdict.status,
          effectivePlanId: verdict.effectivePlanId,
          effectivePlanName: planNameById.get(verdict.effectivePlanId) ?? verdict.effectivePlanId,
          graceStartsAt: ISO(verdict.graceStartsAt),
          graceEndsAt: ISO(verdict.graceEndsAt),
          renewalRequired: verdict.renewalRequired,
        }
      : null,
    members: { total: business._count.memberships, active: activeMembers },
    branches: { total: business._count.branches, active: activeBranches },
    usage: { customers, products, invoices, expenses },
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
  };
}

/* -------------------------------------------------------------------------- */
/*  Phase 9A — Business Suspend / Reactivate (SUPER_ADMIN only)               */
/* -------------------------------------------------------------------------- */

export interface AdminBusinessStatusChangeDto {
  business: { id: string; name: string; status: string };
  audit: { id: string; action: string; targetType: string; targetId: string; reason: string | null; createdAt: string };
}

function parseReason(reasonInput: unknown, verb: string): string {
  if (typeof reasonInput !== "string" || reasonInput.trim().length === 0) {
    throw new ValidationError(`${verb} requires a reason`);
  }
  const trimmed = reasonInput.trim();
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new ValidationError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`);
  }
  return trimmed;
}

async function transitionBusinessStatus(
  idInput: string,
  reasonInput: unknown,
  action: "BUSINESS_SUSPEND" | "BUSINESS_REACTIVATE",
  fromStatus: "ACTIVE" | "SUSPENDED",
  toStatus: "ACTIVE" | "SUSPENDED",
  verb: string,
): Promise<AdminBusinessStatusChangeDto> {
  await requirePlatformAdminRole("SUPER_ADMIN");

  const reason = parseReason(reasonInput, verb);
  if (!idInput) throw new ResourceNotFoundError("Business not found");

  const business = await prisma.business.findUnique({
    where: { id: idInput },
    select: { id: true, name: true, status: true, updatedAt: true },
  });
  if (!business) throw new ResourceNotFoundError("Business not found");

  if (business.status !== fromStatus) {
    throw new ConflictError(
      action === "BUSINESS_SUSPEND"
        ? "Business is already suspended or not active"
        : "Business is already active",
    );
  }

  const before = { status: business.status, updatedAt: business.updatedAt.toISOString() };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.business.update({
      where: { id: business.id },
      data: { status: toStatus },
      select: { id: true, name: true, status: true, updatedAt: true },
    });

    // F1: keep the public directory in lock-step with tenant status. A
    // suspension immediately takes any directory listing off the public
    // directory (SUSPENDED, isListed=false) inside the SAME transaction as
    // the business change — a suspended business can never surface a listing
    // even between the status flip and the next moderation sweep. Public
    // directory queries also gate on business.status=ACTIVE as defense in
    // depth. Reactivation does NOT auto-republish: the owner must resubmit
    // (or the moderator must explicitly restore) the listing.
    if (toStatus === "SUSPENDED") {
      await tx.businessDirectoryProfile.updateMany({
        where: { businessId: updated.id, status: { not: "SUSPENDED" } },
        data: { status: "SUSPENDED", isListed: false },
      });
    }

    const audit = await writePlatformAdminLog(
      {
        action,
        targetType: "business",
        targetId: updated.id,
        reason,
        before,
        after: { status: updated.status, updatedAt: updated.updatedAt.toISOString() },
      },
      { tx, minRole: "SUPER_ADMIN" },
    );

    return {
      business: { id: updated.id, name: updated.name, status: updated.status },
      audit: { id: audit.id, action: audit.action, targetType: audit.targetType, targetId: audit.targetId, reason: audit.reason, createdAt: audit.createdAt.toISOString() },
    };
  });

  return result;
}

/**
 * POST /api/admin/businesses/[id]/suspend — SUPER_ADMIN only. Mutates
 * business.status from ACTIVE to SUSPENDED. The audit row is written inside
 * the same DB transaction as the business update; on audit failure the
 * business change rolls back. Idempotent: already SUSPENDED → safe 409.
 */
export async function suspendAdminBusiness(
  id: string,
  reason: unknown,
): Promise<AdminBusinessStatusChangeDto> {
  return transitionBusinessStatus(id, reason, "BUSINESS_SUSPEND", "ACTIVE", "SUSPENDED", "Suspending");
}

/**
 * POST /api/admin/businesses/[id]/reactivate — SUPER_ADMIN only. Mutates
 * business.status from SUSPENDED to ACTIVE. Same atomic audit contract as
 * suspend. Idempotent: already ACTIVE → safe 409.
 */
export async function reactivateAdminBusiness(
  id: string,
  reason: unknown,
): Promise<AdminBusinessStatusChangeDto> {
  return transitionBusinessStatus(id, reason, "BUSINESS_REACTIVATE", "SUSPENDED", "ACTIVE", "Reactivating");
}