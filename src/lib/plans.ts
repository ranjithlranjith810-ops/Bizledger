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
      directoryListings: 20,
    },
  },
];

// Free plan is the default entitlement for every account. The account owner can
// always use the product (owner is NOT a paid team seat); the Free plan caps
// the count of ADDITIONAL team members at 0, so a Free account cannot add seats.
export const FREE_PLAN_ID: SubscriptionPlanId = "base";

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
  // A successfully-paid plan is active and governs.
  if (state.status === "active" && state.currentPlanId) {
    const plan = getPlanById(catalog, state.currentPlanId);
    if (plan) return plan;
  }
  // Everything else (never-paid, failed, suspended-payment state) falls back to
  // the Free plan so an account owner is never locked out of product basics.
  return getPlanById(catalog, FREE_PLAN_ID);
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
