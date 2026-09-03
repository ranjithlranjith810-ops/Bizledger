"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ArrowLeft, Lock, CreditCard, Loader2, XCircle, CheckCircle2 } from "lucide-react";
import {
  computeTotals,
  formatINR,
  planLabel,
  PAYMENT_METHODS,
} from "@/lib/billing";
import { PaymentMethod } from "@/types";

export const PaymentView: React.FC = () => {
  const { plans, pendingPlanId, pendingPeriod, completePayment } = useApp();
  const router = useRouter();

  const plan = plans.find((p) => p.id === pendingPlanId);
  const period = pendingPeriod ?? "month";

  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [outcome, setOutcome] = useState<"success" | "failed">("success");
  const [processing, setProcessing] = useState(false);

  if (!plan) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center">
          <h2 className="text-lg font-bold text-[#191c1e]">No plan selected</h2>
          <p className="text-xs text-gray-500 mt-2">
            Return to the pricing page and choose a plan first.
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

  const handlePay = () => {
    if (processing) return;
    setProcessing(true);
    setTimeout(() => {
      completePayment(outcome, method);
      if (outcome === "success") {
        router.push("/payment/success");
      } else {
        router.push("/payment/failed");
      }
    }, 1800);
  };

  const handleCancel = () => {
    if (processing) return;
    router.push("/pricing/checkout");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Payment</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose a payment method and pay {formatINR(totals.total)} to activate the {planLabel(plan.name)} plan.
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Checkout</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Payment methods + simulation */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-[#93000b]" />
              <h3 className="text-sm font-bold text-[#191c1e]">Payment Method</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => !processing && setMethod(m.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    method === m.id
                      ? "border-[#93000b] ring-2 ring-[#93000b]/20 bg-[#fff7f7]"
                      : "border-[#eceef0] hover:border-gray-300"
                  } ${processing ? "opacity-60 pointer-events-none" : ""}`}
                >
                  <p className="text-xs font-bold text-gray-900">{m.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{m.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Mock gateway / simulation control */}
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs">
            <h3 className="text-sm font-bold text-[#191c1e] mb-1">Simulate Payment Gateway</h3>
            <p className="text-xs text-gray-500 mb-4">
              This is a mock checkout without a backend. Pick a gateway outcome to physically verify the flow.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => !processing && setOutcome("success")}
                className={`rounded-xl border px-4 py-3 text-left transition-colors flex items-start gap-2.5 ${
                  outcome === "success"
                    ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50"
                    : "border-[#eceef0] hover:border-gray-300"
                } ${processing ? "opacity-60 pointer-events-none" : ""}`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <span className="block text-xs font-bold text-gray-900">Successful</span>
                  <span className="block text-[11px] text-gray-500">Activates the plan</span>
                </span>
              </button>
              <button
                onClick={() => !processing && setOutcome("failed")}
                className={`rounded-xl border px-4 py-3 text-left transition-colors flex items-start gap-2.5 ${
                  outcome === "failed"
                    ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50"
                    : "border-[#eceef0] hover:border-gray-300"
                } ${processing ? "opacity-60 pointer-events-none" : ""}`}
              >
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  <span className="block text-xs font-bold text-gray-900">Declined</span>
                  <span className="block text-[11px] text-gray-500">Plan stays unchanged</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Pay summary */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs sticky top-6">
            <h3 className="text-sm font-bold text-[#191c1e] mb-4">Amount Due</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Base amount</span>
                <span className="text-xs font-mono font-bold text-gray-900">{formatINR(totals.base)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">GST (18%)</span>
                <span className="text-xs font-mono font-bold text-gray-900">{formatINR(totals.gstAmount)}</span>
              </div>
              <div className="pt-3 border-t border-[#eceef0] flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">Total</span>
                <span className="text-lg font-bold font-mono text-[#93000b]">{formatINR(totals.total)}</span>
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={processing}
              className="mt-6 w-full bg-[#93000b] hover:bg-[#770008] text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Payment…
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Pay {formatINR(totals.total)} Securely
                </>
              )}
            </button>

            <button
              onClick={handleCancel}
              disabled={processing}
              className="mt-3 w-full bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] py-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-70"
            >
              Cancel Payment
            </button>

            <p className="mt-3 text-[11px] text-gray-400 text-center">
              Demo only — no real money is charged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
