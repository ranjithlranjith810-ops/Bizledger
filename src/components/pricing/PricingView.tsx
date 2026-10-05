"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Check, ArrowLeft, RefreshCw } from "lucide-react";
import { formatINR, planLabel } from "@/lib/billing";
import {
  checkEntitlement,
  isUnlimited,
  usageForKind,
  LimitKind,
  ResourceUsage,
} from "@/lib/entitlements";
import type { SubscriptionPlan } from "@/types";

const KIND_ROWS: { kind: LimitKind; label: string; suffix: string }[] = [
  { kind: "customers", label: "Customers", suffix: "" },
  { kind: "teamMembers", label: "Team seats", suffix: "" },
  { kind: "products", label: "Products", suffix: "" },
  { kind: "invoices", label: "Invoices", suffix: "this month" },
  { kind: "estimates", label: "Estimates", suffix: "this month" },
  { kind: "quotations", label: "Quotations", suffix: "this month" },
  { kind: "purchaseOrders", label: "Purchase orders", suffix: "this month" },
  { kind: "directoryListing", label: "Business listings", suffix: "" },
];

// Usage vs the plan's configured ceiling, e.g. "Customers 2 / 2". Rows whose
// ceiling is 0 (feature not included) are omitted — "0 / 0" adds noise, not
// information. "Unlimited" ceilings show the used count without a cap.
const UsageRow: React.FC<{
  plan: SubscriptionPlan;
  kind: LimitKind;
  label: string;
  suffix: string;
  usage: ResourceUsage;
}> = ({ plan, kind, label, suffix, usage }) => {
  const check = checkEntitlement(plan, kind, usageForKind(usage, kind));
  if (check.limit === 0) return null;
  const unlimited = isUnlimited(check.limit);
  const pct = unlimited
    ? -1
    : Math.min(100, Math.round((check.used / (check.limit as number)) * 100));
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 truncate">
            {label}
            {suffix ? ` (${suffix})` : ""}
          </span>
          <span className="text-xs font-bold text-gray-900 tabular-nums shrink-0 ml-2">
            {check.used}
            {unlimited ? " / ∞" : ` / ${check.limit}`}
          </span>
        </div>
        {!unlimited && (
          <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                check.allowed ? "bg-emerald-500" : "bg-rose-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="mt-0.5 text-[10px] text-gray-400">
          {unlimited
            ? "No limit on this plan"
            : check.allowed
            ? `${check.remaining} remaining`
            : "Limit reached — upgrade to create more"}
        </p>
      </div>
    </div>
  );
};

export const PricingView: React.FC = () => {
  const {
    plans,
    currentPlanId,
    setPendingPlan,
    planCatalogStatus,
    retryPlanCatalog,
    currentUsage,
  } = useApp();
  const router = useRouter();

  const isCurrent = (id: string) => currentPlanId === id;

  // Selecting a plan does NOT activate it. It only sets a pending checkout
  // selection and routes to checkout; the plan becomes active after a
  // successful payment / admin assignment.
  const handleSelectPlan = (id: string) => {
    if (id === currentPlanId) return;
    setPendingPlan(id, "month");
    router.push("/pricing/checkout");
  };

  const gridCols =
    plans.length > 2
      ? "md:grid-cols-2 xl:grid-cols-3"
      : plans.length === 2
      ? "md:grid-cols-2"
      : "";

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Pricing Plans</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Select the plan that works best for your business operations.
          </p>
        </div>
        <button
          onClick={() => router.push("/settings/billing")}
          className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Subscription &amp; Billing</span>
        </button>
      </div>

      {/* Plan Tiers — rendered from the DB-backed catalog (GET /api/billing/plans),
          never from a hard-coded list. Deactivated plans never appear here, and
          admin edits reflect without a redeploy. */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#191c1e] uppercase tracking-wider">Available Subscription Tiers</h3>

        {planCatalogStatus === "loading" && plans.length <= 1 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-6 rounded-2xl border border-[#eceef0] bg-white space-y-4 animate-pulse">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-8 w-20 bg-gray-200 rounded" />
                <div className="h-3 w-40 bg-gray-100 rounded" />
                <div className="h-3 w-52 bg-gray-100 rounded" />
                <div className="h-3 w-48 bg-gray-100 rounded" />
                <div className="h-9 w-full bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {planCatalogStatus === "error" && (
          <div className="flex items-center justify-between gap-4 bg-[#fef2f2] border border-rose-200 rounded-xl px-4 py-3">
            <p className="text-xs text-[#93000b]">
              Couldn&apos;t reach the plan catalog. Showing the default plan set from this
              device — changes made in the admin console won&apos;t appear until the server is reachable.
            </p>
            <button
              onClick={retryPlanCatalog}
              className="flex items-center gap-1.5 shrink-0 bg-white border border-rose-200 text-[#93000b] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="bg-white p-10 rounded-2xl border border-[#eceef0] shadow-xs text-center">
            <h3 className="text-sm font-bold text-[#191c1e]">No plans available</h3>
            <p className="text-xs text-gray-500 mt-2">
              The plan catalog is empty. Contact support to set up subscription plans.
            </p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-6 ${gridCols}`}>
            {plans.map((plan) => {
              const current = isCurrent(plan.id);
              const tierLabel = planLabel(plan.name);
              const priceDisplay =
                plan.price === 0 ? "FREE" : formatINR(plan.price);
              const periodSuffix = `${plan.period === "year" ? "/ year" : "/ month"}`;
              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-2xl border bg-white flex flex-col justify-between transition-all ${
                    current
                      ? "border-[#93000b] ring-2 ring-[#93000b]/20 shadow-md"
                      : "border-[#eceef0] hover:border-gray-300"
                  }`}
                >
                  {plan.price > 0 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#93000b] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
                      {current ? "Active Plan" : planLabel(plan.name)}
                    </div>
                  )}
                  <div className="space-y-4">
                    <div>
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${
                          plan.price > 0 ? "text-[#93000b]" : "text-gray-500"
                        }`}
                      >
                        {tierLabel}
                      </span>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono text-gray-900">
                          {priceDisplay}
                        </span>
                        <span className="text-xs text-gray-500">{periodSuffix}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{plan.description}</p>
                    </div>

                    {plan.features.length > 0 && (
                      <div className="space-y-2.5 text-xs text-gray-600 divide-y divide-gray-100 pt-2">
                        {plan.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 pt-1">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3 border-t border-gray-100 pt-3">
                      {KIND_ROWS.map((row) => (
                        <UsageRow
                          key={row.kind}
                          plan={plan}
                          kind={row.kind}
                          label={row.label}
                          suffix={row.suffix}
                          usage={currentUsage}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    {current ? (
                      <span className="w-full inline-flex items-center justify-center bg-[#fef2f2] text-[#93000b] py-2.5 rounded-xl text-xs font-bold border border-rose-200">
                        ✓ Current Active Plan
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSelectPlan(plan.id)}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs ${
                          plan.price === 0
                            ? "bg-[#f2f4f6] hover:bg-gray-200 text-gray-800"
                            : "bg-[#93000b] hover:bg-[#770008] text-white"
                        }`}
                      >
                        {plan.price === 0 ? "Get Started Free" : `Continue to Checkout — ${priceDisplay}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};