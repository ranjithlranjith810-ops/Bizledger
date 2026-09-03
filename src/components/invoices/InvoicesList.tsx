"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Invoice } from "@/types";
import { dateInRange, fyShortName } from "@/lib/utils";
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Eye,
  Pencil,
} from "lucide-react";
import { AddInvoiceModal } from "@/components/invoices/AddInvoiceModal";

export const InvoicesList: React.FC = () => {
  const { invoices, setOpenModal, addNotification, getActiveFinancialYear } = useApp();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [editing, setEditing] = useState<Invoice | null>(null);

  // Only invoices dated within the active financial year are shown.
  const activeFy = getActiveFinancialYear();
  const fyStart = activeFy?.startDate || "";
  const fyEnd = activeFy?.endDate || "";
  const fyLabel = activeFy ? fyShortName(activeFy.name) : "";
  const fyInvoices = invoices.filter((inv) =>
    fyStart && fyEnd ? dateInRange(inv.date, fyStart, fyEnd) : true
  );

  // Aggregates for 4 Cards (Stitch Design #6)
  const totalInvoiced = fyInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
  const paidInvoices = fyInvoices.filter((inv) => inv.status === "Paid");
  const paidAmount = paidInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
  const pendingInvoices = fyInvoices.filter((inv) => inv.status === "Pending");
  const pendingAmount = pendingInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
  const overdueInvoices = fyInvoices.filter((inv) => inv.status === "Overdue");
  const overdueAmount = overdueInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);

  // Filtered List
  const filteredInvoices = invoices.filter((inv) => {
    const inThisFy = fyStart && fyEnd ? dateInRange(inv.date, fyStart, fyEnd) : true;
    if (!inThisFy) return false;
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.customerGstin || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "All" || inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const openInvoice = (inv: Invoice) => {
    router.push(`/invoices/${inv.id}`);
  };

  const handleDownload = (inv: Invoice) => {
    addNotification({
      type: "success",
      title: "PDF Downloaded",
      message: `Invoice ${inv.invoiceNumber} saved to downloads.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Sales & GST Tax Invoices</h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span>Create, track, and export compliant GST B2B & B2C tax invoices and client ledgers.</span>
            {fyLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#fef2f2] text-[#93000b] font-semibold border border-rose-100">
                {fyLabel}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            id="btn-create-invoice"
            onClick={() => setOpenModal("add-invoice")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* 4 Metric Cards (Stitch Design #6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Billed</span>
            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-gray-900 font-mono">
              ₹{totalInvoiced.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {fyInvoices.length} generated invoices
          </div>
        </div>

        {/* Paid Invoices */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Paid Invoices</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-emerald-700 font-mono">
              ₹{paidAmount.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-medium">
            {paidInvoices.length} settled payments
          </div>
        </div>

        {/* Pending Receivables */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Pending Receivables</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-amber-700 font-mono">
              ₹{pendingAmount.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium">
            {pendingInvoices.length} awaiting settlement
          </div>
        </div>

        {/* Overdue Invoices */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Overdue Invoices</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-rose-700 font-mono">
              ₹{overdueAmount.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {overdueInvoices.length} overdue bills
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Stitch Design #6) */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice number, client name, or GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none transition-all"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
          {['All', 'Paid', 'Pending', 'Overdue'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === s
                  ? 'bg-[#93000b] text-white shadow-xs'
                  : 'bg-[#f2f4f6] text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Table (Stitch Design #6) */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Customer & GSTIN</th>
                <th className="py-3 px-4">Billing Date</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Tax (GST)</th>
                <th className="py-3 px-4 text-right">Grand Total (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400">
                    <FileText className="w-6 h-6 mx-auto mb-1.5 text-gray-300" />
                    No invoices match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => openInvoice(inv)}
                    className="hover:bg-[#f7f9fb] transition-colors cursor-pointer"
                  >
                    {/* Invoice No */}
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900 whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-gray-900 truncate">{inv.customerName}</div>
                      <div className="text-[10px] font-mono text-gray-400 truncate">
                        GST: {inv.customerGstin || "-"}
                      </div>
                    </td>

                    {/* Dates */}
                    <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">{inv.date}</td>
                    <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">{inv.dueDate}</td>

                    {/* Financials */}
                    <td className="py-3.5 px-4 text-right font-mono text-gray-600">
                      ₹{inv.subtotal.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-gray-600">
                      ₹{inv.totalTax.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                      ₹{inv.grandTotal.toLocaleString("en-IN")}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          inv.status === "Paid"
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : inv.status === "Pending"
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div
                        className="flex items-center justify-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openInvoice(inv)}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                          title="View Invoice Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditing(inv)}
                          className="p-1.5 text-gray-500 hover:text-[#166534] hover:bg-[#f0fdf4] rounded-lg transition-colors"
                          title="Edit Invoice"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(inv)}
                          className="p-1.5 text-gray-500 hover:text-[#93000b] hover:bg-rose-50 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <AddInvoiceModal invoice={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
};