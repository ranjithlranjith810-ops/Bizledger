"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { Download, ArrowLeft, CreditCard, Calendar, CheckCircle2, AlertTriangle, ArrowRight, RefreshCcw } from "lucide-react";
import { formatINR } from "@/lib/billing";
import type { PaymentRecord } from "@/types";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const BillingHistoryView: React.FC = () => {
  const { currentPlanId, plans, paymentHistory, subscription, addNotification, requestRefund } = useApp();
  const router = useRouter();

  const currentPlan = plans.find((p) => p.id === currentPlanId);
  const planDisplayName = currentPlan?.name.replace(/ Plan$/, "") ?? "No Active Plan";

  const outstanding = paymentHistory
    .filter((p) => p.status === "failed")
    .reduce((sum, p) => sum + p.totalAmount, 0);

  const downloadReceipt = (invId: string) => {
    addNotification({
      type: "success",
      title: "GST Tax Invoice Downloaded",
      message: `Tax Invoice ${invId} saved as PDF.`,
    });
  };

  const [refundFor, setRefundFor] = useState<PaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundError, setRefundError] = useState("");

  const submitRefundRequest = () => {
    if (!refundFor) return;
    if (!refundReason.trim()) {
      setRefundError("Please describe your reason for requesting a refund.");
      return;
    }
    requestRefund(refundFor.id, refundReason.trim());
    setRefundFor(null);
    setRefundReason("");
    setRefundError("");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Billing History</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Review subscription payments, download GST tax receipts, and track billing status.
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

      {/* Billing Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-[#eceef0] shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <CreditCard className="w-10 h-10" />
          </div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Current Plan</p>
          <h3 className="text-xl font-bold text-gray-900 mt-1.5">{planDisplayName}</h3>
          <p className="text-xs text-gray-500">
            {currentPlan ? `${formatINR(currentPlan.price)} / month` : "No active plan"}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center gap-2 text-[#93000b]">
            <Calendar className="w-4 h-4" />
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Next Billing Date</p>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mt-1.5">
            {subscription?.billing?.renewsAt ? fmtDate(subscription.billing.renewsAt) : "—"}
          </h3>
          <p className="text-xs text-gray-500">Auto-renews on your saved payment method</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Outstanding Balance</p>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mt-1.5">{formatINR(outstanding)}</h3>
          <p className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {outstanding > 0 ? "From declined attempts" : "All caught up"}
          </p>
        </div>
      </div>

      {/* Billing History Table */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#eceef0] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#191c1e]">Tax Invoices &amp; Billing History</h3>
          <span className="text-xs text-gray-400">All prices inclusive of 18% GST</span>
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
              {paymentHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-gray-400">
                    No billing records yet. Complete a checkout to record your first payment.
                  </td>
                </tr>
              ) : (
                paymentHistory.map((inv) => {
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
    <div className="flex items-center justify-end gap-3">
      <button
        onClick={() => downloadReceipt(inv.id)}
        className="text-[#93000b] hover:underline font-semibold flex items-center gap-1"
      >
        <Download className="w-3.5 h-3.5" />
        <span>PDF</span>
      </button>
      {inv.refundStatus === "requested" ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          Refund requested
        </span>
      ) : (
        <button
          onClick={() => setRefundFor(inv)}
          className="text-[#93000b] hover:underline font-semibold flex items-center gap-1"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>Request Refund</span>
        </button>
      )}
    </div>
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

      {refundFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#93000b] flex items-center justify-center">
                <RefreshCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#191c1e]">Request a refund</h3>
                <p className="text-xs text-gray-500">
                  {refundFor.id} · {formatINR(refundFor.totalAmount)}
                </p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-500 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
              This records your request in the demo build. A refund can only be
              granted once a production payment processor is integrated, per our{" "}
              <Link href="/refund-policy" className="font-semibold text-[#93000b] hover:underline">
                Refund &amp; Cancellation Policy
              </Link>
              .
            </p>
            <label className="block mt-4 text-xs font-semibold text-gray-700 mb-1.5">
              Reason for refund
            </label>
            <textarea
              value={refundReason}
              onChange={(e) => {
                setRefundReason(e.target.value);
                if (e.target.value.trim()) setRefundError("");
              }}
              rows={3}
              placeholder="Tell us why you'd like a refund"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#93000b] focus:ring-2 focus:ring-[#93000b]/20"
            />
            {refundError && (
              <p className="mt-1.5 text-[11px] font-medium text-[#93000b]">{refundError}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setRefundFor(null);
                  setRefundReason("");
                  setRefundError("");
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitRefundRequest}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#93000b] hover:bg-[#770008] transition-colors"
              >
                Submit Refund Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
