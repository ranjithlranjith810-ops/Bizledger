"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { sumStoredInvoiceTotals } from "@/lib/invoice";
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
  Pencil,
  Truck,
} from "lucide-react";

export const InvoiceDetailsView: React.FC = () => {
  const { invoices, companyProfile, updateInvoiceStatus, addNotification } =
    useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);

  const invoice =
    invoices.find((inv) => inv.id === params.id) || invoices[0];

  const displayedTotals = sumStoredInvoiceTotals(invoice?.items || []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    addNotification({
      type: "success",
      title: "Tax Invoice PDF Ready",
      message: `Tax Invoice ${invoice.invoiceNumber} has been downloaded.`,
    });
  };

  const handleShare = () => {
    addNotification({
      type: "info",
      title: "WhatsApp Invoice Link Dispatched",
      message: `Digital invoice payment link sent to ${invoice.customerPhone}.`,
    });
  };

  const toggleStatus = () => {
    const nextStatus = invoice.status === "Paid" ? "Pending" : "Paid";
    updateInvoiceStatus(invoice.id, nextStatus);
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
          <button
            onClick={toggleStatus}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              invoice.status === "Paid"
                ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {invoice.status === "Paid" ? "Mark as Pending" : "Mark as Paid"}
            </span>
          </button>

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
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

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
                  className="w-8 h-8 rounded-lg object-cover"
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