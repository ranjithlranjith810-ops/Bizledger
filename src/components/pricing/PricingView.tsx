"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Check, ArrowLeft } from "lucide-react";

export const PricingView: React.FC = () => {
  const { currentPlanId, setPendingPlan } = useApp();
  const router = useRouter();

  const isCurrent = (id: string) => currentPlanId === id;

  // Selecting a plan does NOT activate it. It only sets a pending checkout
  // selection and routes to checkout; the plan becomes active after a successful payment.
  const handleSelectPlan = (planId: "base" | "business" | "enterprise") => {
    if (planId === currentPlanId) return;
    setPendingPlan(planId, "month");
    router.push("/pricing/checkout");
  };

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

      {/* Plan Tiers (Stitch Design #13) */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#191c1e] uppercase tracking-wider">Available Subscription Tiers</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Base — FREE */}
          <div
            className={`p-6 rounded-2xl border bg-white flex flex-col justify-between transition-all ${
              isCurrent("base")
                ? "border-[#93000b] ring-2 ring-[#93000b]/20 shadow-md"
                : "border-[#eceef0] hover:border-gray-300"
            }`}
          >
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Base</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-gray-900">FREE</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">For single shops, freelancers & micro-enterprises.</p>
              </div>

              <div className="space-y-2.5 text-xs text-gray-600 divide-y divide-gray-100 pt-2">
                <div className="flex items-center gap-2 pt-1">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>1 Team Member</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Limited Customers & Products</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>5 Invoices / Bills per month</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Basic GST Invoicing & Reports</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              {isCurrent("base") ? (
                <button
                  disabled
                  className="w-full bg-gray-100 text-gray-500 py-2.5 rounded-xl text-xs font-bold cursor-default"
                >
                  Current Active Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSelectPlan("base")}
                  className="w-full bg-[#f2f4f6] hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl text-xs font-bold transition-colors"
                >
                  Get Started Free
                </button>
              )}
            </div>
          </div>

          {/* Business — PAID / Most Popular */}
          <div
            className={`p-6 rounded-2xl border bg-white flex flex-col justify-between relative transition-all ${
              isCurrent("business")
                ? "border-[#93000b] ring-2 ring-[#93000b]/20 shadow-md"
                : "border-[#eceef0] hover:border-gray-300"
            }`}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#93000b] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
              Most Popular {isCurrent("business") ? "• Active Plan" : ""}
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-[#93000b] uppercase tracking-wider">Business</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-gray-900">₹999</span>
                  <span className="text-xs text-gray-500">/ month</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">For growing businesses, fleet operators & manufacturers.</p>
              </div>

              <div className="space-y-2.5 text-xs text-gray-600 divide-y divide-gray-100 pt-2">
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Exactly 3 Team Members</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>More Customers & Products</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Advanced Inventory & GST</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Invoices, Bills & Purchase Mgmt</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Payroll, Vehicles & Reports</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              {isCurrent("business") ? (
                <button
                  disabled
                  className="w-full bg-[#fef2f2] text-[#93000b] py-2.5 rounded-xl text-xs font-bold border border-rose-200 cursor-default"
                >
                  ✓ Current Active Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSelectPlan("business")}
                  className="w-full bg-[#93000b] hover:bg-[#770008] text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  Continue to Checkout
                </button>
              )}
            </div>
          </div>

          {/* Enterprise — PREMIUM */}
          <div
            className={`p-6 rounded-2xl border bg-white flex flex-col justify-between transition-all ${
              isCurrent("enterprise")
                ? "border-[#93000b] ring-2 ring-[#93000b]/20 shadow-md"
                : "border-[#eceef0] hover:border-gray-300"
            }`}
          >
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Enterprise</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-gray-900">₹1,999</span>
                  <span className="text-xs text-gray-500">/ month</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Unlimited scale, multi-branch & dedicated account manager.</p>
              </div>

              <div className="space-y-2.5 text-xs text-gray-600 divide-y divide-gray-100 pt-2">
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Unlimited Users & Multi-branch</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Unlimited Customers & Products</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>100+ Invoices / Bills per month</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Advanced Permissions & Reporting</span>
                </div>
                <div className="flex items-center gap-2 pt-1 font-medium text-gray-900">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Priority Support & API Access</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              {isCurrent("enterprise") ? (
                <button
                  disabled
                  className="w-full bg-gray-100 text-gray-500 py-2.5 rounded-xl text-xs font-bold cursor-default"
                >
                  Current Active Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSelectPlan("enterprise")}
                  className="w-full bg-[#93000b] hover:bg-[#770008] text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  Continue to Checkout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
