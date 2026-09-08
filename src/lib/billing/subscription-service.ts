// Phase 4F follow-up — read-only BusinessSubscription DTO for the billing UI.
//
// PURPOSE: the frontend subscription state used to hydrate from localStorage
// (retired) and there was no backend→frontend path for the webhook-activated
// subscription, so a genuinely ACTIVE paid subscription still rendered FREE.
// This module is the smallest authoritative read seam: the ACTIVE subscription
// for a business, as a safe DTO. Nothing here can mutate payment, webhook, or
// subscription rows — activation remains exclusively the webhook's job.
//
// SAFETY:
//   - DTO only: planId/status/period/timestamps. No raw rows, no PaymentRecord,
//     no WebhookEvent, no relations, no money re-derivation.
//   - `renewsAt` may be NULL when the subscription was activated before the
//     activation path started storing a renewal date; it is DERIVED (never
//     written back) from startedAt + period so the billing UI's "Renews on"
//     renders honestly. This is display-only — no DB write happens here.

import "server-only";

import { prisma } from "@/lib/prisma";

/** One BUSINESS-month or business-year of subscription time, in days. */
const RENEWAL_DAYS: Record<string, number> = { month: 30, year: 365 };

/** Safe, client-bound shape for the current active subscription. */
export interface SubscriptionDto {
  planId: string;
  status: string;
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
}

/**
 * Returns the most recent ACTIVE subscription for a business (null when the
 * business has no active subscription yet). Deterministic: newest tie-breaks.
 * Never throws for a missing subscription — absence is a normal user state.
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

  let renewsAt = row.renewsAt ? row.renewsAt.toISOString() : null;
  if (!renewsAt && row.startedAt) {
    const days = RENEWAL_DAYS[row.period] ?? RENEWAL_DAYS.month;
    renewsAt = new Date(row.startedAt.getTime() + days * 86400000).toISOString();
  }

  return {
    planId: row.planId,
    status: row.status,
    period: row.period,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    renewsAt,
  };
}