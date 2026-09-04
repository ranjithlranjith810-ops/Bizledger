// Centralized plan-entitlement engine. All subscription limit checks across the
// app go through these helpers so there are no scattered hard-coded limits.
//
// Concept:  Plan → Entitlements → Usage → Can Perform Operation?
//   getActivePlan()         current ACTIVE plan (failed/cancelled payment keeps old plan)
//   getLimit()              the configured ceiling for a resource
//   getUsage()              how much of the resource is already used
//   checkEntitlement()      pure decision (allowed? remaining? reason)
//   assertEntitlement()     enforcement helper returning a normalized result
import {
  Invoice,
  SubscriptionPlan,
  SubscriptionState,
  SubscriptionPlanId,
  EntitlementLimitKind,
} from "@/types";
import { getEffectivePlan, getLimitFor, getPlanById } from "@/lib/plans";

// Canonical limit-resource kind shared with the context/types layer.
export type LimitKind = EntitlementLimitKind;

export const UNLIMITED = "Unlimited" as const;

const MS_DAY = 86400000;
const DEFAULT_PERIOD_MS = 30 * MS_DAY;

export function isUnlimited(value: number | "Unlimited"): boolean {
  return value === UNLIMITED || value === -1;
}

// Backward-compatible guard: whether an ACTIVE (paid) plan is currently in
// effect. This only reflects a successful paid subscription. For entitlement
// decisions prefer `getEffectivePlan` (which never yields null for a valid
// account) — see `plans.ts`.
export function getActivePlan(
  plans: SubscriptionPlan[],
  state: SubscriptionState | null
): SubscriptionPlan | null {
  if (!state || state.status !== "active") return null;
  if (!state.currentPlanId) return null;
  return getPlanById(plans, state.currentPlanId);
}

export function getLimit(plan: SubscriptionPlan, kind: LimitKind): number | "Unlimited" {
  return getLimitFor(plan, kind);
}

// Single-reliable usage resolver for every entitlement resource. Callers pass
// the raw counts they already track (or have AppContext build them); this keeps
// one shape for customers / products / team / invoices / directory.
export interface UsageCounts {
  customers: number;
  products: number;
  teamMembers: number;
  invoicesInPeriod: number;
  directoryListings: number;
}

export interface ResourceUsage {
  customers: number;
  products: number;
  teamMembers: number;
  invoices: number;
  directoryListings: number;
}

export function getUsage(counts: UsageCounts): ResourceUsage {
  return {
    customers: counts.customers,
    products: counts.products,
    teamMembers: counts.teamMembers,
    invoices: counts.invoicesInPeriod,
    directoryListings: counts.directoryListings,
  };
}

// Resolve the usage a single kind should be checked against, given the raw
// usage map. Kind names map to the same fields `getLimit`/`checkEntitlement` use.
export function usageForKind(usage: ResourceUsage, kind: LimitKind): number {
  switch (kind) {
    case "invoices":
      return usage.invoices;
    case "customers":
      return usage.customers;
    case "teamMembers":
      return usage.teamMembers;
    case "products":
      return usage.products;
    case "directoryListing":
      return usage.directoryListings;
  }
}

// How many invoices fall inside the current billing period. Usage resets
// together with the subscription billing cycle (a rolling window sized by the
// period) rather than introducing a second counter — so a "monthly" plan counts
// the trailing 30 days, a "yearly" plan counts the trailing 365 days. `now` is
// injectable so unit tests can drive boundary/reset scenarios deterministically.
export function countCurrentPeriodInvoices(
  invoices: Invoice[],
  state: SubscriptionState | null,
  now = Date.now()
): number {
  const period = state?.billing?.period ?? "month";
  const windowMs = period === "year" ? 365 * MS_DAY : DEFAULT_PERIOD_MS;
  const cutoff = now - windowMs;
  return invoices.reduce((n, inv) => {
    const t = Date.parse(inv.date);
    // Unparseable dates are treated as minted "now" and therefore current-period.
    if (Number.isNaN(t)) return n + 1;
    return n + (t >= cutoff && t <= now ? 1 : 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// Enforcement API
// ---------------------------------------------------------------------------

// Result of a limit check. Type-aligned with `EntitlementCheckResult` in the
// types layer so app-wide call sites share one shape.
export interface EntitlementResult {
  allowed: boolean;
  kind: LimitKind;
  limit: number | "Unlimited";
  used: number;
  remaining: number | "Unlimited";
  reason: "ok" | "no-active-plan" | "limit";
}

// Pure decision: given a plan and the number of items already used, is creating
// one more item permitted? When there is no active plan the operation is
// treated as blocked (no entitlements) — the UI surfaces an upgrade prompt.
export function checkEntitlement(
  plan: SubscriptionPlan | null,
  kind: LimitKind,
  used: number
): EntitlementResult {
  if (!plan) {
    return {
      allowed: false,
      kind,
      limit: 0,
      used,
      remaining: 0,
      reason: "no-active-plan",
    };
  }
  const limit = getLimit(plan, kind);
  if (isUnlimited(limit)) {
    return {
      allowed: true,
      kind,
      limit: UNLIMITED,
      used,
      remaining: UNLIMITED,
      reason: "ok",
    };
  }
  const cap = limit as number;
  const allowed = used < cap;
  return {
    allowed,
    kind,
    limit: cap,
    used,
    remaining: allowed ? cap - used - 1 : 0,
    reason: allowed ? "ok" : "limit",
  };
}

// Shortcut for call sites that need a boolean gate.
export function canCreate(
  plan: SubscriptionPlan | null,
  kind: LimitKind,
  used: number
): boolean {
  return checkEntitlement(plan, kind, used).allowed;
}

// Human-friendly label used by upgrade prompts / usage displays.
export function limitLabel(limit: number | "Unlimited"): string {
  return isUnlimited(limit) ? "Unlimited" : `${limit}`;
}

export function planIdLabel(id: SubscriptionPlanId | null): string {
  return id === "base"
    ? "Base"
    : id === "business"
    ? "Business"
    : id === "enterprise"
    ? "Enterprise"
    : "";
}