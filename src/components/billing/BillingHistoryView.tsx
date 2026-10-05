"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  ArrowRight,
  FileText,
  RotateCw,
} from "lucide-react";
import { formatINR } from "@/lib/billing";
import { useBillingHistory } from "@/lib/api/billing";
import { Icon } from "../ui/Icon";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const STATUS_META: Record<string, { label: string; cls: string }> = {
  VERIFIED: {
    label: "Paid",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  FAILED: {
    label: "Declined",
    cls: "bg-rose-50 text-[#93000b] border-rose-200",
  },
  CREATED: {
    label: "Processing",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  CANCELLED: {
    label: "Cancelled",
    cls: "bg-gray-50 text-gray-600 border-gray-200",
  },
};

export const BillingHistoryView: React.FC = () => {
  const { currentPlanId, plans, subscription, activeBusinessId } = useApp();
  const router = useRouter();
  const history = useBillingHistory(activeBusinessId);

  const currentPlan = plans.find((p) => p.id === currentPlanId);
  const planDisplayName = currentPlan?.name.replace(/ Plan$/, "") ?? "No Active Plan";

  const outstanding =
    history.status === "ready"
      ? history.payments
          .filter((p) => p.status === "FAILED")
          .reduce((sum, p) => sum + Number(p.totalAmount), 0)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Billing History</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Review subscription payments and download your payment receipts. All prices inclusive of 18% GST.
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
          <h3 className="text-sm font-bold text-[#191c1e]">Payment Receipts &amp; Billing History</h3>
          <span className="text-xs text-gray-400">All prices inclusive of 18% GST</span>
        </div>

        {history.status === "error" ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-[#93000b] flex items-center justify-center mx-auto">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Unable to load billing history</p>
              <p className="text-xs text-gray-500 mt-1">We could not reach the server. Please try again.</p>
            </div>
            <button
              onClick={history.reload}
              className="inline-flex items-center gap-2 bg-[#f2f4f6] hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : history.status === "loading" || history.status === "idle" ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 text-xs text-gray-400">
              <Icon name="progress_activity" className="animate-spin text-base" />
              Loading billing history…
            </div>
          </div>
        ) : (
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
                {history.payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-4 text-center text-gray-400">
                      No billing records yet. Complete a checkout to record your first payment.
                    </td>
                  </tr>
                ) : (
                  history.payments.map((inv) => {
                    const paid = inv.status === "VERIFIED";
                    const meta = STATUS_META[inv.status] ?? {
                      label: inv.status,
                      cls: "bg-gray-50 text-gray-600 border-gray-200",
                    };
                    return (
                      <tr key={inv.id} className="hover:bg-[#f7f9fb] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">
                          {inv.invoice?.invoiceNumber ?? "—"}
                        </td>
                        <td className="py-3 px-4 text-gray-700">{fmtDate(inv.date)}</td>
                        <td className="py-3 px-4 text-gray-800 font-medium">
                          {inv.planName} • {inv.billingPeriod === "year" ? "Yearly" : "Monthly"}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{formatINR(Number(inv.totalAmount))}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {paid ? (
                            <button
                              onClick={() =>
                                router.push(`/settings/billing/invoice?paymentId=${encodeURIComponent(inv.id)}`)
                              }
                              className="text-[#93000b] hover:underline font-semibold flex items-center gap-1 ml-auto"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>View Receipt</span>
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
        )}
      </div>
    </div>
  );
};