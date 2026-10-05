"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Invoice } from "@/types";
import { sumStoredInvoiceTotals } from "@/lib/invoice";
import { invoicesApi, fromBackendInvoice } from "@/lib/api/invoices";
import { isTemporaryId } from "@/lib/optimistic-id";
import { ApiError } from "@/lib/api-client";
import { nextInvoiceStatuses } from "@/lib/sales-document/status-transitions";
import {
  renderGstInvoicePdf,
  invoicePdfFilename,
} from "@/lib/invoice/gst-invoice-pdf";
import {
  resolveGstSupportInfo,
  resolveInvoiceTerms,
  resolvePaymentTerms,
} from "@/lib/documentConfig";
import { AddInvoiceModal } from "@/components/invoices/AddInvoiceModal";
import {
  ArrowLeft,
  Download,
  Printer,
  Share2,
  CheckCircle2,
  Landmark,
  LoaderCircle,
  Pencil,
  Truck,
} from "lucide-react";

export const InvoiceDetailsView: React.FC = () => {
  const {
    invoices,
    companyProfile,
      updateInvoiceStatus,
      addNotification,
      activeBusinessId,
      transitioningDocument,
    } = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [fetchResult, setFetchResult] = useState<{
    id: string;
    record: Invoice | null;
    error: "missing" | "error" | null;
  } | null>(null);

  // Fix C: the `|| invoices[0]` fallback silently rendered the WRONG invoice -
  // a bad id showed another customer's invoice instead of an error. The id from
  // the route is now authoritative, with a real fetch when state is empty.
  const invoiceFromState = invoices.find((inv) => inv.id === params.id);
  const current = fetchResult?.id === params.id ? fetchResult : null;
  const invoice = invoiceFromState ?? current?.record ?? null;
  const fetchStatus: "idle" | "loading" | "saving" | "missing" | "error" = (() => {
    if (invoiceFromState) return "idle";
    if (isTemporaryId(params.id)) return "saving";
    if (!activeBusinessId) return "idle";
    if (current === null) return "loading";
    return current.error ?? "idle";
  })();

  useEffect(() => {
    if (invoiceFromState) return;
    if (isTemporaryId(params.id)) return;
    if (!activeBusinessId) return;
    let cancelled = false;
    invoicesApi
      .get(activeBusinessId, params.id)
      .then((r) => fromBackendInvoice(r.invoice))
      .then((record) => {
        if (cancelled) return;
        setFetchResult({ id: params.id, record, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchResult({
          id: params.id,
          record: null,
          error: err instanceof ApiError && err.status === 404 ? "missing" : "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceFromState, activeBusinessId, params.id]);

  if (!invoice) {
    let message = "Invoice not found.";
    if (fetchStatus === "loading")
      message = "Syncing your invoice data from the server.";
    else if (fetchStatus === "saving")
      message = "This invoice is still being saved...";
    else if (fetchStatus === "error")
      message = "This invoice could not be loaded.";
    return (
      <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/invoices")}
          className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-600 rounded-xl transition-colors shadow-xs"
          title="Back to Invoices"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm p-10 text-center space-y-2">
          <div className="text-sm font-semibold text-gray-800">{message}</div>
          {fetchStatus === "loading" && (
            <div className="text-xs text-gray-500">
              Syncing your invoice data from the server.
            </div>
          )}
        </div>
      </div>
    );
  }

  const displayedTotals = sumStoredInvoiceTotals(invoice.items);

  const handlePrint = () => {
    window.print();
  };

  // Download a real .pdf generated client-side from the SAME stored invoice
  // and company-profile data the on-screen TAX-INVOICE document shows. This
  // intentionally replaces the old "Print / Save as PDF" behaviour, which only
  // opened the browser print dialog.
  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const bytes = await renderGstInvoicePdf(invoice, companyProfile);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoicePdfFilename(invoice.invoiceNumber);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke on a later tick so the browser keeps the download alive.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : "Could not generate the PDF. Use Print instead."
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Open a real WhatsApp chat pre-filled with the invoice summary + amount.
  const handleShare = () => {
    const phone = (invoice.customerPhone || "").replace(/\D/g, "");
    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(invoice.grandTotal || 0);
    const text = `BizLedger Invoice *${invoice.invoiceNumber}*\nCustomer: ${invoice.customerName}\nAmount: ${amount}`;
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    } else {
      addNotification({
        type: "info",
        title: "No phone number on this invoice",
        message:
          "Add a customer phone number, then Share via WhatsApp will open a chat.",
      });
    }
  };

  // Invoice is the reference lifecycle. Options come from the SAME matrix
  // transitionInvoiceStatus enforces, so the control can never offer an edge the
  // server would reject (the previous hard-coded "Mark as Paid" toggle offered
  // Draft -> Paid, which that matrix forbids). UX only; the server re-validates.
  const nextStatusOptions: readonly string[] = nextInvoiceStatuses(
    invoice.status,
  );
  const isTransitioning = transitioningDocument?.id === invoice.id;

  const handleStatusChange = (status: string) => {
    void updateInvoiceStatus(invoice.id, status as Invoice["status"]);
  };

  return (
    <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
      {/* Top Header & Actions (Stitch Design #7) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/invoices")}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-600 rounded-xl transition-colors shadow-xs"
            title="Back to Invoices"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-[#191c1e] font-mono tracking-tight">
                {invoice.invoiceNumber}
              </h2>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  invoice.status === "Paid"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {invoice.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Issued to{" "}
              <strong className="text-gray-800">{invoice.customerName}</strong>{" "}
              on {invoice.date}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/*
            A terminal invoice (Paid / Cancelled) has no legal successor, so the
            control is replaced by a read-only label instead of a dead button.
          */}
          {nextStatusOptions.length === 0 ? (
            <span
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-[#eceef0] bg-white text-gray-500"
              title={`${invoice.status} is a final status and cannot be changed`}
            >
              {invoice.status}
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={invoice.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isTransitioning}
                aria-busy={isTransitioning}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-800 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  isTransitioning
                    ? "Saving status…"
                    : `Change status (next: ${nextStatusOptions.join(", ")})`
                }
              >
                <option value={invoice.status}>{invoice.status}</option>
                {nextStatusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit Invoice</span>
          </button>

          <button
            onClick={handleShare}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Share via WhatsApp"
          >
            <Share2 className="w-4 h-4 text-emerald-600" />
          </button>

          <button
            onClick={handlePrint}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Print Invoice"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Download this invoice as a PDF file"
          >
            {downloadingPdf ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloadingPdf ? "Generating PDF..." : "Download PDF"}</span>
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-2.5 text-xs">
          <span>{pdfError}</span>
          <button
            onClick={handlePrint}
            className="shrink-0 font-semibold text-[#93000b] hover:underline"
          >
            Open Print Dialog
          </button>
        </div>
      )}

      {/* Printable GST Tax Invoice Document Card (Stitch Design #7) */}
      <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm p-6 sm:p-8 space-y-6 text-xs text-gray-800">
        {/* Document Banner */}
        <div className="text-center pb-4 border-b border-gray-200">
          <span className="text-[11px] font-bold tracking-widest text-[#93000b] uppercase">
            TAX-INVOICE
          </span>
        </div>

        {/* Company Header & Invoice Meta */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-gray-100">
          {/* Supplier Info */}
          <div className="space-y-1 max-w-sm">
            <div className="flex items-center gap-2">
              {companyProfile.logoUrl ? (
                <img
                  src={companyProfile.logoUrl}
                  alt="Logo"
                  className="h-8 max-w-24 rounded-lg object-contain bg-white"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-[#93000b] flex items-center justify-center font-bold text-xs">
                  BL
                </div>
              )}
              <h3 className="font-bold text-sm text-gray-900">
                {companyProfile.companyName}
              </h3>
            </div>
            <p className="text-gray-600 text-xs leading-tight">
              {companyProfile.streetAddress}
            </p>
            <p className="text-gray-600 text-xs">
              {companyProfile.city}, {companyProfile.state} -{" "}
              {companyProfile.pincode}
            </p>
            <div className="pt-1 text-[11px] font-medium text-gray-700">
              <div>
                GSTIN:{" "}
                <span className="font-mono font-bold text-gray-900">
                  {companyProfile.gstin}
                </span>
              </div>
              <div>
                PAN:{" "}
                <span className="font-mono font-bold text-gray-900">
                  {companyProfile.pan}
                </span>
              </div>
            </div>
          </div>

          {/* Invoice Identification */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] sm:min-w-64 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Invoice Number:</span>
              <span className="font-mono font-bold text-[#93000b]">
                {invoice.invoiceNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Invoice Date:</span>
              <span className="font-semibold text-gray-900">
                {invoice.date}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Payment Terms:</span>
              <span className="font-semibold text-gray-900 text-right">
                {resolvePaymentTerms(companyProfile)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">
                State/State Code:
              </span>
              <span className="font-semibold text-gray-900 text-right">
                {invoice.placeOfSupply}
              </span>
            </div>
          </div>
        </div>

        {/* Bill To Customer Section */}
        <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Details of Receiver (Billed To):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <div className="font-bold text-sm text-gray-900">
                {invoice.customerName}
              </div>
              <p className="text-gray-600 mt-0.5 leading-tight">
                {invoice.customerAddress}
              </p>
              <div className="text-gray-600 mt-1">
                Contact: {invoice.customerPhone}
              </div>
            </div>
            <div className="space-y-1">
              <div>
                Customer GSTIN:{" "}
                <span className="font-mono font-bold text-gray-900">
                  {invoice.customerGstin}
                </span>
              </div>
              <div>
                State / Code:{" "}
                <span className="font-medium text-gray-800">
                  {invoice.placeOfSupply}
                </span>
              </div>
              {invoice.vehicle?.vehicleNumber ? (
                <div className="pt-1.5 border-t border-[#eceef0] space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <Truck className="w-3 h-3" />
                    <span>Vehicle Dispatch</span>
                  </div>
                  <div>
                    Vehicle No:{" "}
                    <span className="font-mono font-medium text-gray-800">
                      {invoice.vehicle.vehicleNumber || "-"}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  Dispatch Mode:{" "}
                  <span className="font-medium text-gray-800">
                    Commercial Fleet Road Transport
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items Table (Stitch Design #7) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-[#eceef0] rounded-xl overflow-hidden">
            <thead className="bg-[#f7f9fb] text-gray-600 border-b border-[#eceef0] text-[11px] font-semibold uppercase">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3 font-mono">HSN/SAC</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                <th className="py-2.5 px-3 text-right">GST %</th>
                <th className="py-2.5 px-3 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 text-gray-400 font-mono">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-gray-900">
                      {item.description}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-gray-600">
                    {item.hsnSac}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    ₹{item.unitPrice.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    ₹{item.taxableAmount.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {item.gstRate}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">
                    ₹{item.totalAmount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financials Summary Calculation (Stitch Design #7) */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
          {/* Bank & Payment QR */}
          <div className="sm:max-w-xs space-y-2 bg-[#f7f9fb] p-3.5 rounded-xl border border-[#eceef0] text-[11px]">
            <div className="font-bold text-gray-800 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-[#93000b]" />
              <span>Remittance Bank Details</span>
            </div>
            <div className="text-gray-600 space-y-0.5 font-mono">
              <div>Bank: {companyProfile.bankName}</div>
              <div>A/C: {companyProfile.accountNumber}</div>
              <div>IFSC: {companyProfile.ifscCode}</div>
              {companyProfile.upiId && companyProfile.upiId.trim() ? (
                <div>UPI: {companyProfile.upiId}</div>
              ) : null}
            </div>
          </div>

          {/* Totals Table */}
          <div className="sm:w-72 space-y-2 text-xs divide-y divide-gray-100">
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Taxable Value:</span>
              <span className="font-mono font-semibold">
                ₹{displayedTotals.subtotal.toLocaleString("en-IN")}
              </span>
            </div>
            {invoice.igst > 0 ? (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">IGST:</span>
                <span className="font-mono font-semibold">
                  ₹{invoice.igst.toLocaleString("en-IN")}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">CGST (9%):</span>
                  <span className="font-mono font-semibold">
                    ₹{invoice.cgst.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">SGST (9%):</span>
                  <span className="font-mono font-semibold">
                    ₹{invoice.sgst.toLocaleString("en-IN")}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between py-2 bg-[#fef2f2] px-3 rounded-lg border border-rose-100">
              <span className="font-bold text-[#93000b] text-sm">
                Grand Total (₹):
              </span>
              <span className="font-mono font-bold text-[#93000b] text-base">
                ₹{displayedTotals.grandTotal.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* Footer & Signature */}
        <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-end justify-between gap-6">
          <div className="space-y-1 text-[10px] text-gray-400 max-w-sm">
            {resolveInvoiceTerms(companyProfile).length > 0 ? (
              <>
                <div className="font-bold uppercase text-gray-500">
                  Terms &amp; Conditions:
                </div>
                <ol className="list-decimal pl-4 space-y-1">
                  {resolveInvoiceTerms(companyProfile).map((clause, i) => (
                    <li key={i}>{clause}</li>
                  ))}
                </ol>
              </>
            ) : null}
            {resolveGstSupportInfo(companyProfile) && (
              <div className="pt-2 text-[10px] text-gray-500">
                {resolveGstSupportInfo(companyProfile)}
              </div>
            )}
          </div>

          <div className="text-center space-y-3 min-w-48">
            <div className="text-[11px] font-bold text-gray-800">
              For {companyProfile.companyName}
            </div>
            <div className="h-14 flex items-center justify-center">
              {companyProfile.digitalSignatureUrl ? (
                <img
                  src={companyProfile.digitalSignatureUrl}
                  alt="Digital Signature"
                  className="h-14 max-w-56 object-contain"
                />
              ) : (
                <span className="text-gray-300 font-serif italic text-xs">
                  [Authorized Signatory]
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 border-t border-gray-200 pt-1">
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>

      {editing && invoice && (
        <AddInvoiceModal
          invoice={invoice}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
};