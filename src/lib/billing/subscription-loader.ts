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
// SERVER-AUTHORITATIVE (rules 5 & 12): the client NEVER computes whether a
// subscription has expired from the browser clock. The server DTO carries the
// EFFECTIVE status (ACTIVE | GRACE_PERIOD | EXPIRED) derived from stored dates,
// plus grace bounds and whether renewal is required; the client only mirrors
// that answer. In particular an explicit "EXPIRED" answer is never overridden
// by locally-active state — paid access cannot survive a server FREE verdict.
//
// SAFETY:
//   - Client-only (no prisma, no server-only). Uses PLAN_CATALOG == the same
//     catalog AppContext consumes.
//   - A NULL server answer (no active subscription row / webhook still in
//     flight) is the EXPLICIT free answer — it resolves to free unless a paid
//     plan is locally active. The webhook-in-flight no-downgrade guard applies
//     ONLY to null answers, never to an explicit EXPIRED answer.

import { SubscriptionPlan, SubscriptionPlanId, SubscriptionState } from "@/types";
import { PLAN_CATALOG } from "@/lib/plans";

/** Client-bound shape returned by GET /api/billing/subscription. */
export interface ServerSubscriptionShape {
  planId: string;
  /** Effective status computed server-side: ACTIVE | GRACE_PERIOD | EXPIRED. */
  status: "ACTIVE" | "GRACE_PERIOD" | "EXPIRED";
  /** The plan governing entitlements right now (FREE after grace). */
  effectivePlanId: string | null;
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
  graceStartsAt: string | null;
  graceEndsAt: string | null;
  renewalRequired: boolean;
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
    billing: {
      period: "month",
      startedAt: null,
      renewsAt: null,
      amount: 0,
      gstRate: 18,
      graceEndsAt: null,
      renewalRequired: false,
    },
    pendingPlanId: null,
    pendingPeriod: "month",
  };
}

/**
 * Server answer → next subscription state. Mirrors the server's EFFECTIVE
 * verdict; the client never derives expiry from the browser clock.
 *
 * - ACTIVE:       paid plan applies (period/startedAt/renewsAt from the server;
 *                 presets amount/gstRate from the catalog).
 * - GRACE_PERIOD: the subscribed plan STILL governs, but `renewalRequired` is
 *                 true and the grace window is surfaced for the UI.
 * - EXPIRED:      the server says the effective plan is FREE. This explicit
 *                 answer is honored unconditionally (rule 12) — paid access is
 *                 NOT kept. Billing metadata (renewsAt/graceEndsAt) is retained
 *                 so the UI can prompt for renewal.
 * - null:         no active subscription row — resolve to free UNLESS a paid
 *                 plan is locally active (webhook may be in flight after a
 *                 just-verified payment). The Phase 4F no-downgrade guard is
 *                 deliberately limited to this null case.
 */
export function resolveServerSubscription(
  prev: SubscriptionState | null,
  serverSub: ServerSubscriptionShape | null | undefined,
): SubscriptionState {
  const base = prev ?? defaultSubscriptionState();

  if (serverSub) {
    const plan = PLAN_CATALOG.find(
      (p) => p.id === ((serverSub.effectivePlanId ?? serverSub.planId) as SubscriptionPlanId),
    );
    const period = serverSub.period === "year" ? "year" : "month";
    const now = Date.now();

    if (
      (serverSub.status === "ACTIVE" || serverSub.status === "GRACE_PERIOD") &&
      plan
    ) {
      return {
        currentPlanId: plan.id,
        status: serverSub.status === "GRACE_PERIOD" ? "grace" : "active",
        billing: {
          period,
          startedAt: serverSub.startedAt ?? new Date(now).toISOString(),
          renewsAt: serverSub.renewsAt,
          amount: plan.price,
          gstRate: 18,
          lastPaidAt: serverSub.startedAt ?? undefined,
          graceEndsAt: serverSub.graceEndsAt,
          renewalRequired: serverSub.renewalRequired,
        },
        pendingPlanId: base.pendingPlanId ?? null,
        pendingPeriod: base.pendingPeriod ?? "month",
      };
    }

    // Explicit server verdict: the subscription is exhausted. NEVER grant paid
    // access on top of it — even if a paid plan is locally active.
    if (serverSub.status === "EXPIRED") {
      return {
        ...defaultSubscriptionState(),
        billing: {
          ...defaultSubscriptionState().billing,
          period,
          renewsAt: serverSub.renewsAt,
          graceEndsAt: serverSub.graceEndsAt,
          renewalRequired: true,
        },
      };
    }
  }

  // Explicit free answer (null), unless a paid plan is locally active (webhook
  // in-flight guard — never applies to an EXPIRED verdict above).
  if (
    (base.status === "active" || base.status === "grace") &&
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