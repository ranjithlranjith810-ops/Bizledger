// Phase 4F follow-up + subscription lifecycle — read-only BusinessSubscription
// DTO for the billing UI.
//
// PURPOSE: the frontend subscription state used to hydrate from localStorage
// (retired) and there was no backend→frontend path for the webhook-activated
// subscription, so a genuinely ACTIVE paid subscription still rendered FREE.
// This module is the smallest authoritative read seam: the ACTIVE subscription
// for a business, as a safe DTO. Nothing here can mutate payment, webhook, or
// subscription rows — activation remains exclusively the webhook's job.
//
// EFFECTIVE LIFECYCLE (server-authoritative, never the browser clock):
//   The stored `renewsAt` is the paid-period end. `computeSubscriptionLifecycle`
//   derives the EFFECTIVE status from stored dates + the SERVER clock only:
//     ACTIVE  -> subscribed plan governs (paid period, incl. renewsAt day).
//     GRACE   -> subscribed plan still governs for the 3-calendar-day window.
//     EXPIRED -> effective plan is FREE; the raw row (an ACTIVE business_subscription
//                row) is left untouched — expiry is a DERIVED state, never a
//                background mutation.
//   The raw database status is NOT rewritten when time passes (rule 9).
//
// SAFETY:
//   - DTO only: planId/status/period/timestamps/grace bounds. No raw rows, no
//     PaymentRecord, no WebhookEvent, no relations, no money re-derivation.
//   - `renewsAt` may be NULL when the subscription was activated before the
//     activation path started storing a renewal date; it is DERIVED (never
//     written back) from startedAt + period so the billing UI's "Renews on"
//     renders honestly. This is display-only — no DB write happens here.

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  computeSubscriptionLifecycle,
  FREE_PLAN_ID,
} from "@/lib/plans";
import type { EffectiveSubscriptionStatus } from "@/lib/plans";

/** One BUSINESS-month or business-year of subscription time, in days. */
const RENEWAL_DAYS: Record<string, number> = { month: 30, year: 365 };

/** Safe, client-bound shape for the current subscription's EFFECTIVE state. */
export interface SubscriptionDto {
  /** The plan the business is subscribed to (chosen by the customer). */
  planId: string;
  /** The plan that governs entitlements right now (FREE after grace expires). */
  effectivePlanId: string;
  /** Effective status derived from stored dates — ACTIVE | GRACE_PERIOD | EXPIRED. */
  status: EffectiveSubscriptionStatus;
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
  graceStartsAt: string | null;
  graceEndsAt: string | null;
  /** True once renewsAt has passed (a renewal/payment is required now). */
  renewalRequired: boolean;
}

/**
 * Returns the effective subscription state for a business (null when the
 * business has no ACTIVE subscription row). Deterministic: newest tie-breaks.
 * Never throws for a missing subscription — absence is a normal user state.
 *
 * When a raw-ACTIVE row exists, its effective status is computed from the
 * stored `renewsAt` against the SERVER clock. Post-grace the row is STILL
 * returned (status EXPIRED, effectivePlanId = FREE) so the UI can show a
 * renewal notice — no raw status is mutated, no data is deleted.
 */
export async function getBusinessSubscriptionDto(
  businessId: string,
): Promise<SubscriptionDto | null> {
  const row = await prisma.businessSubscription.findFirst({
    where: { businessId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      planId: true,
      status: true,
      period: true,
      startedAt: true,
      renewsAt: true,
    },
  });
  if (!row) return null;

  let renewsAtDate = row.renewsAt;
  if (!renewsAtDate && row.startedAt) {
    const days = RENEWAL_DAYS[row.period] ?? RENEWAL_DAYS.month;
    renewsAtDate = new Date(row.startedAt.getTime() + days * 86400000);
  }

  const lifecycle = computeSubscriptionLifecycle(renewsAtDate, new Date());

  return {
    planId: row.planId,
    effectivePlanId:
      lifecycle.status === "EXPIRED" ? FREE_PLAN_ID : row.planId,
    status: lifecycle.status,
    period: row.period,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    renewsAt: renewsAtDate ? renewsAtDate.toISOString() : null,
    graceStartsAt: lifecycle.graceStartsAt?.toISOString() ?? null,
    graceEndsAt: lifecycle.graceEndsAt?.toISOString() ?? null,
    renewalRequired: lifecycle.renewalRequired,
  };
}