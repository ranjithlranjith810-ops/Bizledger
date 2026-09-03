"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { XCircle, RotateCcw, ArrowLeft, CreditCard } from "lucide-react";
import { formatINR, methodLabel } from "@/lib/billing";

export const PaymentDeclinedView: React.FC = () => {
  const { paymentHistory, pendingPlanId, plans } = useApp();
  const router = useRouter();

  const record = [...paymentHistory].find((p) => p.status === "failed");
  const plan = plans.find((p) => p.id === (pendingPlanId ?? ""));

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center max-w-xl mx-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 text-[#93000b] flex items-center justify-center mb-4">
          <XCircle className="w-9 h-9" />
        </div>
        <h2 className="text-xl font-bold text-[#191c1e]">Payment Declined</h2>
        <p className="text-xs text-gray-500 mt-2">
          Your payment could not be completed. Your current plan and billing remain{" "}
          <span className="font-bold text-gray-900">unchanged</span>. You can try again or
          choose a different plan.
        </p>

        <div className="mt-6 bg-[#f7f9fb] rounded-xl border border-[#eceef0] p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Attempt</span>
            <span className="text-xs font-mono font-bold text-gray-900">{record?.id ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Plan selected</span>
            <span className="text-xs font-bold text-gray-900">
              {plan?.name ?? (pendingPlanId ? "Selected plan" : "—")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Payment method</span>
            <span className="text-xs font-medium text-gray-700">
              {record ? methodLabel(record.method) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#eceef0]">
            <span className="text-xs font-bold text-gray-900">Amount due</span>
            <span className="text-lg font-bold font-mono text-[#93000b]">
              {formatINR(record?.totalAmount ?? 0)}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push("/pricing/payment")}
            className="inline-flex items-center justify-center gap-2 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <RotateCcw className="w-4 h-4" />
            Try Payment Again
          </button>
          <button
            onClick={() => router.push("/pricing/checkout")}
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-5 py-2.5 rounded-xl text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Checkout
          </button>
        </div>

        <button
          onClick={() => router.push("/settings/billing")}
          className="mt-4 text-[#93000b] hover:underline text-xs font-bold inline-flex items-center gap-1"
        >
          <CreditCard className="w-3.5 h-3.5" />
          View current subscription
        </button>
      </div>
    </div>
  );
};
