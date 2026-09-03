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
import { formatINR, planLabel, methodLabel } from "@/lib/billing";

export const PaymentSuccessView: React.FC = () => {
  const { paymentHistory, subscription } = useApp();
  const router = useRouter();

  const record = [...paymentHistory].find((p) => p.status === "success");
  const planId = record?.planId ?? subscription?.currentPlanId;
  const plans = useApp().plans;
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
        <h2 className="text-xl font-bold text-[#191c1e]">Payment Successful</h2>
        <p className="text-xs text-gray-500 mt-2">
          Your <span className="font-bold text-gray-900">{planLabel(plan?.name ?? "Business")}</span>{" "}
          plan is now active. Thank you for subscribing to BizLedger.
        </p>

        <div className="mt-6 bg-[#f7f9fb] rounded-xl border border-[#eceef0] p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Invoice</span>
            <span className="text-xs font-mono font-bold text-gray-900">{record?.id ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Plan</span>
            <span className="text-xs font-bold text-gray-900">{plan?.name ?? "Business Plan"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Billing</span>
            <span className="text-xs font-medium text-gray-700 capitalize">{record?.billingPeriod ?? "month"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Payment method</span>
            <span className="text-xs font-medium text-gray-700">{record ? methodLabel(record.method) : "—"}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#eceef0]">
            <span className="text-xs font-bold text-gray-900">Paid</span>
            <span className="text-lg font-bold font-mono text-emerald-600">
              {formatINR(record?.totalAmount ?? 0)}
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
          Your GST tax invoice is available in Billing History.
        </p>
      </div>
    </div>
  );
};
