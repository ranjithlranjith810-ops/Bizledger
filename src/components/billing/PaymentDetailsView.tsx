"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  Download,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Hash,
  CreditCard,
  RotateCw,
  Building2,
  UserRound,
} from "lucide-react";
import { formatINR } from "@/lib/billing";
import { billingApi, BillingPaymentDetail } from "@/lib/api/billing";
import { useApp } from "@/context/AppContext";
import { Icon } from "../ui/Icon";

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtMoney = (v: string | undefined) => formatINR(Number(v ?? "0"));

/** Compact label for the payment method stored on the receipt. */
const METHOD_LABEL: Record<string, string> = {
  card: "Card",
  netbanking: "Net Banking",
  upi: "UPI",
  wallet: "Wallet",
  emi: "EMI",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  VERIFIED: {
    label: "Paid",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  FAILED: {
    label: "Failed",
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

export const PaymentDetailsView: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId")?.trim() ?? "";
  const { activeBusinessId } = useApp();

  const [detail, setDetail] = useState<BillingPaymentDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const invalidParams = !activeBusinessId || !paymentId;

  useEffect(() => {
    if (invalidParams) return;
    let active = true;
    billingApi
      .getInvoice(activeBusinessId as string, paymentId)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        if (err?.status === 404) setStatus("missing");
        else setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [activeBusinessId, paymentId, attempt, invalidParams]);

  const handleRetry = () => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  // Server-rendered PDF download, attachment filename from the server header.
  const handleDownloadPdf = async () => {
    if (!activeBusinessId || !paymentId) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = `/api/billing/invoice/download?businessId=${encodeURIComponent(
        activeBusinessId,
      )}&paymentId=${encodeURIComponent(paymentId)}`;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        let msg = `Download failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body.error === "string") msg = body.error;
        } catch {
          /* non-JSON error body — keep status fallback */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "receipt.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (invalidParams) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto">
          <FileNotFound />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Receipt not found</p>
          <p className="text-xs text-gray-500 mt-1">
            This link is missing a payment reference, or the payment could not be
            found for your business.
          </p>
        </div>
        <button
          onClick={() => router.push("/settings/billing/history")}
          className="inline-flex items-center gap-2 bg-[#f2f4f6] hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Billing History
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-xs text-gray-400 gap-2">
        <Icon name="progress_activity" className="animate-spin text-base" />
        Loading receipt…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-[#93000b] flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Unable to load this receipt</p>
          <p className="text-xs text-gray-500 mt-1">We could not reach the server. Please try again.</p>
        </div>
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-2 bg-[#f2f4f6] hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (status === "missing" || !detail) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto">
          <FileNotFound />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Receipt not found</p>
          <p className="text-xs text-gray-500 mt-1">
            This payment could not be found for your business, or the link is invalid.
          </p>
        </div>
        <button
          onClick={() => router.push("/settings/billing/history")}
          className="inline-flex items-center gap-2 bg-[#f2f4f6] hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Billing History
        </button>
      </div>
    );
  }

  const { payment, invoice } = detail;
  const meta = STATUS_META[payment.status] ?? {
    label: payment.status,
    cls: "bg-gray-50 text-gray-600 border-gray-200",
  };
  const supplier = (invoice?.supplierSnapshot ?? {}) as Record<string, unknown>;
  const customer = (invoice?.customerSnapshot ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      {/* Toolbar (hidden when printing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            {invoice ? "Payment Receipt" : "Payment Status"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {invoice ? invoice.invoiceNumber : "No receipt available for this attempt yet."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/settings/billing/history")}
            className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Billing History
          </button>
          {invoice && (
            <>
              <button
                onClick={() => void handleDownloadPdf()}
                disabled={downloading}
                className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {downloading ? "Preparing…" : "Download PDF"}
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / Save as PDF
              </button>
            </>
          )}
        </div>
      </div>

      {downloadError && (
        <div className="print:hidden rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-[#93000b]">
          Could not download the receipt: {downloadError}. Please try again.
        </div>
      )}

      {/* Payment Status */}
      <div className="bg-white rounded-2xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#eceef0] flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Payment Status
          </p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-5 text-xs">
          <div>
            <p className="text-gray-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Payment Date
            </p>
            <p className="font-semibold text-gray-800 mt-1">{fmtDate(payment.createdAt)}</p>
          </div>
          <div>
            <p className="text-gray-400 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" /> Order ID
            </p>
            <p className="font-mono font-semibold text-gray-800 mt-1">{payment.orderId ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-400 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" /> Method
            </p>
            <p className="font-semibold text-gray-800 mt-1">
              {payment.method ? METHOD_LABEL[payment.method] ?? payment.method : "—"}
            </p>
          </div>
          <div>
            <p className="text-gray-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Amount
            </p>
            <p className="font-mono font-bold text-gray-900 mt-1">{fmtMoney(payment.totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* Receipt body (visible only when an invoice was minted) */}
      {invoice ? (
        <div className="bg-white rounded-2xl border border-[#eceef0] shadow-xs overflow-hidden print-border-0">
          <div className="p-6 sm:p-8 print:p-0">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-[#eceef0] pb-6">
              <div>
                <div className="flex items-center gap-2 text-[#93000b]">
                  <Building2 className="w-5 h-5" />
                  <span className="font-bold text-base">{String(supplier.name ?? "")}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {typeof supplier.gstin === "string" && supplier.gstin ? `GSTIN: ${supplier.gstin}` : "GST Supplier"}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <h3 className="text-lg font-bold text-[#191c1e] tracking-tight">
                  Billing Invoice / Payment Receipt
                </h3>
                <p className="font-mono text-sm font-bold text-gray-800 mt-1">{invoice.invoiceNumber}</p>
                <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                  <p>Invoice Date: {fmtDate(invoice.invoiceDate)}</p>
                  <p>Payment Date: {fmtDate(invoice.paymentDate)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Billed To</p>
                <p className="font-bold text-gray-900">{customer.name ?? payment.planName}</p>
                {customer.legalName && <p className="text-xs text-gray-600">{customer.legalName}</p>}
                {customer.gstin && <p className="text-xs text-gray-600">GSTIN: {customer.gstin}</p>}
                {(customer.address || customer.city || customer.state) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {[customer.address, customer.city, customer.state, customer.stateCode, customer.pincode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                  {customer.email && <p>{customer.email}</p>}
                  {customer.phone && <p>{customer.phone}</p>}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Subscription
                </p>
                <p className="font-bold text-gray-900">{invoice.planName}</p>
                <p className="text-xs text-gray-500">
                  {invoice.billingPeriod === "year" ? "Annual" : "Monthly"} billing period
                </p>
              </div>
            </div>

            <div className="border-t border-[#eceef0]">
              <table className="w-full text-left text-xs">
                <thead className="text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
                  <tr>
                    <th className="py-3">Description</th>
                    <th className="py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef0] text-gray-800">
                  <tr>
                    <td className="py-3">
                      {invoice.planName} — {invoice.billingPeriod === "year" ? "annual" : "monthly"} subscription
                    </td>
                    <td className="py-3 text-right font-mono">{fmtMoney(invoice.baseAmount)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-gray-600">GST @ {Number(invoice.gstRate)}%</td>
                    <td className="py-3 text-right font-mono">{fmtMoney(invoice.gstAmount)}</td>
                  </tr>
                  <tr className="bg-[#f7f9fb]">
                    <td className="py-3 font-bold text-gray-900">Total Paid</td>
                    <td className="py-3 text-right font-mono font-bold text-gray-900">
                      {fmtMoney(invoice.totalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 text-[11px] text-gray-400">
              <div>
                Order: <span className="font-mono">{invoice.orderId}</span>
                {invoice.paymentMethod && (
                  <>
                    {" "}
                    • Paid via <span className="font-semibold">{METHOD_LABEL[invoice.paymentMethod] ?? invoice.paymentMethod}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <UserRound className="w-3.5 h-3.5" />
                Supplied by {String(supplier.name ?? "")}
              </div>
            </div>

            {!supplier.gstin && (
              <p className="mt-4 text-[10px] leading-relaxed text-gray-400 border-t border-[#eceef0] pt-3">
                Supplier GST identification is not configured. This receipt is not eligible for GST input tax
                credit and is not a tax invoice under GST law.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#eceef0] shadow-xs p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <ClockIcon />
          </div>
          <p className="text-sm font-semibold text-gray-800">Receipt not available yet</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            A payment receipt is issued automatically once your payment is verified. Declined or pending
            attempts do not receive an invoice number.
          </p>
        </div>
      )}
    </div>
  );
};

function FileNotFound() {
  return <Icon name="description" className="text-2xl" />;
}

function ClockIcon() {
  return <Icon name="schedule" className="text-2xl" />;
}