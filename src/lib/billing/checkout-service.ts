// Phase 4D — secure checkout / order creation service.
//
// FLOW (order-first; the Phase 4D architecture):
//   1. plan lookup           — ACTIVE plan ONLY, from plan_catalog (DB)
//   2. period validation     — strict "month" | "year" (Phase 4C calculator)
//   3. FREE (base) plan      — no-payment response; NO order, NO records
//   4. existing subscriptions— reuse a matching PENDING checkout or 409;
//                              ACTIVE always 409 (plan change is a later phase).
//                              The Phase 4A partial unique index is never
//                              bypassed.
//   5. totals                — Phase 4C Decimal calculator
//   6. paise conversion      — Decimal-only (never binary float)
//   7. Razorpay order        — Phase 4B provider (injectable for tests)
//   8. persist               — PENDING subscription + CREATED payment in one
//                              transaction (with the returned orderId)
//   9. response DTO          — safe whitelist, never raw rows / secrets
//
// The browser NEVER controls amount / price / gst / total / currency — those
// inputs are not part of this API. Extra request fields are ignored by the
// route layer, and this service only ever reads planId/period.
//
// Layering: authentication + tenant/role checks live in the ROUTE; the service
// receives businessId AFTER the caller is proven to be an OWNER/ADMIN member.
// Keep it that way — never move auth below the route boundary.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  ConflictError,
  DuplicateResourceError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/business/api-error";
import {
  getActivePlanForBilling,
  type BillingPlanRow,
} from "@/lib/billing/plan-service";
import { FREE_PLAN_ID } from "@/lib/plans";
import {
  BillingPeriodError,
  BillingAmountError,
  calculateBillingTotals,
  inrToPaise,
  moneyString,
  validatePeriod,
  type BillingPeriod,
} from "@/lib/billing/calculator";
import {
  createOrder as defaultCreateOrder,
  razorpayPublicKeyId,
  RazorpayApiError,
  RazorpayConfigError,
  type RazorpayOrder,
} from "@/lib/billing/razorpay";

export interface CheckoutInput {
  planId: unknown;
  period: unknown;
}

/** Free (base) plan: HTTP 200, no order, no records. */
export interface FreeCheckoutDto {
  checkout: {
    requiresPayment: false;
    planId: string;
    period: BillingPeriod;
    amount: 0;
    currency: "INR";
    baseAmount: "0.00";
    gstAmount: "0.00";
    totalAmount: "0.00";
  };
}

/** Paid checkout: everything the Phase 4E UI needs to open the Razorpay modal. */
export interface PaidCheckoutDto {
  checkout: {
    requiresPayment: true;
    orderId: string;
    keyId: string | null;
    amount: number; // paise
    currency: "INR";
    planId: string;
    period: BillingPeriod;
    baseAmount: string;
    gstAmount: string;
    totalAmount: string;
  };
}

export type CheckoutDto = FreeCheckoutDto | PaidCheckoutDto;

export interface CheckoutDeps {
  /**
   * Phase 4B provider. Injectable so automated tests never hit Razorpay; the
   * production default is the real Test Mode provider.
   */
  createOrder?: (input: {
    amount: number;
    currency: string;
    receipt: string;
  }) => Promise<RazorpayOrder>;
  /**
   * Persists the pending subscription + created payment. Injectable so the
   * "database failure" path can be exercised deterministically.
   */
  persist?: typeof persistCheckoutRecords;
}

export interface PersistInput {
  plan: Pick<BillingPlanRow, "id" | "name" | "price" | "businessNetworkIncluded" | "limits">;
  period: BillingPeriod;
  totals: ReturnType<typeof calculateBillingTotals>;
  order: RazorpayOrder;
  receipt: string;
  /** Set when reusing an existing PENDING subscription (same plan+period). */
  subscriptionId?: string;
}

/**
 * Creates the PENDING subscription + CREATED payment record in one transaction
 * and returns the subscription id. Store Decimal totals EXACTLY as calculated;
 * store orderId from the provider; paymentId/razorpayEventId stay null until
 * actual payment (Phase 4F). A P2002 from the partial unique index propagates
 * so callers can treat a concurrent duplicate as idempotent.
 */
export async function persistCheckoutRecords(
  businessId: string,
  input: PersistInput,
): Promise<{ subscriptionId: string }> {
  const { plan, period, totals, order } = input;

  const snapshot: Prisma.InputJsonValue = {
    id: plan.id,
    name: plan.name,
    price: moneyString(plan.price),
    period,
    businessNetworkIncluded: plan.businessNetworkIncluded,
    limits: plan.limits,
  } as Prisma.InputJsonValue;

  return prisma.$transaction(async (tx) => {
    const subscriptionId =
      input.subscriptionId ??
      (
        await tx.businessSubscription.create({
          data: {
            businessId,
            planId: plan.id,
            status: "PENDING",
            period,
            planSnapshot: snapshot,
            startedAt: null,
          },
          select: { id: true },
        })
      ).id;

    await tx.paymentRecord.create({
      data: {
        businessId,
        subscriptionId,
        planId: plan.id,
        planName: plan.name,
        billingPeriod: period,
        baseAmount: totals.baseAmount,
        gstRate: totals.gstRate,
        gstAmount: totals.gstAmount,
        totalAmount: totals.totalAmount,
        currency: "INR",
        status: "CREATED",
        orderId: order.orderId,
        description: "Paid subscription checkout",
      },
    });

    return { subscriptionId };
  });
}

function isP2002(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Short, unique, secret-free Razorpay receipt (<= 40 chars). */
function buildReceipt(businessId: string): string {
  const short = businessId.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "biz";
  const tick = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `biz_${short}_${tick}_${rand}`;
}

function buildFreeCheckout(planId: string, period: BillingPeriod): FreeCheckoutDto {
  return {
    checkout: {
      requiresPayment: false,
      planId,
      period,
      amount: 0,
      currency: "INR",
      baseAmount: "0.00",
      gstAmount: "0.00",
      totalAmount: "0.00",
    },
  };
}

function buildPaidCheckout(
  totals: ReturnType<typeof calculateBillingTotals>,
  orderId: string,
  amountPaise: number,
): PaidCheckoutDto {
  return {
    checkout: {
      requiresPayment: true,
      orderId,
      keyId: razorpayPublicKeyId(),
      amount: amountPaise,
      currency: "INR",
      planId: totals.planId,
      period: totals.period,
      baseAmount: moneyString(totals.baseAmount),
      gstAmount: moneyString(totals.gstAmount),
      totalAmount: moneyString(totals.totalAmount),
    },
  };
}

/**
 * Creates a checkout for a business. The caller (route) has already proven the
 * authenticated user is an OWNER/ADMIN ACTIVE member of `businessId`.
 *
 * @throws ValidationError / ResourceNotFoundError / ConflictError /
 *   DuplicateResourceError / RazorpayApiError / RazorpayConfigError /
 *   BillingAmountError — all mapped to safe HTTP statuses by handleApiError.
 */
export async function createCheckoutForBusiness(
  businessId: string,
  input: CheckoutInput,
  deps: CheckoutDeps = {},
): Promise<CheckoutDto> {
  const createOrder = deps.createOrder ?? defaultCreateOrder;
  const persist = deps.persist ?? persistCheckoutRecords;

  if (typeof input.planId !== "string" || input.planId.length === 0) {
    throw new ValidationError("planId is required");
  }
  const plan = await getActivePlanForBilling(input.planId);
  if (!plan) {
    throw new ResourceNotFoundError("Plan not found or unavailable");
  }

  let period: BillingPeriod;
  try {
    period = validatePeriod(input.period);
  } catch (error) {
    if (error instanceof BillingPeriodError) {
      throw new ValidationError("Invalid billing period. Use 'month' or 'year'.");
    }
    throw error;
  }

  // Free plan: never a paid checkout — no Razorpay order, no records.
  if (plan.id === FREE_PLAN_ID) {
    return buildFreeCheckout(plan.id, period);
  }

  // Existing subscription state — never bypass the one-PENDING-or-ACTIVE rule.
  const existing = await prisma.businessSubscription.findFirst({
    where: { businessId, status: { in: ["PENDING", "ACTIVE"] } },
    include: {
      payments: {
        where: { status: "CREATED" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (existing) {
    if (existing.status === "ACTIVE") {
      throw new ConflictError("This business already has an active subscription");
    }
    if (existing.planId !== plan.id || existing.period !== period) {
      throw new ConflictError("A different checkout is already in progress for this business");
    }
    const previous = existing.payments[0];
    if (previous?.orderId) {
      // Idempotent reuse: same business+plan+period checkout already created a
      // Razorpay order — return it, do NOT create another order or records.
      const reusedTotals = calculateBillingTotals(
        { id: plan.id, price: plan.price },
        period,
      );
      return buildPaidCheckout(
        reusedTotals,
        previous.orderId,
        inrToPaise(previous.totalAmount),
      );
    }
    // fall through: same plan/period PENDING but no order yet — reuse the
    // subscription and attach a new CREATED payment with a new order.
  }

  const totals = calculateBillingTotals({ id: plan.id, price: plan.price }, period);
  const paise = inrToPaise(totals.totalAmount);
  if (paise < 100) {
    throw new ValidationError("Checkout amount is below the minimum supported by the payment provider");
  }

  const receipt = buildReceipt(businessId);

  let order: RazorpayOrder;
  try {
    order = await createOrder({ amount: paise, currency: "INR", receipt });
  } catch (error) {
    if (error instanceof RazorpayApiError || error instanceof RazorpayConfigError) {
      throw error;
    }
    // Defensive normalization: never let a raw provider error (which could echo
    // request internals) reach the API layer. Log only non-sensitive shape.
    console.error(
      "checkout: Razorpay order creation failed",
      error instanceof Error
        ? { name: error.name, code: error instanceof BillingAmountError ? error.code : undefined }
        : { type: "non-error" },
    );
    throw new RazorpayApiError({ message: "Razorpay order creation failed" });
  }

  if (!order?.orderId || order.currency !== "INR" || !Number.isInteger(order.amount) || order.amount !== paise) {
    throw new RazorpayApiError({ message: "Razorpay returned an unexpected order" });
  }

  const subscriptionId =
    existing && existing.status === "PENDING" ? existing.id : undefined;

  try {
    await persist(businessId, {
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        businessNetworkIncluded: plan.businessNetworkIncluded,
        limits: plan.limits,
      },
      period,
      totals,
      order,
      receipt,
      subscriptionId,
    });
  } catch (error) {
    if (isP2002(error)) {
      // A concurrent checkout won the race. Reuse theirs if it matches.
      const winner = await prisma.businessSubscription.findFirst({
        where: { businessId, status: "PENDING" },
        include: {
          payments: {
            where: { status: "CREATED" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      if (
        winner &&
        winner.planId === plan.id &&
        winner.period === period &&
        winner.payments[0]?.orderId
      ) {
        console.error("checkout: orphaned Razorpay order", order.orderId, "replaced by concurrent checkout");
        const winnerTotals = calculateBillingTotals(
          { id: plan.id, price: plan.price },
          period,
        );
        return buildPaidCheckout(
          winnerTotals,
          winner.payments[0].orderId,
          inrToPaise(winner.payments[0].totalAmount),
        );
      }
      throw new ConflictError("A checkout is already in progress for this business");
    }
    if (error instanceof DuplicateResourceError) {
      throw error;
    }
    // Local DB failed AFTER the Razorpay order succeeded — never claim success.
    // The orderId is preserved in the log so the orphaned Test Mode order can
    // be investigated; the response stays a safe 500.
    console.error("checkout: persistence failed after Razorpay order", order.orderId, "created");
    throw new Error("Failed to persist checkout");
  }

  return buildPaidCheckout(totals, order.orderId, order.amount);
}