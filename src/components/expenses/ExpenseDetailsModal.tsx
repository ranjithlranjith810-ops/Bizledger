"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  X,
  Receipt,
  Download,
  Printer,
  CheckCircle2,
  FileText,
  Clock,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

export const ExpenseDetailsModal: React.FC = () => {
  const { selectedExpenseId, setSelectedExpenseId, setOpenModal, expenses } =
    useApp();
  const [showFullReceipt, setShowFullReceipt] = useState(false);

  const expense = expenses.find((e) => e.id === selectedExpenseId);

  if (!expense) return null;

  const handlePrint = () => {
    window.print();
  };

  const closeModal = () => {
    setSelectedExpenseId(null);
    setOpenModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        {/* Modal Top Nav */}
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center font-mono font-bold text-xs">
              EXP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#191c1e] font-mono">
                  Expense #{expense.expenseNumber}
                </h3>
                <span className="bg-blue-50 text-blue-700 text-[11px] font-semibold px-2 py-0.5 rounded border border-blue-200">
                  {expense.category}
                </span>
                <span className="bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {expense.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate max-w-md">
                {expense.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              title="Print Expense Voucher"
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={closeModal}
              className="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Amount Card */}
          <div className="bg-gradient-to-r from-[#93000b] to-[#770008] text-white p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-rose-200">
                Settled Amount
              </span>
              <div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight mt-1">
                ₹
                {expense.amount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <p className="text-xs text-rose-100 mt-1">
                Paid from {expense.paidFromAccount}
              </p>
            </div>
            <div className="text-right sm:text-right">
              <span className="text-[11px] text-rose-200 uppercase font-semibold">
                Payment Method
              </span>
              <div className="text-base font-bold">
                {expense.paymentMethod}
              </div>
              <div className="text-xs font-mono text-rose-100">
                {expense.referenceNumber}
              </div>
            </div>
          </div>

          {/* Detailed Info Grid */}
          <div className="bg-[#f7f9fb] p-5 rounded-xl border border-[#eceef0]">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              Transaction Details &amp; Metadata
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6 text-xs">
              {/* Vendor */}
              <div>
                <span className="text-gray-400 block mb-0.5">
                  Vendor / Payee
                </span>
                <span className="font-semibold text-gray-900 text-sm">
                  {expense.vendor || "-"}
                </span>
              </div>

              {/* Date */}
              <div>
                <span className="text-gray-400 block mb-0.5">
                  Date of Expense
                </span>
                <span className="font-semibold text-gray-900">
                  {expense.date}
                </span>
              </div>

              {/* Type */}
              <div>
                <span className="text-gray-400 block mb-0.5">
                  Expense Type
                </span>
                <span className="font-semibold text-gray-900">
                  {expense.expenseType} Expense
                </span>
              </div>

              {/* Added By */}
              <div>
                <span className="text-gray-400 block mb-0.5">Created By</span>
                <span className="font-semibold text-gray-900">
                  {expense.createdBy}
                </span>
              </div>

              {/* Approved By */}
              <div>
                <span className="text-gray-400 block mb-0.5">
                  Approved By
                </span>
                <span className="font-semibold text-emerald-700">
                  {expense.approvedBy || "Sarah Jenkins"}
                </span>
              </div>

              {/* Vehicle Link (if any) */}
              {expense.vehicleRegistration && (
                <div>
                  <span className="text-gray-400 block mb-0.5">
                    Fleet Vehicle Linked
                  </span>
                  <span className="font-mono font-bold text-[#93000b] bg-rose-50 px-2 py-0.5 rounded">
                    {expense.vehicleRegistration}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Internal Notes */}
          {expense.notes && (
            <div className="bg-white p-4 rounded-xl border border-[#eceef0] text-xs">
              <h4 className="font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#93000b]" />
                Internal Notes &amp; Description
              </h4>
              <p className="text-gray-600 leading-relaxed bg-[#f7f9fb] p-3 rounded-lg border border-gray-100 font-normal">
                {expense.notes}
              </p>
            </div>
          )}

          {/* Attached Receipt Section */}
          <div className="bg-white p-4 rounded-xl border border-[#eceef0] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#93000b]" />
                Attached Receipt &amp; Tax Invoice
              </h4>
              {expense.receiptUrl && (
                <a
                  href={expense.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={expense.receiptName || "receipt"}
                  className="text-xs font-semibold text-[#93000b] hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File ({expense.receiptSize || "1.4 MB"})
                </a>
              )}
            </div>

            {expense.receiptUrl ? (
              <div className="space-y-3">
                <div
                  onClick={() => setShowFullReceipt(!showFullReceipt)}
                  className="relative group rounded-xl overflow-hidden border border-gray-200 cursor-pointer max-h-64 bg-gray-100 flex items-center justify-center"
                >
                  <img
                    src={expense.receiptUrl}
                    alt="Receipt preview"
                    className="w-full h-auto object-cover max-h-64 group-hover:scale-102 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Click to expand receipt
                  </div>
                </div>

                {showFullReceipt && (
                  <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 flex items-center justify-between">
                    <span>
                      File: {expense.receiptName || "ApexSteel_Inv_8921.pdf"}
                    </span>
                    <button
                      onClick={() => setShowFullReceipt(false)}
                      className="text-gray-500 hover:text-gray-800 font-semibold"
                    >
                      Collapse preview
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 bg-gray-50 rounded-xl text-center text-xs text-gray-400">
                No physical receipt image was attached to this expense entry.
              </div>
            )}
          </div>

          {/* Audit Trail Timeline */}
          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Audit &amp; Verification Log
            </h4>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-gray-800">
                    Approved by David Lee
                  </span>
                  <p className="text-[11px] text-gray-400">
                    Verified against purchase order PO-8819
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-gray-800">
                    Created by {expense.createdBy}
                  </span>
                  <p className="text-[11px] text-gray-400">
                    {expense.createdAt || "2026-08-24 10:30 AM"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-[#f7f9fb] border-t border-[#eceef0] flex items-center justify-end">
          <button
            onClick={closeModal}
            className="bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};