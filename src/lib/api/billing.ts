"use client";

import { useCallback, useEffect, useState } from "react";

import { http } from "@/lib/api-client";

export interface PaidCheckout {
  requiresPayment: true;
  orderId: string;
  keyId: string | null;
  amount: number;
  currency: "INR";
  planId: string;
  period: "month" | "year";
  baseAmount: string;
  gstAmount: string;
  totalAmount: string;
}

export interface FreeCheckout {
  requiresPayment: false;
  planId: string;
  period: "month" | "year";
  amount: 0;
  currency: "INR";
  baseAmount: "0.00";
  gstAmount: "0.00";
  totalAmount: "0.00";
}

export type CheckoutResult =
  | { checkout: PaidCheckout }
  | { checkout: FreeCheckout };

export interface PaymentVerificationRequest {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface PaymentVerificationResult {
  verified: true;
  paymentId: string;
  orderId: string;
  status: "VERIFIED";
}

export interface BillingSubscriptionDto {
  planId: string;
  effectivePlanId: string;
  status: "ACTIVE" | "GRACE_PERIOD" | "EXPIRED";
  period: string;
  startedAt: string | null;
  renewsAt: string | null;
  graceStartsAt: string | null;
  graceEndsAt: string | null;
  renewalRequired: boolean;
}

// Phase 6A — billing history + receipt (Billing Invoice / Payment Receipt).
export interface BillingHistoryRecord {
  id: string;
  date: string;
  planId: string;
  planName: string;
  billingPeriod: string;
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  method: string | null;
  orderId: string | null;
  description: string | null;
  invoice: { id: string; invoiceNumber: string; invoiceDate: string } | null;
}

export interface BillingInvoiceDto {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  paymentDate: string;
  billingPeriod: string;
  planId: string;
  planName: string;
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  currency: string;
  orderId: string;
  paymentMethod: string | null;
  supplierSnapshot: Record<string, unknown>;
  customerSnapshot: Record<string, unknown>;
  createdAt: string;
}

export interface BillingPaymentDetail {
  payment: {
    id: string;
    planId: string;
    planName: string;
    billingPeriod: string;
    baseAmount: string;
    gstRate: string;
    gstAmount: string;
    totalAmount: string;
    currency: string;
    status: string;
    method: string | null;
    orderId: string | null;
    paymentId: string | null;
    description: string | null;
    createdAt: string;
  };
  invoice: BillingInvoiceDto | null;
}

// Phase 4E client surface for the billing backend. `keyId` is the PUBLIC
// Razorpay Key ID; no secret ever crosses this boundary.
export const billingApi = {
  createCheckout: (
    businessId: string,
    planId: string,
    period: "month" | "year",
  ) =>
    http.post<CheckoutResult>("/api/billing/checkout", {
      businessId,
      planId,
      period,
    }),
  verifyPayment: (input: PaymentVerificationRequest) =>
    http.post<PaymentVerificationResult>("/api/billing/payment/verify", input),
  getSubscription: (businessId: string) =>
    http.get<{ subscription: BillingSubscriptionDto | null }>(
      "/api/billing/subscription",
      { businessId },
    ),
  getHistory: (businessId: string) =>
    http.get<{ payments: BillingHistoryRecord[] }>("/api/billing/history", {
      businessId,
    }),
  getInvoice: (businessId: string, paymentId: string) =>
    http.get<BillingPaymentDetail>(
      `/api/billing/invoice?paymentId=${encodeURIComponent(paymentId)}`,
      { businessId },
    ),
};

export interface BillingHistoryState {
  status: "idle" | "loading" | "ready" | "error";
  payments: BillingHistoryRecord[];
  reload: () => void;
}

/**
 * Loads the server-authoritative billing history (all attempts) for the active
 * business. `idle` when there is no business yet; `reload` re-fetches (used by
 * the error panel's Retry). Never falls back to localStorage demo payments.
 */
export function useBillingHistory(
  businessId: string | null,
): BillingHistoryState {
  const [payments, setPayments] = useState<BillingHistoryRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    let active = true;
    billingApi
      .getHistory(businessId)
      .then(({ payments: rows }) => {
        if (!active) return;
        setPayments(rows);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [businessId, attempt]);

  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  if (!businessId) {
    return { status: "idle", payments: [], reload };
  }
  return { status, payments, reload };
}