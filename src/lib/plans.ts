// CANONICAL plan-catalog & entitlement-source module (Phase 1).
//
// This is the SINGLE source of truth for plan definitions and limit resolution
// across the app (pricing, billing, entitlement engine, usage gauges, upgrade
// banners, feature gates). Do NOT define limits inline at call sites — read the
// effective plan + limits from here and from `entitlements.ts`.
//
// ADMIN-AUTHORITATIVE MODEL:
//   Plan *limits* are defined by the platform (mirroring the BizLedger admin
//   console catalog) and are never user-editable at runtime. The per-account
//   lever is only `SubscriptionState.currentPlanId`, which is set through the
//   subscription/checkout flow (owner/admin controlled) — a user cannot hand-
//   edit plan limits in localStorage.
//
// BACKEND SEAM:
//   This module is deliberately isolated so a future backend can replace the
//   local catalog with a server-fetched one. `fetchPlanCatalog()` is the single
//   integration point — swap its body for a real API call (PostgreSQL/Supabase
//   in the backend phase) without touching call sites.

import {
  SubscriptionPlan,
  SubscriptionState,
  SubscriptionPlanId,
  EntitlementLimitKind,
} from "@/types";

// ---------------------------------------------------------------------------
// Backend seam: how plans are obtained at runtime.
// ---------------------------------------------------------------------------

// Local canonical catalog. Mirrors the admin console's shipped plan set. In the
// backend phase this is replaced by `fetchPlanCatalog()` reading from the API,
// which is where administrator-customized limits would arrive from.
export const PLAN_CATALOG: SubscriptionPlan[] = [
  {
    id: "base",
    name: "Free Plan",
    price: 0,
    period: "month",
    description: "Perfect for single retail shops, freelancers, and micro-enterprises getting started.",
    features: [
      "Up to 2 Customers",
      "Up to 5 Products & Inventory",
      "5 Invoices / Bills per month",
      "5 Estimates, Quotations & Purchase Orders per month",
      "Basic GST Invoicing",
      "Basic Inventory",
      "PDF Invoices",
      "Basic Reports",
      "Basic Payment Tracking",
    ],
    businessNetworkIncluded: false,
    limits: {
      customers: 2,
      teamMembers: 0,
      products: 5,
      invoicesPerMonth: 5,
      // Estimates / quotations / Purchase Orders track the SAME monthly ceiling
      // as invoices (pricing policy), each as its own separate counter.
      estimatesPerMonth: 5,
      quotationsPerMonth: 5,
      purchaseOrdersPerMonth: 5,
      directoryListings: 0,
    },
  },
  {
    id: "business",
    name: "Business Plan",
    price: 999,
    period: "month",
    popular: true,
    description: "For growing businesses, manufacturing units, and fleet operators.",
    features: [
      "Exactly 3 Team Members",
      "More Customers & Products than Free",
      "Advanced Inventory & Multi-unit",
      "GST Invoicing, Bills & Purchase Management",
      "Payroll & Vehicle Fleet Management",
      "Advanced Reports & Analytics",
      "WhatsApp Sharing & Payment Tracking",
      "Business Network (Directory Listing)",
    ],
    businessNetworkIncluded: true,
    limits: {
      customers: 150,
      teamMembers: 3,
      products: 500,
      invoicesPerMonth: "Unlimited",
      estimatesPerMonth: "Unlimited",
      quotationsPerMonth: "Unlimited",
      purchaseOrdersPerMonth: "Unlimited",
      directoryListings: 1,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise Plan",
    price: 1999,
    period: "month",
    description: "For established multi-branch firms and large supply chain distributors.",
    features: [
      "Unlimited Users & Multi-branch",
      "Unlimited Customers & Vendors",
      "Unlimited Products & Multi-warehouse",
      "100+ Invoices / Bills per month",
      "Unlimited Estimates, Quotations & Purchase Orders",
      "Advanced Permissions & Reporting",
      "Priority Support & API Access",
      "Custom Tally / ERP Integrations",
      "Dedicated Account Manager (24/7 SLA)",
      "Business Network (Directory Listing)",
    ],
    businessNetworkIncluded: true,
    limits: {
      customers: 9999,
      teamMembers: 999,
      products: 9999,
      invoicesPerMonth: "Unlimited",
      estimatesPerMonth: "Unlimited",
      quotationsPerMonth: "Unlimited",
      purchaseOrdersPerMonth: "Unlimited",
      directoryListings: 20,
    },
  },
];

// Free plan is the default entitlement for every account. The account owner can
// always use the product (owner is NOT a paid team seat); the Free plan caps
// the count of ADDITIONAL team members at 0, so a Free account cannot add seats.
export const FREE_PLAN_ID: SubscriptionPlanId = "base";

// ---------------------------------------------------------------------------
// Subscription lifecycle (expiry + grace) — SHARED, pure, server-authoritative.
// ---------------------------------------------------------------------------
//
// The only constant in the system: how long a business keeps its subscribed-plan
// entitlements after the paid period ends, before the effective plan drops to
// FREE. Expressed in whole calendar days.
//
// BOUNDARY (documented, deterministic, UTC calendar days):
//
//   renewsAt  = the stored paid-period end (BusinessSubscription.renewsAt).
//               It fixes the CALENDAR DAY the paid period ends on; its
//               time-of-day does not shift the boundary.
//   ACTIVE     = before the end of renewsAt's calendar day
//                (i.e. now < startOfDay(renewsAt) + 1 day).
//   GRACE      = the 3 calendar days that follow that day
//                ([startOfDay(renewsAt)+1day, startOfDay(renewsAt)+4day)).
//   EXPIRED    = from the start of the day after grace (FREE).
//
// Example: renewsAt on Sep 30 → Sep 30 fully ACTIVE, Oct 1/2/3 GRACE days
// 1/2/3, Oct 4 FREE. The entire day OF renewsAt is still paid; grace ALWAYS
// starts on the next calendar day — never at the renewsAt instant itself.
//
// "3 calendar days" is implemented as 3×24h from the UTC midnight that starts
// the grace window (startOfDay(renewsAt)+1d → +4d). This is timezone-stable:
// Postgres stores UTC timestamps, and UTC calendar days have no DST, so the
// same stored row yields the same effective status on every server.
//
// `now` is injectable ONLY so tests can drive the boundaries deterministically.
// Production callers pass the SERVER clock (new Date()); the browser clock is
// never used to decide whether a subscription has expired (rule 5).
export const GRACE_PERIOD_DAYS = 3;
const DAY_MS = 86400000;

/**
 * Server-effective subscription lifecycle for one subscription row.
 *
 * @param renewsAt  the stored paid-period end (timestamp). A missing/invalid
 *   value means no expiry can be computed, so the subscription is treated as
 *   ACTIVE (paid access is preserved rather than possibly-downgraded) with
 *   null grace bounds.
 * @param now       the authoritative time source (server clock).
 */
export type EffectiveSubscriptionStatus = "ACTIVE" | "GRACE_PERIOD" | "EXPIRED";

export function computeSubscriptionLifecycle(
  renewsAt: Date | string | null | undefined,
  now: Date | number = new Date(),
): {
  status: EffectiveSubscriptionStatus;
  graceStartsAt: Date | null;
  graceEndsAt: Date | null;
  renewalRequired: boolean;
} {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const renews = renewsAt ? new Date(renewsAt) : null;
  if (!renews || Number.isNaN(renews.getTime())) {
    return {
      status: "ACTIVE",
      graceStartsAt: null,
      graceEndsAt: null,
      renewalRequired: false,
    };
  }

  const day = Date.UTC(
    renews.getUTCFullYear(),
    renews.getUTCMonth(),
    renews.getUTCDate(),
  );
  const graceStartsAt = new Date(day + DAY_MS); // next UTC midnight
  const graceEndsAt = new Date(day + (1 + GRACE_PERIOD_DAYS) * DAY_MS); // day after grace

  if (nowMs < graceStartsAt.getTime()) {
    return { status: "ACTIVE", graceStartsAt, graceEndsAt, renewalRequired: false };
  }
  if (nowMs < graceEndsAt.getTime()) {
    return { status: "GRACE_PERIOD", graceStartsAt, graceEndsAt, renewalRequired: true };
  }
  return { status: "EXPIRED", graceStartsAt, graceEndsAt, renewalRequired: true };
}

export function getPlanById(
  catalog: SubscriptionPlan[] = PLAN_CATALOG,
  id: SubscriptionPlanId | null | undefined
): SubscriptionPlan | null {
  if (!id) return null;
  return catalog.find((p) => p.id === id) ?? null;
}

// Single, reliable resolution of the plan that governs an account's
// entitlements. NEVER returns null for an authenticated account: when there is
// no active paid subscription, the Free plan (base) governs. This is what fixes
// the "allows up to 0 X" bug that occurred when entitlements resolved to a
// null plan.
export function getEffectivePlan(
  state: SubscriptionState | null,
  catalog: SubscriptionPlan[] = PLAN_CATALOG
): SubscriptionPlan | null {
  if (!state) return getPlanById(catalog, FREE_PLAN_ID);
  // A successfully-paid plan is active and governs. A GRACE-period plan also
  // governs: the subscribed plan stays in effect for the 3-calendar-day grace
  // window after the paid period ends (server tells us the effective status).
  if (
    (state.status === "active" || state.status === "grace") &&
    state.currentPlanId
  ) {
    const plan = getPlanById(catalog, state.currentPlanId);
    if (plan) return plan;
  }
  // Everything else (never-paid, expired, failed, suspended-payment state) falls
  // back to the Free plan so an account owner is never locked out of product
  // basics. Contract: NEVER returns null for a valid account — even when the
  // supplied catalog is partial (a DB catalog always contains `base`, but a
  // defensive static fallback keeps the promise regardless of the source).
  return (
    getPlanById(catalog, FREE_PLAN_ID) ??
    getPlanById(PLAN_CATALOG, FREE_PLAN_ID)
  );
}

// Typed accessor for a plan's configured ceiling for a resource kind.
export function getPlanLimits(plan: SubscriptionPlan): SubscriptionPlan["limits"] {
  return plan.limits;
}

export function getLimitFor(
  plan: SubscriptionPlan,
  kind: EntitlementLimitKind
): number | "Unlimited" {
  const limits = plan.limits;
  switch (kind) {
    case "invoices":
      return limits.invoicesPerMonth;
    case "estimates":
      return limits.estimatesPerMonth;
    case "quotations":
      return limits.quotationsPerMonth;
    case "purchaseOrders":
      return limits.purchaseOrdersPerMonth;
    case "customers":
      return limits.customers;
    case "teamMembers":
      return limits.teamMembers;
    case "products":
      return limits.products;
    case "directoryListing":
      return limits.directoryListings;
  }
  return "Unlimited";
}

// NOTE: async on purpose so the backend seam is drop-in — the API returns the
// same `SubscriptionPlan[]` shape. Currently resolves the local catalog.
export async function fetchPlanCatalog(): Promise<SubscriptionPlan[]> {
  // Backend phase: replace this body with a call to the plans API (the admin
  // console publishes the authorized catalog; this local array is the fallback).
  return PLAN_CATALOG;
}
