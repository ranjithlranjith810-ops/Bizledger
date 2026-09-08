// Phase 4C — server-side billing calculation.
//
// SCOPE:
//   Price + GST math for BizLedger subscriptions, always in Decimal (never
//   binary floats). Meant to be shared by checkout/order creation in Phase 4D.
//
// RULES (single source of truth, mirrors src/lib/billing.ts policy):
//   • period: "month" | "year" only — anything else is rejected (no fallback).
//   • annual price = monthly price × 10  (the existing BizLedger promo rule).
//   • GST rate = 18% (GST_RATE from src/lib/billing.ts).
//   • every monetary value is rounded to exactly 2 decimal places using
//     ROUND_HALF_UP — the same policy as the existing Math.round(...)/0.01
//     rounding in src/lib/billing.ts, applied in Decimal space.
//
// SECURITY BOUNDARY:
//   This module computes totals from a PlanCatalog-backed `price` only. It
//   never accepts a client-supplied price / gstRate / gstAmount / total —
//   those inputs are simply not part of its API. Callers (Phase 4D checkout)
//   must fetch the plan from PlanCatalog server-side and pass it here.
//
// LIMITS:
//   Does NOT create PaymentRecord / BusinessSubscription, does NOT call
//   Razorpay, does NOT touch the API. Pure calculation service.

import "server-only";

import { Decimal } from "@prisma/client/runtime/client";
import { GST_RATE } from "@/lib/billing";

export type BillingPeriod = "month" | "year";

export const BILLING_PERIODS: readonly BillingPeriod[] = ["month", "year"];

const DEC_100 = new Decimal("100");
const DEC_10 = new Decimal("10");
const DEC_18 = new Decimal(String(GST_RATE));

/**
 * A plan's pricing source for calculation. Any DecimalJsLike shape (Prisma's
 * Decimal — including a string/number — is accepted) as long as it carries the
 * plan `id` and the catalog `price`.
 */
export interface BillingPlanSource {
  id: string;
  price: Decimal | number | string;
}

/** Rejected period. Distinct error so callers can map to 400 cleanly. */
export class BillingPeriodError extends Error {
  readonly code = "INVALID_PERIOD";

  constructor(period: unknown) {
    super(`billing period must be "month" or "year" (got ${JSON.stringify(period)})`);
    this.name = "BillingPeriodError";
  }
}

/**
 * A monetary amount that cannot be converted to integer paise safely (non-
 * finite/negative, or outside the exact 2dp/paise representable range). Mapped
 * to 400 by the API error handler.
 */
export class BillingAmountError extends Error {
  readonly code = "INVALID_AMOUNT";

  constructor(message = "billing amount is not a valid currency value") {
    super(message);
    this.name = "BillingAmountError";
  }
}

function toDecimal(value: Decimal | number | string): Decimal {
  return new Decimal(value);
}

/** Strict period validation — month and year only, never a silent fallback. */
export function validatePeriod(period: unknown): BillingPeriod {
  if (period === "month" || period === "year") return period;
  throw new BillingPeriodError(period);
}

/**
 * Base amount for a period: monthly = catalog price; annual = price × 10.
 * Always rounded to 2dp in Decimal space before anything is derived from it.
 */
export function calculateBaseAmount(
  plan: BillingPlanSource,
  period: BillingPeriod
): Decimal {
  const monthly = toDecimal(plan.price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (period === "month") return monthly;
  return monthly.mul(DEC_10).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * GST on a base amount at the configured rate (18%). Returns the rate and the
 * rounded 2dp amount. Accepts a Decimal or a number/string and coerces to
 * Decimal internally — callers are never required to pre-construct one.
 */
export function calculateGST(baseAmount: Decimal | number | string): {
  gstRate: Decimal;
  gstAmount: Decimal;
} {
  const amount = toDecimal(baseAmount);
  const gstAmount = amount
    .mul(DEC_18)
    .div(DEC_100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { gstRate: new Decimal(String(GST_RATE)), gstAmount };
}

export interface BillingTotals {
  planId: string;
  period: BillingPeriod;
  baseAmount: Decimal;
  gstRate: Decimal;
  gstAmount: Decimal;
  totalAmount: Decimal;
  currency: "INR";
}

/**
 * Full server-side totals for a plan+period.
 *   base = price (month) or price × 10 (year)
 *   gst  = base × GST_RATE%
 *   total = base + gst
 */
export function calculateBillingTotals(
  plan: BillingPlanSource,
  period: BillingPeriod
): BillingTotals {
  const validated = validatePeriod(period);
  const baseAmount = calculateBaseAmount(plan, validated);
  const { gstRate, gstAmount } = calculateGST(baseAmount);
  const totalAmount = baseAmount
    .plus(gstAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    planId: plan.id,
    period: validated,
    baseAmount,
    gstRate,
    gstAmount,
    totalAmount,
    currency: "INR",
  };
}

/**
 * JSON-safe serialization of a monetary Decimal to exactly two decimals
 * ("999.00", "1798.20"). Use for anything that crosses the wire — never send
 * a trailing-precision Decimal or a float.
 */
export function moneyString(value: Decimal | number | string): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Decimal-safe conversion of a 2dp INR amount to integer paise (the Razorpay
 * minimum unit). NEVER multiplied through a binary float:
 *   ₹1178.82 -> 117882
 *   ₹9990.00 -> 999000
 * The input is rounded in Decimal space first, so a rounded 2dp total converts
 * exactly. Throws BillingAmountError for non-finite or negative values.
 */
export function inrToPaise(amount: Decimal | number | string): number {
  const d = toDecimal(amount);
  if (!d.isFinite() || d.isNegative()) {
    throw new BillingAmountError("billing amount is not a valid currency value");
  }
  const paise = d.mul(DEC_100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return paise.toNumber();
}

/** Serialized, wire-safe form of BillingTotals (for Phase 4D order payloads). */
export function serializeTotals(totals: BillingTotals): {
  planId: string;
  period: BillingPeriod;
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  currency: "INR";
} {
  return {
    planId: totals.planId,
    period: totals.period,
    baseAmount: moneyString(totals.baseAmount),
    gstRate: moneyString(totals.gstRate),
    gstAmount: moneyString(totals.gstAmount),
    totalAmount: moneyString(totals.totalAmount),
    currency: totals.currency,
  };
}