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
    findFirst(args: unknown): Promise<{ planId: string; period: string } | null>;
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

export interface EntitlementDecision {
  allowed: boolean;
  kind: EntitlementKind;
  limit: number | "Unlimited";
  used: number;
  remaining: number | "Unlimited";
}

/**
 * Resolve the plan currently governing a business's entitlements from the
 * database. An ACTIVE subscription's planId + period apply; EVERYTHING else
 * (no subscription, non-ACTIVE status) resolves to the Free (base) plan —
 * exactly matching `getEffectivePlan` semantics on the client. Never trusts a
 * planId/plan name/price supplied by the browser.
 */
export async function resolveEffectivePlan(
  db: EntitlementDb,
  businessId: string,
): Promise<{ plan: SubscriptionPlan; period: "month" | "year" }> {
  const row = await db.businessSubscription.findFirst({
    where: { businessId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { planId: true, period: true },
  });
  if (row) {
    const plan = getPlanById(PLAN_CATALOG, row.planId as SubscriptionPlanId);
    if (plan) {
      return { plan, period: row.period === "year" ? "year" : "month" };
    }
  }
  return {
    plan: getPlanById(PLAN_CATALOG, FREE_PLAN_ID) as SubscriptionPlan,
    period: "month",
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