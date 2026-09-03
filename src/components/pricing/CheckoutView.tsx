"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Check, ArrowLeft, ShieldCheck, Lock, Calendar } from "lucide-react";
import { computeTotals, formatINR, planLabel, GST_RATE } from "@/lib/billing";

export const CheckoutView: React.FC = () => {
  const { plans, pendingPlanId, pendingPeriod, setPendingPlan } = useApp();
  const router = useRouter();

  const plan = plans.find((p) => p.id === pendingPlanId);
  const period = pendingPeriod ?? "month";

  if (!plan) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center">
          <h2 className="text-lg font-bold text-[#191c1e]">No plan selected</h2>
          <p className="text-xs text-gray-500 mt-2">
            Please choose a plan from the pricing page to continue.
          </p>
          <button
            onClick={() => router.push("/pricing")}
            className="mt-4 inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors"
          >
            Back to Pricing Plans
          </button>
        </div>
      </div>
    );
  }

  const totals = computeTotals(plan, period);
  const periodLabel = period === "month" ? "1 Month" : "1 Year (2 months free)";

  const changePeriod = (p: "month" | "year") => setPendingPlan(plan.id, p);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Checkout</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Review your subscription details before payment. Your plan is NOT activated until payment succeeds.
          </p>
        </div>
        <button
          onClick={() => router.push("/pricing")}
          className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change Plan</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Plan summary */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#191c1e]">{plan.name}</h3>
                  <p className="text-xs text-gray-500">{plan.description}</p>
                </div>
              </div>
              <button
                onClick={() => router.push("/pricing")}
                className="text-[#93000b] hover:underline text-xs font-bold"
              >
                Change
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => changePeriod("month")}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  period === "month"
                    ? "border-[#93000b] ring-2 ring-[#93000b]/20 bg-[#fff7f7]"
                    : "border-[#eceef0] hover:border-gray-300"
                }`}
              >
                <p className="text-xs font-bold text-gray-900">Monthly</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {formatINR(plan.price)}/mo · billed monthly
                </p>
              </button>
              <button
                onClick={() => changePeriod("year")}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  period === "year"
                    ? "border-[#93000b] ring-2 ring-[#93000b]/20 bg-[#fff7f7]"
                    : "border-[#eceef0] hover:border-gray-300"
                }`}
              >
                <p className="text-xs font-bold text-gray-900">Yearly</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {formatINR(plan.price * 10)}/yr · 2 months free
                </p>
              </button>
            </div>

            <div className="mt-5 pt-5 border-t border-[#eceef0]">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                What&apos;s included
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {plan.features.slice(0, 6).map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs text-gray-700">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs sticky top-6">
            <h3 className="text-sm font-bold text-[#191c1e] mb-4">Order Summary</h3>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{planLabel(plan.name)} subscription ({periodLabel})</span>
                <span className="text-xs font-mono font-bold text-gray-900">{formatINR(totals.base)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">GST @ {GST_RATE}%</span>
                <span className="text-xs font-mono font-bold text-gray-900">{formatINR(totals.gstAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Billing</span>
                <span className="text-xs font-medium text-gray-700 capitalize">{period}</span>
              </div>
              <div className="pt-3 border-t border-[#eceef0] flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">Total to pay</span>
                <span className="text-lg font-bold font-mono text-[#93000b]">{formatINR(totals.total)}</span>
              </div>
              <p className="text-[11px] text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {period === "month" ? "Renews monthly" : "Renews yearly"} · inclusive of 18% GST
              </p>
            </div>

            <button
              onClick={() => router.push("/pricing/payment")}
              className="mt-6 w-full bg-[#93000b] hover:bg-[#770008] text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              Proceed to Payment
            </button>

            <p className="mt-3 text-[11px] text-gray-400 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" />
              This is a demo checkout. No real payment is processed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
