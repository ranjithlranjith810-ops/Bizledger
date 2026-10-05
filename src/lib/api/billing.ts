"use client";

import { useCallback, useEffect, useState } from "react";

import { http } from "@/lib/api-client";
import { SubscriptionPlan } from "@/types";

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

// Plan catalog DTO as returned by GET /api/billing/plans (server-authoritative).
// `limits` is the raw persisted limits object; values are positive numbers or
// the string "Unlimited". `price` is the plan's configured price in INR.
export interface PlanDtoLimits {
  customers: number | "Unlimited";
  teamMembers: number | "Unlimited";
  products: number | "Unlimited";
  invoicesPerMonth: number | "Unlimited";
  estimatesPerMonth: number | "Unlimited";
  quotationsPerMonth: number | "Unlimited";
  purchaseOrdersPerMonth: number | "Unlimited";
  directoryListings: number | "Unlimited";
}

export interface PlanDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  period: string;
  businessNetworkIncluded: boolean;
  limits: Partial<PlanDtoLimits>;
}

// Normalize a raw persisted limit value into the client's canonical
// "number | 'Unlimited'" form (single documented convention — see
// src/lib/entitlements.ts isUnlimited). Never yields null/0-as-free ambiguity.
const toLimitValue = (
  value: PlanDtoLimits[keyof PlanDtoLimits] | undefined,
): number | "Unlimited" =>
  value === "Unlimited" || value === -1 ? "Unlimited" : Number(value ?? 0);

const featureLine = (
  limit: number | "Unlimited",
  kind: string,
  whenUnlimited: string,
  singular: string,
  plural: string,
): string | null =>
  limit === "Unlimited"
    ? whenUnlimited
    : limit <= 0
    ? null
    : `${limit} ${limit === 1 ? singular : plural}${kind === "/ month" ? " / month" : ""}`;

const limitCopy: Record<
  | "customers"
  | "teamMembers"
  | "products"
  | "invoicesPerMonth"
  | "estimatesPerMonth"
  | "quotationsPerMonth"
  | "purchaseOrdersPerMonth"
  | "directoryListings",
  { kind: string; unlimited: string; singular: string; plural: string }
> = {
  customers: { kind: "customers", unlimited: "Unlimited customers", singular: "customer", plural: "customers" },
  teamMembers: { kind: "", unlimited: "Unlimited team members", singular: "team member seat", plural: "team member seats" },
  products: { kind: "", unlimited: "Unlimited products & inventory", singular: "product", plural: "products" },
  invoicesPerMonth: { kind: "/ month", unlimited: "Unlimited invoices / month", singular: "invoice", plural: "invoices" },
  estimatesPerMonth: { kind: "/ month", unlimited: "Unlimited estimates / month", singular: "estimate", plural: "estimates" },
  quotationsPerMonth: { kind: "/ month", unlimited: "Unlimited quotations / month", singular: "quotation", plural: "quotations" },
  purchaseOrdersPerMonth: { kind: "/ month", unlimited: "Unlimited purchase orders / month", singular: "purchase order", plural: "purchase orders" },
  directoryListings: { kind: "", unlimited: "Business Network included (unlimited listings)", singular: "business listing", plural: "business listings" },
};

// Converts a server PlanCatalog DTO into the client `SubscriptionPlan` shape.
// Features are DERIVED from the persisted limits (single source of truth) —
// there is no separate features store on the backend. Unknown ids/limits are
// preserved, never dropped: the client is a consumer of the DB catalog, not a
// second catalog definition.
export function toSubscriptionPlans(rows: PlanDto[]): SubscriptionPlan[] {
  return rows.map((row) => {
    const customers = toLimitValue(row.limits.customers);
    const teamMembers = toLimitValue(row.limits.teamMembers);
    const products = toLimitValue(row.limits.products);
    const invoicesPerMonth = toLimitValue(row.limits.invoicesPerMonth);
    const estimatesPerMonth = toLimitValue(row.limits.estimatesPerMonth);
    const quotationsPerMonth = toLimitValue(row.limits.quotationsPerMonth);
    const purchaseOrdersPerMonth = toLimitValue(row.limits.purchaseOrdersPerMonth);
    const directoryListings = toLimitValue(row.limits.directoryListings);

    const features = [
      featureLine(customers, limitCopy.customers.kind, limitCopy.customers.unlimited, limitCopy.customers.singular, limitCopy.customers.plural),
      featureLine(teamMembers, limitCopy.teamMembers.kind, limitCopy.teamMembers.unlimited, limitCopy.teamMembers.singular, limitCopy.teamMembers.plural),
      featureLine(products, limitCopy.products.kind, limitCopy.products.unlimited, limitCopy.products.singular, limitCopy.products.plural),
      featureLine(invoicesPerMonth, limitCopy.invoicesPerMonth.kind, limitCopy.invoicesPerMonth.unlimited, limitCopy.invoicesPerMonth.singular, limitCopy.invoicesPerMonth.plural),
      featureLine(estimatesPerMonth, limitCopy.estimatesPerMonth.kind, limitCopy.estimatesPerMonth.unlimited, limitCopy.estimatesPerMonth.singular, limitCopy.estimatesPerMonth.plural),
      featureLine(quotationsPerMonth, limitCopy.quotationsPerMonth.kind, limitCopy.quotationsPerMonth.unlimited, limitCopy.quotationsPerMonth.singular, limitCopy.quotationsPerMonth.plural),
      featureLine(purchaseOrdersPerMonth, limitCopy.purchaseOrdersPerMonth.kind, limitCopy.purchaseOrdersPerMonth.unlimited, limitCopy.purchaseOrdersPerMonth.singular, limitCopy.purchaseOrdersPerMonth.plural),
      featureLine(directoryListings, limitCopy.directoryListings.kind, limitCopy.directoryListings.unlimited, limitCopy.directoryListings.singular, limitCopy.directoryListings.plural),
    ].filter((f): f is string => f !== null);

    if (row.businessNetworkIncluded && directoryListings === 0) {
      features.push("Business Network (public directory)");
    }

    return {
      id: row.id,
      name: row.name,
      price: row.price,
      period: row.period === "year" ? "year" : "month",
      description: row.description ?? "",
      businessNetworkIncluded: row.businessNetworkIncluded,
      features,
      limits: {
        customers,
        teamMembers,
        products,
        invoicesPerMonth,
        estimatesPerMonth,
        quotationsPerMonth,
        purchaseOrdersPerMonth,
        directoryListings,
      },
    };
  });
}

// Phase 4E client surface for the billing backend. `keyId` is the PUBLIC
// Razorpay Key ID; no secret ever crosses this boundary.
export const billingApi = {
  listPlans: () => http.get<{ plans: PlanDto[] }>("/api/billing/plans"),
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