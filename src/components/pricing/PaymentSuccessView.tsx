"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import confetti from "canvas-confetti";
import {
  CheckCircle2,
  LayoutDashboard,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { formatINRString, planLabel } from "@/lib/billing";

export interface PaymentSuccessViewProps {
  planId?: string;
  period?: string;
  orderId?: string;
  paymentId?: string;
  total?: string;
}

// Phase 4E: this page is the honest post-verification state. Payment has been
// VERIFIED server-side (HMAC) but the subscription is STILL PENDING — durable
// activation happens in Phase 4F via webhooks. We therefore never claim the
// plan is "active".
export const PaymentSuccessView: React.FC<PaymentSuccessViewProps> = ({
  planId,
  period,
  orderId,
  paymentId,
  total,
}) => {
  const { plans } = useApp();
  const router = useRouter();

  const plan = plans.find((p) => p.id === planId);

  useEffect(() => {
    confetti({ particleCount: 120, spread: 75, origin: { y: 0.3 } });
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center max-w-xl mx-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h2 className="text-xl font-bold text-[#191c1e]">Payment Verified</h2>
        <p className="text-xs text-gray-500 mt-2">
          Payment verified. Your{" "}
          <span className="font-bold text-gray-900">
            {planLabel(plan?.name ?? "Business")}
          </span>{" "}
          subscription is being confirmed. It will become active once payment
          confirmation completes.
        </p>

        <div className="mt-6 bg-[#f7f9fb] rounded-xl border border-[#eceef0] p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Order</span>
            <span className="text-xs font-mono font-bold text-gray-900">
              {orderId ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Payment</span>
            <span className="text-xs font-mono font-bold text-gray-900">
              {paymentId ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Plan</span>
            <span className="text-xs font-bold text-gray-900">
              {plan?.name ?? "Selected Plan"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Billing</span>
            <span className="text-xs font-medium text-gray-700 capitalize">
              {period ?? "month"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#eceef0]">
            <span className="text-xs font-bold text-gray-900">Verified amount</span>
            <span className="text-lg font-bold font-mono text-emerald-600">
              {total ? formatINRString(total) : "—"}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center justify-center gap-2 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <LayoutDashboard className="w-4 h-4" />
            Go to Dashboard
          </button>
          <button
            onClick={() => router.push("/settings/billing")}
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-5 py-2.5 rounded-xl text-xs font-bold transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Manage Subscription
          </button>
        </div>

        <p className="mt-4 text-[11px] text-gray-400 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Demo checkout via Razorpay Test Mode — no real money was charged.
        </p>
      </div>
    </div>
  );
};