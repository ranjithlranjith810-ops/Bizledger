// Server-side entitlement enforcement (Security Hardening 1 — F3, extended by
// Phase 8E with PlanCatalog-backed limits and by Phase 9C-4 with
// feature-entitlement enforcement).
//
// The browser is NEVER the security boundary for plan limits. This module
// resolves the business's effective plan from the DATABASE (ACTIVE
// BusinessSubscription → plan_catalog limits + featureEntitlements, static
// PLAN_CATALOG as the fallback; absence = Free/Base plan) and counts current
// usage from database state before every governed create.
//
// RACE SAFETY: `assertCreateAllowed` takes an exclusive row lock on the
// Business row (`SELECT ... FOR UPDATE`) INSIDE the caller's transaction, so
// concurrent creations for the same business serialize — a stale pre-insert
// count can never let two requests both slip past a plan ceiling. Callers run
// the check + insert inside one transaction (`withEntitlementCheck`).
// `assertFeature` takes the same lock; it is a feature gate, not a count gate,
// so the lock is carried for consistency with the numeric path rather than
// because a feature read has a count race.
//
// ERROR CONTRACT:
//   - limit denials throw `EntitlementDeniedError`, mapped by `handleApiError`
//     to HTTP 403 with a stable machine-readable body
//     ({ code: "ENTITLEMENT_LIMIT", kind, limit, used }).
//   - feature denials throw `FeatureDeniedError`, mapped to HTTP 403 with
//     { code: "ENTITLEMENT_FEATURE", feature }.
// No subscription/payment internals are leaked.
//
// FEATURE REGISTRY (Phase 9C-4): a behavior can only be granted by a key that
// is EXPLICITLY registered in `REGISTERED_FEATURES`. Any other key stored in a
// plan's `featureEntitlements` is preserved in the plan data (the Admin console
// round-trips it) but grants NO behavior and crashes nothing. A registered
// feature denies only when the effective plan EXPLICITLY sets it to `false` or
// `0`; absence/null leaves today's behavior untouched, so canonical plans
// (featureEntitlements = NULL) never change.

import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeSubscriptionLifecycle,
  FREE_PLAN_ID,
  getLimitFor,
  getPlanById,
  PLAN_CATALOG,
} from "@/lib/plans";
import type {
  EntitlementLimitKind,
  SubscriptionPlan,
  SubscriptionPlanId,
} from "@/types";

export type EntitlementKind = EntitlementLimitKind;

/** Structural subset of a PlanCatalog row the entitlement resolver needs. */
export interface CatalogPlanRow {
  id: string;
  name: string;
  period: string;
  businessNetworkIncluded: boolean;
  limits: unknown;
  featureEntitlements: unknown;
}

/** Minimal transactional surface the entitlement guard requires. Real callers
 * pass a Prisma `$transaction` client (which satisfies this structurally). */
export interface EntitlementDb {
  $queryRaw<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  businessSubscription: {
    findFirst(args: unknown): Promise<{ planId: string; period: string; renewsAt: Date | null } | null>;
  };
  planCatalog: {
    findFirst(args: unknown): Promise<CatalogPlanRow | null>;
  };
  customer: { count(args: unknown): Promise<number> };
  product: { count(args: unknown): Promise<number> };
  businessMember: { count(args: unknown): Promise<number> };
  invoice: { count(args: unknown): Promise<number> };
  estimate: { count(args: unknown): Promise<number> };
  quotation: { count(args: unknown): Promise<number> };
  purchaseOrder: { count(args: unknown): Promise<number> };
  businessDirectoryProfile: { count(args: unknown): Promise<number> };
}

export class EntitlementDeniedError extends Error {
  constructor(
    public kind: EntitlementKind,
    public limit: number | "Unlimited",
    public used: number,
  ) {
    super("Plan limit reached for the active subscription");
    this.name = "EntitlementDeniedError";
  }
}

// ---------------------------------------------------------------------------
// Phase 8E — PlanCatalog-backed limits.
//
// Plan *limits* come from the DATABASE (plan_catalog) so changes published
// through the admin console actually affect enforcement. The static PLAN_CATALOG
// stays as the fallback (and for the base Free plan) so a missing/inactive
// catalog row never locks a paying customer out or invents prices.
//
// Resolution order for the plan governing a business (inside the ACTIVE/GRACE
// window):
//   1. PlanCatalog row with the subscription's planId (active) -> its `limits`
//      merge over the STATIC plan's shape (known-key, deterministic merge).
//   2. No active DB row -> static PLAN_CATALOG entry by id (legacy/historical).
//   3. Neither (custom id never seen) -> Free plan, as before.
//
// The DB limits format is validated at admin write time (full known key set,
// non-negative integers or "Unlimited"), but the merge below re-validates every
// value defensively and falls back to the static plan's value — or
// "Unlimited" — for a missing/invalid key, so a malformed row can NEVER lock a
// customer out (fails open to the catalog default, never to a 0 ceiling).
// ---------------------------------------------------------------------------
const PLAN_LIMIT_KEYS = [
  "customers",
  "teamMembers",
  "products",
  "invoicesPerMonth",
  "estimatesPerMonth",
  "quotationsPerMonth",
  "purchaseOrdersPerMonth",
  "directoryListings",
] as const;

type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

// ---------------------------------------------------------------------------
// Phase 9C-4 - Feature entitlement registry (A-class prerequisite).
//
// A behavior can only be gated by a key EXPLICITLY registered here. Semantics of
// a registered feature on the effective plan:
//   - false or 0                     -> DENIED
//   - true, >0, or "Unlimited"       -> ALLOWED
//   - absent or null                 -> ALLOWED (the plan makes no explicit
//                                       choice, so today's behavior is
//                                       unchanged and canonical plans, which
//                                       store featureEntitlements = SQL NULL,
//                                       keep working exactly as before)
//
// This is deliberately a pure "is it EXPLICITLY disabled?" predicate: absent is
// NOT the same as false, and an unregistered key is never consulted by a caller
// so it can neither grant nor deny anything.
// ---------------------------------------------------------------------------
export class FeatureDeniedError extends Error {
  constructor(public feature: string) {
    super(`Feature "${feature}" is not enabled for the active subscription`);
    this.name = "FeatureDeniedError";
  }
}

export const REGISTERED_FEATURES = ["quotations", "businessDirectory"] as const;

export type FeatureEntitlementValue = boolean | number | "Unlimited";
export type FeatureEntitlements = Record<string, FeatureEntitlementValue>;

function validFeatureValue(value: unknown): FeatureEntitlementValue | null {
  if (typeof value === "boolean") return value;
  if (value === "Unlimited") return "Unlimited";
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

/** Defensively normalizes a stored featureEntitlements JSON column. Invalid
 * entries are dropped; absent/null JSON yields an empty map (i.e. "the plan
 * says nothing about any feature", which stays allowed). */
export function featuresFromCatalogRow(
  row: CatalogPlanRow,
): FeatureEntitlements {
  if (!row.featureEntitlements || typeof row.featureEntitlements !== "object") {
    return {};
  }
  const out: FeatureEntitlements = {};
  for (const [key, value] of Object.entries(
    row.featureEntitlements as Record<string, unknown>,
  )) {
    const parsed = validFeatureValue(value);
    if (parsed !== null) out[key] = parsed;
  }
  return out;
}

/** Pure feature check: true unless the effective plan EXPLICITLY disables the
 * key with false/0. */
export function hasFeature(
  features: FeatureEntitlements,
  key: string,
): boolean {
  const value = features[key];
  return !(value === false || value === 0);
}

/** Pure accessor: the configured value for a feature key, or null when the
 * plan makes no explicit choice for it. */
export function getFeatureLimit(
  features: FeatureEntitlements,
  key: string,
): FeatureEntitlementValue | null {
  return key in features ? (features[key] ?? null) : null;
}

/** Feature gate for a feature-gated mutation. Called inside the caller's
 * transaction BEFORE the mutation and throws `FeatureDeniedError` only when the
 * effective plan EXPLICITLY disables the registered feature; everything else
 * passes (backward compatible).
 *
 * The row lock matches `assertCreateAllowed` for consistency. Unlike the numeric
 * path there is no count race to close here — a feature read returns the same
 * answer to every concurrent request — so the lock is not load-bearing for
 * correctness. Gates that only need the flag should prefer `hasFeature`. */
export async function assertFeature(
  db: EntitlementDb,
  businessId: string,
  feature: string,
): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "business" WHERE "id" = ${businessId} FOR UPDATE`;
  const { features } = await resolveEffectivePlan(db, businessId);
  if (!hasFeature(features, feature)) {
    throw new FeatureDeniedError(feature);
  }
}

function validLimitValue(value: unknown): number | "Unlimited" | null {
  if (value === "Unlimited") return "Unlimited";
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

/** The four document kinds share a single ceiling: the plan's INVOICE limit.
 * When a document key is absent from a catalog row (e.g. pre-existing rows
 * written before those keys existed), it inherits `invoicesPerMonth` exactly —
 * never 0 and never an invented second plan configuration. */
const DOCUMENT_LIMIT_KEYS = new Set<PlanLimitKey>([
  "estimatesPerMonth",
  "quotationsPerMonth",
  "purchaseOrdersPerMonth",
]);

/**
 * Resolves a PlanCatalog row's persisted `limits` JSON into the full 8-key
 * limit set through the canonical fallback chain:
 *   1. a valid persisted DB value wins for that key;
 *   2. otherwise the STATIC catalog value for a canonical plan id wins
 *      (a malformed canonical row fails OPEN to its catalog default);
 *   3. otherwise a missing document key inherits `invoicesPerMonth` — the
 *      invoice limit is the common ceiling for all four document kinds — via
 *      the same DB → static → 0 chain;
 *   4. otherwise 0 (a truly unspecified resource on an unknown plan is not
 *      granted: fail CLOSED, never an accidental "Unlimited").
 * This is the SINGLE limits resolver used by BOTH enforcement
 * (`planFromCatalogRow`) and the pricing catalog DTO (`toPlanDto`), so the
 * pricing page advertises exactly what the server enforces.
 */
export function catalogLimits(row: {
  id: string;
  limits: unknown;
}): SubscriptionPlan["limits"] {
  const staticPlan = getPlanById(PLAN_CATALOG, row.id as SubscriptionPlanId);
  const dbLimits =
    row.limits && typeof row.limits === "object"
      ? (row.limits as Record<string, unknown>)
      : {};

  const pick = (key: PlanLimitKey): number | "Unlimited" => {
    const dbValue = validLimitValue(dbLimits[key]);
    if (dbValue !== null) return dbValue;
    if (staticPlan) {
      const staticValue = staticPlan.limits?.[key];
      if (staticValue !== undefined) return staticValue as number | "Unlimited";
    }
    if (DOCUMENT_LIMIT_KEYS.has(key)) {
      const invoiceValue = validLimitValue(dbLimits.invoicesPerMonth);
      if (invoiceValue !== null) return invoiceValue;
      if (staticPlan?.limits?.invoicesPerMonth !== undefined) {
        return staticPlan.limits.invoicesPerMonth as number | "Unlimited";
      }
    }
    return 0;
  };

  return {
    customers: pick("customers"),
    teamMembers: pick("teamMembers"),
    products: pick("products"),
    invoicesPerMonth: pick("invoicesPerMonth"),
    estimatesPerMonth: pick("estimatesPerMonth"),
    quotationsPerMonth: pick("quotationsPerMonth"),
    purchaseOrdersPerMonth: pick("purchaseOrdersPerMonth"),
    directoryListings: pick("directoryListings"),
  };
}

/** Merges a PlanCatalog row into a SubscriptionPlan-shaped object, plus the
 * plan's featureEntitlements map (see `featuresFromCatalogRow`). Limits come
 * from the shared `catalogLimits` resolver. */
export function planFromCatalogRow(row: CatalogPlanRow): {
  plan: SubscriptionPlan;
  features: FeatureEntitlements;
} {
  const staticPlan = getPlanById(PLAN_CATALOG, row.id as SubscriptionPlanId);

  return {
    plan: {
      id: row.id as SubscriptionPlanId,
      name: row.name,
      price: staticPlan?.price ?? 0,
      period:
        (row.period === "month" || row.period === "year") ? row.period : "month",
      description: staticPlan?.description ?? row.name,
      ...(staticPlan?.popular !== undefined ? { popular: staticPlan.popular } : {}),
      features: staticPlan?.features ?? [],
      businessNetworkIncluded: row.businessNetworkIncluded,
      limits: catalogLimits(row),
    },
    features: featuresFromCatalogRow(row),
  };
}

export interface EntitlementDecision {
  allowed: boolean;
  kind: EntitlementKind;
  limit: number | "Unlimited";
  used: number;
  remaining: number | "Unlimited";
}

/**
 * Resolve the plan currently governing a business's entitlements from the
 * database, using the EFFECTIVE subscription lifecycle (expiry + grace) from
 * the stored `renewsAt` vs the SERVER clock:
 *   - ACTIVE / GRACE_PERIOD: the subscribed plan governs (grace keeps the paid
 *     limits; no data is deleted).
 *   - EXPIRED (paid period + 3 calendar days passed): the FREE plan governs.
 *   - Anything else (no subscription row, non-ACTIVE raw status): FREE.
 * This exactly matches `getEffectivePlan` semantics on the client and never
 * trusts a planId/plan name/price supplied by the browser. The raw ACTIVE
 * database status is NOT mutated — expiry is derived on every read (rule 9).
 */
export async function resolveEffectivePlan(
  db: EntitlementDb,
  businessId: string,
): Promise<{
  plan: SubscriptionPlan;
  period: "month" | "year";
  features: FeatureEntitlements;
}> {
  const row = await db.businessSubscription.findFirst({
    where: { businessId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { planId: true, period: true, renewsAt: true },
  });
  if (row) {
    const lifecycle = computeSubscriptionLifecycle(row.renewsAt, new Date());
    if (lifecycle.status === "ACTIVE" || lifecycle.status === "GRACE_PERIOD") {
      // Phase 8E/9C-4: ONE plan_catalog read is authoritative for BOTH the
      // numeric limits (Phase 8E) and the explicit feature entitlements
      // (Phase 9C-4). Feature semantics are unchanged by the merge: the same
      // active-row lookup and the same normalizer/predicate as before, so a
      // custom planId absent from the static catalog still receives its
      // deliberate feature off-switch AND its DB numeric limits.
      const dbPlan = await db.planCatalog.findFirst({
        where: { id: row.planId, active: true },
        select: {
          id: true,
          name: true,
          period: true,
          businessNetworkIncluded: true,
          limits: true,
          featureEntitlements: true,
        },
      });
      if (dbPlan) {
        const { plan, features } = planFromCatalogRow(dbPlan);
        return {
          plan,
          period: row.period === "year" ? "year" : "month",
          features,
        };
      }
      const plan = getPlanById(PLAN_CATALOG, row.planId as SubscriptionPlanId);
      if (plan) {
        return {
          plan,
          period: row.period === "year" ? "year" : "month",
          features: {},
        };
      }
    }
  }
  return {
    plan: getPlanById(PLAN_CATALOG, FREE_PLAN_ID) as SubscriptionPlan,
    period: "month",
    features: {},
  };
}

/** Calendar-month window (UTC), matching the invoice quota exactly. Boundaries
 * are built with Date.UTC so they never depend on the server's local timezone,
 * and `lt nextMonthStart` is an EXCLUSIVE upper bound so exactly one instant can
 * never be double-counted or slip through a 31/30/28-day month length. */
function monthWindow(businessId: string, excludeStatus?: string) {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    businessId,
    createdAt: { gte: monthStart, lt: nextMonthStart },
    ...(excludeStatus ? { status: { not: excludeStatus } } : {}),
  };
}

/** Current DB-side usage for a resource kind. The four document kinds (invoices,
 * estimates, quotations, purchase orders) are metered over the current UTC
 * calendar month — a Cancelled invoice/PO is not a metered document and must
 * not consume the monthly allowance; estimates and quotations have no Cancelled
 * status, so every created row counts. Every other kind is a lifetime total.
 * All are anchored on the server-mint `createdAt` so back-dated document dates
 * cannot dodge the ceiling.
 *
 * `period` is retained in the signature for call-site compatibility; the
 * calendar-month window is intentionally NOT derived from it, because the
 * governed limit is `...PerMonth` regardless of billing cadence. */
export async function countUsage(
  db: EntitlementDb,
  businessId: string,
  kind: EntitlementKind,
  period: "month" | "year",
): Promise<number> {
  switch (kind) {
    case "customers":
      return db.customer.count({ where: { businessId } });
    case "products":
      return db.product.count({ where: { businessId } });
    case "teamMembers":
      // Owner is NOT a paid seat (Free caps ADDITIONAL seats at 0).
      return db.businessMember.count({
        where: {
          businessId,
          role: { not: "OWNER" },
          status: { in: ["ACTIVE", "INVITED"] },
        },
      });
    case "invoices": {
      // Phase 9C-4: `invoicesPerMonth` is a CALENDAR-MONTH quota, so the
      // window is the current UTC calendar month. Deliberately independent of
      // the subscription's billing `period`: an annual subscriber is still
      // capped at `invoicesPerMonth` per calendar month, which the previous
      // rolling window got wrong (it counted 365 days for annual plans).
      // A cancelled invoice is not a metered invoice.
      return db.invoice.count({ where: monthWindow(businessId, "Cancelled") });
    }
    case "estimates":
      // Estimate quota mirrors the invoice monthly window. Estimates have no
      // Cancelled status (Draft/Sent/Accepted/Rejected/Expired), so nothing is
      // excluded — every minted estimate consumes one estimate slot.
      return db.estimate.count({ where: monthWindow(businessId) });
    case "quotations":
      // Quotation quota mirrors the invoice monthly window. Quotations have no
      // Cancelled status (Draft/Sent/Accepted/Rejected/Expired), so nothing is
      // excluded — every minted quotation consumes one quotation slot.
      return db.quotation.count({ where: monthWindow(businessId) });
    case "purchaseOrders":
      // PO quota mirrors the invoice monthly window INCLUDING the Cancelled
      // exclusion: a cancelled PO is not a metered PO (exactly like invoices).
      return db.purchaseOrder.count({
        where: monthWindow(businessId, "Cancelled"),
      });
    case "directoryListing":
      return db.businessDirectoryProfile.count({ where: { businessId } });
    default:
      // Exhaustive over EntitlementLimitKind; keeps the compiler happy if the
      // union ever grows in the client bundle.
      return 0;
  }
}

/** Pure limit decision: throws `EntitlementDeniedError` when `used >= limit`;
 * otherwise returns the decision. `remaining` is the exact number of slots
 * left under the ceiling: `limit - used` (never `limit - used - 1` — one used
 * item against a ceiling of five leaves four remaining). */
export function assertWithinLimit(
  plan: SubscriptionPlan,
  kind: EntitlementKind,
  limit: number | "Unlimited",
  used: number,
): EntitlementDecision {
  if (limit === "Unlimited" || limit === -1) {
    return { allowed: true, kind, limit, used: 0, remaining: "Unlimited" };
  }
  const cap = limit as number;
  if (used >= cap) {
    throw new EntitlementDeniedError(kind, cap, used);
  }
  return {
    allowed: true,
    kind,
    limit: cap,
    used,
    remaining: Math.max(cap - used, 0),
  };
}

/**
 * Entitlement gate. MUST be called inside the caller's transaction BEFORE the
 * governed insert:
 *   1. locks the Business row (serializes concurrent creates per business),
 *   2. resolves the effective plan from the DB,
 *   3. counts current usage,
 *   4. denys (EntitlementDeniedError) when at/over the ceiling.
 * Returns the decision when creation is permitted.
 */
export async function assertCreateAllowed(
  db: EntitlementDb,
  businessId: string,
  kind: EntitlementKind,
): Promise<EntitlementDecision> {
  await db.$queryRaw`SELECT "id" FROM "business" WHERE "id" = ${businessId} FOR UPDATE`;

  const { plan, period } = await resolveEffectivePlan(db, businessId);
  const limit = getLimitFor(plan, kind);

  if (limit === "Unlimited" || limit === -1) {
    return { allowed: true, kind, limit, used: 0, remaining: "Unlimited" };
  }

  const used = await countUsage(db, businessId, kind, period);
  return assertWithinLimit(plan, kind, limit, used);
}

/** Helper for single-write creates: runs the entitlement guard + the caller's
 * insert inside ONE transaction (lock → count → check → insert), so concurrent
 * requests near a plan limit cannot both slip through. */
export async function withEntitlementCheck<T>(
  businessId: string,
  kind: EntitlementKind,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await assertCreateAllowed(tx, businessId, kind);
      return fn(tx);
    },
    { timeout: 30000, maxWait: 30000 },
  );
}