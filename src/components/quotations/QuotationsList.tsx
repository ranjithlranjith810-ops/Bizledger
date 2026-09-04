"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Quotation } from "@/types";
import { dateInRange, fyShortName } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";
import { Plus, Search, Eye, Pencil } from "lucide-react";
import { SalesDocumentModal } from "@/components/shared/SalesDocumentModal";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
  Expired: "bg-gray-100 text-gray-500 border-gray-200",
};

export const QuotationsList: React.FC = () => {
  const { quotations, setOpenModal, getActiveFinancialYear } = useApp();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [editing, setEditing] = useState<Quotation | null>(null);

  const activeFy = getActiveFinancialYear();
  const fyStart = activeFy?.startDate || "";
  const fyEnd = activeFy?.endDate || "";
  const fyLabel = activeFy ? fyShortName(activeFy.name) : "";

  const fyQuotations = quotations.filter((q) =>
    fyStart && fyEnd ? dateInRange(q.date, fyStart, fyEnd) : true
  );
  const totalQuoted = fyQuotations.reduce((acc, q) => acc + q.grandTotal, 0);

  const filtered = fyQuotations.filter((q) => {
    const matchesQuery = matchesSearch(searchQuery, [
      q.quotationNumber,
      q.customerName,
      q.customerGstin,
    ]);
    const matchesStatus =
      statusFilter === "All" || q.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const openQuotation = (q: Quotation) => {
    router.push(`/quotations/${q.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            Quotations
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span>
              Fixed-price offers sent to customers. Convert an accepted
              quotation into an invoice explicitly.
            </span>
            {fyLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#fef2f2] text-[#93000b] font-semibold border border-rose-100">
                {fyLabel}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            id="btn-create-quotation"
            onClick={() => setOpenModal("add-quotation")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Quotation</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Total Quoted (Incl. GST)
            </span>
            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">
                request_quote
              </span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-gray-900 font-mono">
              ₹{totalQuoted.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {fyQuotations.length} quotations
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search quotation number, customer, or GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
          {["All", "Draft", "Sent", "Accepted", "Rejected", "Expired"].map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                  statusFilter === s
                    ? "bg-[#93000b] text-white shadow-xs"
                    : "bg-[#f2f4f6] text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            )
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Quotation #</th>
                <th className="py-3 px-4">Customer & GSTIN</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Valid Until</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Tax (GST)</th>
                <th className="py-3 px-4 text-right">Total (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400">
                    <span className="material-symbols-outlined text-[30px] text-gray-300 block mx-auto mb-1.5">
                      request_quote
                    </span>
                    {quotations.length === 0
                      ? "No quotations yet — create your first."
                      : "No quotations match your filter criteria."}
                  </td>
                </tr>
              ) : (
                filtered.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => openQuotation(q)}
                    className="hover:bg-[#f7f9fb] transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900 whitespace-nowrap">
                      {q.quotationNumber}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-gray-900 truncate">
                        {q.customerName}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 truncate">
                        GST: {q.customerGstin || "-"}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">
                      {q.date}
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">
                      {q.validUntil}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-gray-600">
                      ₹{q.subtotal.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-gray-600">
                      ₹{q.totalTax.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                      ₹{q.grandTotal.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          STATUS_COLORS[q.status] || STATUS_COLORS.Draft
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td
                      className="py-3.5 px-4 text-center whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openQuotation(q)}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                          title="View Quotation"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditing(q)}
                          className="p-1.5 text-gray-500 hover:text-[#166534] hover:bg-[#f0fdf4] rounded-lg transition-colors"
                          title="Edit Quotation"
                        >
                          <Pencil className="w-4 h-4" />
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
        <SalesDocumentModal
          kind="quotation"
          doc={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};