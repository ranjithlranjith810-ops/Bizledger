"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { Download, ArrowRight, AlertTriangle, Zap } from "lucide-react";
import { formatINR } from "@/lib/billing";
import { SubscriptionPlan } from "@/types";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const SubscriptionBillingView: React.FC = () => {
  const router = useRouter();
  const {
    currentPlanId,
    plans,
    setPendingPlan,
    paymentHistory,
    subscription,
    customers,
    products,
    currentUsage,
    activePlan,
    addNotification,
  } = useApp();

  // The EFFECTIVE plan governs entitlements and the usage gauges. This is the
  // Free plan when no paid plan is active, so gauges always reflect real limits
  // instead of fake fallbacks (previously 150/10/500).
  const currentPlan = activePlan ?? plans.find((p) => p.id === currentPlanId);
  const planDisplayName = currentPlan?.name.replace(/ Plan$/, "") ?? "No Active Plan";

  const customersLimit: number =
    typeof currentPlan?.limits.customers === "number" ? currentPlan.limits.customers : 0;
  const teamMembersLimit: number =
    typeof currentPlan?.limits.teamMembers === "number" ? currentPlan.limits.teamMembers : 0;
  const productsLimit: number =
    typeof currentPlan?.limits.products === "number" ? currentPlan.limits.products : 0;
  const invoicesLimit: number | "Unlimited" =
    currentPlan?.limits.invoicesPerMonth ?? "Unlimited";
  const dirUsage = currentUsage.directoryListings;
  const dirLimit = currentPlan?.limits.directoryListings ?? 0;
  const networkIncluded = !!currentPlan?.businessNetworkIncluded;

  // `used` ceilings are the denominator for the gauge bars; decomposed below so
  // the displayed quota always matches what the entitlement engine enforces.
  const usage = {
    customersUsed: customers.length,
    customersLimit,
    teamMembersUsed: currentUsage.teamMembers,
    teamMembersLimit,
    productsUsed: products.length,
    productsLimit,
    invoicesUsed: currentUsage.invoices,
    invoicesLimit,
  };

  // The EFFECTIVE (Free-by-default) plan always governs entitlements, so the
  // plan is "active" in the sense that its limits apply. `isPaidPlan` tracks
  // whether that plan is a paid/active subscription (drives the upgrade CTA).
  const isActive = !!currentPlan;
  const isPaidPlan = subscription?.status === "active";

  const goCheckout = (planId: SubscriptionPlan["id"]) => {
    if (planId === currentPlanId) return;
    setPendingPlan(planId, "month");
    router.push("/pricing/checkout");
  };

  const historyRows = paymentHistory.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Subscription & Billing Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Monitor plan limits, manage the billing cycle, download GST tax receipts, or upgrade your capacity.
          </p>
        </div>
        {!isPaidPlan && (
          <button
            onClick={() => router.push("/pricing")}
            className="bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            Subscribe Now
          </button>
        )}
      </div>

      {/* Current Active Plan Overview & Usage Gauges */}
      <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#eceef0]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center font-bold text-xl">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-gray-900">{planDisplayName}</h3>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}
                >
                  {isActive ? "Active" : "No active plan"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isPaidPlan ? (
                  <>
                    Billed {subscription.billing.period === "month" ? "monthly" : "yearly"} at{" "}
                    <strong className="text-gray-800 font-mono">
                      {formatINR(currentPlan?.price ?? 0)}/{subscription.billing.period === "month" ? "month" : "year"}
                    </strong>{" "}
                    • {subscription.billing.renewsAt ? `Renews on ${fmtDate(subscription.billing.renewsAt)}` : ""}
                  </>
                ) : (
                  "Free plan — no subscription payment required. Upgrade to add capacity."
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Usage Gauges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">Customers Ledger</span>
              <span className="font-mono text-gray-500">
                {usage.customersUsed} / {usage.customersLimit}
              </span>
            </div>
            <div className="w-full bg-[#f2f4f6] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#93000b] h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (usage.customersUsed / (usage.customersLimit || 1)) * 100)}%`,
                }}
              ></div>
            </div>
            <span className="text-[11px] text-gray-400 block">
              {Math.round((usage.customersUsed / (usage.customersLimit || 1)) * 100)}% of quota utilized
            </span>
          </div>

          <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Team Seats</span>
                <span className="font-mono text-gray-500">
                  {usage.teamMembersUsed} / {usage.teamMembersLimit}
                </span>
              </div>
              <div className="w-full bg-[#f2f4f6] h-2 rounded-full overflow-hidden">
                {usage.teamMembersLimit > 0 && (
                  <div
                    className="bg-purple-600 h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (usage.teamMembersUsed / usage.teamMembersLimit) * 100)}%`,
                    }}
                  ></div>
                )}
              </div>
              <span className="text-[11px] text-gray-400 block">
                {usage.teamMembersLimit > 0
                  ? `${Math.max(0, usage.teamMembersLimit - usage.teamMembersUsed)} seats available`
                  : "No team seats on your plan"}
              </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">Inventory Items</span>
              <span className="font-mono text-gray-500">
                {usage.productsUsed} / {usage.productsLimit}
              </span>
            </div>
            <div className="w-full bg-[#f2f4f6] h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (usage.productsUsed / (usage.productsLimit || 1)) * 100)}%`,
                }}
              ></div>
            </div>
            <span className="text-[11px] text-gray-400 block">
              {Math.round((usage.productsUsed / (usage.productsLimit || 1)) * 100)}% of quota utilized
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">Monthly Invoices</span>
              <span className="font-mono text-gray-500">
                {usage.invoicesLimit === "Unlimited"
                  ? "Unlimited"
                  : `${usage.invoicesUsed} / ${usage.invoicesLimit}`}
              </span>
            </div>
            <div className="w-full bg-[#f2f4f6] h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.invoicesLimit === "Unlimited" ? "bg-emerald-500 w-full" : "bg-emerald-500"
                }`}
                style={
                  usage.invoicesLimit === "Unlimited"
                    ? { width: "100%" }
                    : { width: `${Math.min(100, (usage.invoicesUsed / (usage.invoicesLimit as number)) * 100)}%` }
                }
              ></div>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium block">
              {usage.invoicesLimit === "Unlimited" ? "No cap on sales invoices" : "Invoice quota"}
            </span>
          </div>
        </div>

        {/* Business Network usage */}
        <div className="pt-4 border-t border-[#eceef0]">
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-gray-700">Business Network (Directory)</span>
              <span className="text-gray-400 ml-2">
                {networkIncluded ? "Included in your plan" : "Not included in your plan"}
              </span>
            </div>
            <span className="font-mono text-gray-500">
              {networkIncluded
                ? dirLimit === "Unlimited"
                  ? `${dirUsage} used • Included`
                  : `${dirUsage} / ${dirLimit} listings used`
                : "Requires paid plan"}
            </span>
          </div>
          {networkIncluded && dirLimit !== "Unlimited" &&
          <div className="w-full bg-[#f2f4f6] h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-[#93000b] h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (dirUsage / dirLimit) * 100)}%` }}
            ></div>
          </div>}
        </div>
      </div>

      {/* Available Plans */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#191c1e] uppercase tracking-wider">Available Subscription Tiers</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => {
            const isCurrent = currentPlanId === p.id;
            const popular = p.popular;
            return (
              <div
                key={p.id}
                className={`p-6 rounded-2xl border bg-white flex flex-col justify-between relative transition-all ${
                  isCurrent ? "border-[#93000b] ring-2 ring-[#93000b]/20 shadow-md" : "border-[#eceef0] hover:border-gray-300"
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#93000b] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
                    Most Popular {isCurrent ? "• Active Plan" : ""}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{p.name.replace(/ Plan$/, "")}</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-gray-900">{formatINR(p.price)}</span>
                      <span className="text-xs text-gray-500">/ month</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{p.description}</p>
                  </div>

                  <div className="space-y-2.5 text-xs text-gray-600 divide-y divide-gray-100 pt-2">
                    {p.features.slice(0, 5).map((f) => (
                      <div key={f} className="flex items-center gap-2 pt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full bg-[#fef2f2] text-[#93000b] py-2.5 rounded-xl text-xs font-bold border border-rose-200 cursor-default"
                    >
                      ✓ Current Active Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => goCheckout(p.id)}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs ${
                        popular
                          ? "bg-[#93000b] hover:bg-[#770008] text-white"
                          : "bg-[#f2f4f6] hover:bg-gray-200 text-gray-800"
                      }`}
                    >
                      Continue to Checkout
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoicing & Billing History */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#eceef0] flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#191c1e]">Tax Invoices & Billing History</h3>
          <div className="flex items-center gap-4">
            <Link href="/refund-policy" className="text-xs font-semibold text-gray-500 hover:text-[#93000b] hover:underline whitespace-nowrap">
              Refund Policy
            </Link>
            <button
              onClick={() => router.push("/settings/billing/history")}
              className="text-xs font-semibold text-[#93000b] hover:underline flex items-center gap-1 whitespace-nowrap"
            >
              View All
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Billing Date</th>
                <th className="py-3 px-4">Plan Description</th>
                <th className="py-3 px-4">Amount Paid</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-gray-400">
                    No billing history yet. Complete a checkout to record your first payment.
                  </td>
                </tr>
              ) : (
                historyRows.map((inv) => {
                  const paid = inv.status === "success";
                  return (
                    <tr key={inv.id} className="hover:bg-[#f7f9fb] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-gray-900">{inv.id}</td>
                      <td className="py-3 px-4 text-gray-700">{fmtDate(inv.date)}</td>
                      <td className="py-3 px-4 text-gray-800 font-medium">{inv.description}</td>
                      <td className="py-3 px-4 font-mono font-bold text-gray-900">{formatINR(inv.totalAmount)}</td>
                      <td className="py-3 px-4">
                        {paid ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-[#93000b] border border-rose-200">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Declined
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {paid ? (
                          <button
                            onClick={() =>
                              addNotification({
                                type: "success",
                                title: "GST Tax Invoice Downloaded",
                                message: `Tax Invoice ${inv.id} saved as PDF.`,
                              })
                            }
                            className="text-[#93000b] hover:underline font-semibold flex items-center gap-1 ml-auto"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => router.push("/pricing/checkout")}
                            className="text-[#93000b] hover:underline font-semibold flex items-center gap-1 ml-auto"
                          >
                            <ArrowRight className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
