// Server-side entitlement enforcement (Security Hardening 1 — F3).
//
// The browser is NEVER the security boundary for plan limits. This module
// resolves the business's effective plan from the DATABASE (ACTIVE
// BusinessSubscription → PLAN_CATALOG; absence = Free/Base plan) and counts
// current usage from database state before every governed create.
//
// RACE SAFETY: `assertCreateAllowed` takes an exclusive row lock on the
// Business row (`SELECT ... FOR UPDATE`) INSIDE the caller's transaction, so
// concurrent creations for the same business serialize — a stale pre-insert
// count can never let two requests both slip past a plan ceiling. Callers run
// the check + insert inside one transaction (`withEntitlementCheck`).
//
// ERROR CONTRACT: denial throws `EntitlementDeniedError`, mapped by
// `handleApiError` to HTTP 403 with a stable machine-readable body
// ({ code: "ENTITLEMENT_LIMIT", kind, limit, used }). No subscription/payment
// internals are leaked.

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

const WINDOW_MS: Record<"month" | "year", number> = {
  month: 30 * 86400000,
  year: 365 * 86400000,
};

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
    findFirst(args: unknown): Promise<{ featureEntitlements: unknown } | null>;
  };
  customer: { count(args: unknown): Promise<number> };
  product: { count(args: unknown): Promise<number> };
  businessMember: { count(args: unknown): Promise<number> };
  invoice: { count(args: unknown): Promise<number> };
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
  row: { featureEntitlements: unknown },
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

/** Resolves the effective plan row's EXPLICIT feature entitlements. A missing or
 * inactive row yields {} (nothing is explicitly disabled, so nothing is
 * denied). Read strictly for feature state - it never influences a numeric cap. */
async function resolveFeatureEntitlements(
  db: EntitlementDb,
  planId: string,
): Promise<FeatureEntitlements> {
  const row = await db.planCatalog.findFirst({
    where: { id: planId, active: true },
    select: { featureEntitlements: true },
  });
  return row ? featuresFromCatalogRow(row) : {};
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
      // Phase 9C-4: read the effective plan row's EXPLICIT feature
      // entitlements. Plan LIMITS below are still resolved exactly as before
      // (static PLAN_CATALOG, Free fallback) - this read only ADDS feature
      // state and can never change a numeric cap. The read happens even when
      // planId is a custom id absent from the static catalog, so a plan's
      // deliberate off-switch still applies to it.
      const features = await resolveFeatureEntitlements(db, row.planId);
      const plan = getPlanById(PLAN_CATALOG, row.planId as SubscriptionPlanId);
      if (plan) {
        return {
          plan,
          period: row.period === "year" ? "year" : "month",
          features,
        };
      }
      return {
        plan: getPlanById(PLAN_CATALOG, FREE_PLAN_ID) as SubscriptionPlan,
        period: "month",
        features,
      };
    }
  }
  return {
    plan: getPlanById(PLAN_CATALOG, FREE_PLAN_ID) as SubscriptionPlan,
    period: "month",
    features: {},
  };
}

/** Current DB-side usage for a resource kind, within the subscription period
 * window where applicable (rolling 30/365-day window for invoices, anchored on
 * the server-mint `createdAt` so back-dated invoice dates cannot dodge the
 * ceiling). */
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
      const cutoff = new Date(Date.now() - WINDOW_MS[period]);
      return db.invoice.count({
        where: { businessId, createdAt: { gte: cutoff } },
      });
    }
    case "directoryListing":
      return db.businessDirectoryProfile.count({ where: { businessId } });
    default:
      // Exhaustive over EntitlementLimitKind; keeps the compiler happy if the
      // union ever grows in the client bundle.
      return 0;
  }
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

  const cap = limit as number;
  const used = await countUsage(db, businessId, kind, period);

  if (used >= cap) {
    throw new EntitlementDeniedError(kind, cap, used);
  }

  return {
    allowed: true,
    kind,
    limit: cap,
    used,
    remaining: cap - used - 1,
  };
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