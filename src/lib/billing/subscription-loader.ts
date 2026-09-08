"use client";

// Pure subscription-loader decision logic for the client subscription lifecycle.
//
// PURPOSE: the AppContext subscription effect needs an explicit subscription
// lifecycle (loading → ready | error) so the billing UI never renders "Free" as
// a placeholder while the server subscription is being fetched. The three pure
// functions below are the source of truth for that lifecycle and are shared
// with the regression harness so the behavior is directly testable:
//
//   defaultSubscriptionState()      the neutral "no paid plan" state
//   resolveServerSubscription()     server answer → next subscription state
//   deriveSubscriptionStatus()      businessId + lifecycle → loading/ready/error
//
// SAFETY:
//   - Client-only (no prisma, no server-only). Uses PLAN_CATALOG == the same
//     catalog AppContext consumes.
//   - A non-ACTIVE/null server answer is the EXPLICIT free answer — it resolves
//     to free only when no paid plan is locally active. A locally-active paid
//     plan (post-payment, webhook in-flight) is NEVER downgraded by a null
//     server answer, preserving the Phase 4F no-downgrade invariant.

import { SubscriptionPlan, SubscriptionPlanId, SubscriptionState } from "@/types";
import { PLAN_CATALOG } from "@/lib/plans";

/** Client-bound shape returned by GET /api/billing/subscription. */
export interface ServerSubscriptionShape {
  planId: string;
  status: string;
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
}

export type SubscriptionStatus = "loading" | "ready" | "error";

/** Lifecycle anchor: which businessId the ready/error answer belongs to. */
export interface SubscriptionLifecycle {
  businessId: string | null;
  status: "ready" | "error";
}

/** Neutral "no paid plan" state — the genuine free baseline, NOT a placeholder. */
export function defaultSubscriptionState(): SubscriptionState {
  return {
    currentPlanId: null,
    status: "none",
    billing: { period: "month", startedAt: null, renewsAt: null, amount: 0, gstRate: 18 },
    pendingPlanId: null,
    pendingPeriod: "month",
  };
}

/**
 * Server answer → next subscription state.
 *
 * - ACTIVE + known plan: apply the paid plan (period/startedAt/renewsAt from the
 *   server; presets amount/gstRate from the catalog).
 * - Anything else (null / non-ACTIVE): the server explicitly says there is no
 *   active paid subscription. Resolve to free UNLESS a paid plan is locally
 *   active (the webhook may be in flight after a just-verified payment) — we
 *   never downgrade a real payment.
 */
export function resolveServerSubscription(
  prev: SubscriptionState | null,
  serverSub: ServerSubscriptionShape | null | undefined,
): SubscriptionState {
  const base = prev ?? defaultSubscriptionState();

  if (serverSub && serverSub.status === "ACTIVE") {
    const plan = PLAN_CATALOG.find(
      (p) => p.id === (serverSub.planId as SubscriptionPlanId),
    );
    if (plan) {
      const period = serverSub.period === "year" ? "year" : "month";
      const now = Date.now();
      return {
        currentPlanId: plan.id,
        status: "active",
        billing: {
          period,
          startedAt: serverSub.startedAt ?? new Date(now).toISOString(),
          renewsAt: serverSub.renewsAt,
          amount: plan.price,
          gstRate: 18,
          lastPaidAt: serverSub.startedAt ?? undefined,
        },
        pendingPlanId: base.pendingPlanId ?? null,
        pendingPeriod: base.pendingPeriod ?? "month",
      };
    }
  }

  // Explicit free answer, unless a paid plan is locally active.
  if (
    base.status === "active" &&
    base.currentPlanId &&
    base.currentPlanId !== "base"
  ) {
    return base;
  }
  return defaultSubscriptionState();
}

/**
 * Loading is a DERIVED state: when the lifecycle anchor does not match the
 * current businessId, the server answer for that business is still pending, so
 * the UI must show loading — never a fallback plan.
 */
export function deriveSubscriptionStatus(
  businessId: string | null,
  lifecycle: SubscriptionLifecycle,
): SubscriptionStatus {
  if (!businessId) return "ready";
  return lifecycle.businessId === businessId ? lifecycle.status : "loading";
}