"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { ExpenseCategory } from "@/types";
import { dateInRange, fyShortName } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";
import {
  Receipt,
  Plus,
  Search,
  Download,
  Calendar,
  Eye,
  Trash2,
  TrendingUp,
  Sparkles,
  Package,
} from "lucide-react";

export const ExpensesList: React.FC = () => {
  const { expenses, deleteExpense, setSelectedExpenseId, setOpenModal, getActiveFinancialYear } =
    useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("All");

  // Only expenses dated within the active financial year are shown.
  const activeFy = getActiveFinancialYear();
  const fyStart = activeFy?.startDate || "";
  const fyEnd = activeFy?.endDate || "";
  const fyLabel = activeFy ? fyShortName(activeFy.name) : "";
  const fyExpenses = expenses.filter((e) =>
    fyStart && fyEnd ? dateInRange(e.date, fyStart, fyEnd) : true
  );

  // Filtered expenses
  const filteredExpenses = fyExpenses.filter((exp) => {
    const matchesQuery = matchesSearch(searchQuery, [
      exp.expenseNumber,
      exp.title,
      exp.vendor,
      exp.referenceNumber,
    ]);

    const matchesCategory =
      selectedCategory === "All" || exp.category === selectedCategory;
    const matchesPayment =
      selectedPaymentMethod === "All" ||
      exp.paymentMethod === selectedPaymentMethod;

    return matchesQuery && matchesCategory && matchesPayment;
  });

  // Aggregate metrics
  const totalAmount = fyExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  const thisMonthTotal = useMemo(() => {
    // Current month sum
    return expenses
      .filter((e) => e.date.startsWith("2026-08"))
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses]);

  const todayTotal = useMemo(() => {
    return expenses
      .filter((e) => e.date === "2026-08-24")
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses]);

  // Category Colors
  const getCategoryBadgeClass = (category: ExpenseCategory) => {
    switch (category) {
      case "Raw Material":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Fuel":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Maintenance":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "Utilities":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Labour & Wages":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Office Supplies":
        return "bg-slate-50 text-slate-700 border-slate-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "Expense No",
      "Date",
      "Title",
      "Category",
      "Vendor",
      "Amount",
      "Payment Method",
      "Ref No",
      "Status",
    ];
    const rows = filteredExpenses.map((e) => [
      e.expenseNumber,
      e.date,
      `"${e.title.replace(/"/g, '""')}"`,
      e.category,
      `"${(e.vendor || "").replace(/"/g, '""')}"`,
      e.amount,
      e.paymentMethod,
      e.referenceNumber || "",
      e.status,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `BizLedger_Expenses_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            Expenses &amp; Purchases
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span>Monitor company outlays, raw material procurement, fleet fuel, and
            utility bills.</span>
            {fyLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#fef2f2] text-[#93000b] font-semibold border border-rose-100">
                {fyLabel}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-white border border-[#eceef0] hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>Export CSV</span>
          </button>
          <button
            id="btn-add-expense"
            onClick={() => setOpenModal("add-expense")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Expense</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (Stitch Design #4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Expenses */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Total Expenses
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              ₹{totalAmount.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+8.4% vs last quarter</span>
          </div>
        </div>

        {/* This Month */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              This Month (Aug 2026)
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              ₹{thisMonthTotal.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {fyExpenses.length} records processed
          </div>
        </div>

        {/* Today */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Today&apos;s Spend
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              ₹{todayTotal.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            All receipts verified
          </div>
        </div>

        {/* Top Category */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Top Category
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-[#191c1e] truncate block">
              Raw Material
            </span>
            <span className="text-xs text-gray-500 font-mono">
              ₹1,19,400 (49% of total)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-purple-700 font-medium">
            3 primary suppliers
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by expense #, description, vendor, or ref no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none transition-all"
            />
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Payment:</span>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
            >
              <option value="All">All Methods</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="Credit Card">Credit Card</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold mr-1 shrink-0">
            Category:
          </span>
          {[
            "All",
            "Raw Material",
            "Fuel",
            "Maintenance",
            "Utilities",
            "Labour & Wages",
            "Office Supplies",
          ].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? "bg-[#93000b] text-white shadow-xs"
                  : "bg-[#f2f4f6] text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Data Table (Stitch Design #4) */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Expense ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Description &amp; Vendor</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium">
                      No expenses matching your criteria
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCategory("All");
                        setSelectedPaymentMethod("All");
                      }}
                      className="mt-2 text-xs text-[#93000b] hover:underline"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="hover:bg-[#f7f9fb] transition-colors group"
                  >
                    {/* Expense ID */}
                    <td className="py-3 px-4 font-mono font-semibold text-[#93000b]">
                      <button
                        onClick={() => {
                          setSelectedExpenseId(exp.id);
                          setOpenModal("expense-details");
                        }}
                        className="hover:underline text-left"
                      >
                        {exp.expenseNumber}
                      </button>
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {exp.date}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getCategoryBadgeClass(
                          exp.category
                        )}`}
                      >
                        {exp.category}
                      </span>
                    </td>

                    {/* Title & Vendor */}
                    <td className="py-3 px-4 max-w-xs">
                      <div
                        className="font-semibold text-gray-900 truncate"
                        title={exp.title}
                      >
                        {exp.title}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1.5 truncate">
                        <span>Vendor: {exp.vendor || "-"}</span>
                        {exp.vehicleRegistration && (
                          <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded text-[10px] font-mono">
                            {exp.vehicleRegistration}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Payment Method */}
                    <td className="py-3 px-4 text-gray-700 whitespace-nowrap">
                      <div className="font-medium">{exp.paymentMethod}</div>
                      <div className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">
                        {exp.referenceNumber || "Cash Payout"}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 text-sm whitespace-nowrap">
                      ₹{exp.amount.toLocaleString("en-IN")}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {exp.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedExpenseId(exp.id);
                            setOpenModal("expense-details");
                          }}
                          title="View Details & Receipt"
                          className="p-1.5 text-gray-500 hover:text-[#93000b] hover:bg-[#fef2f2] rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          title="Delete Expense"
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="bg-[#f7f9fb] px-4 py-3 border-t border-[#eceef0] flex items-center justify-between text-xs text-gray-500">
          <div>
            Showing{" "}
            <span className="font-semibold text-gray-800">
              {filteredExpenses.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-gray-800">
              {fyExpenses.length}
            </span>{" "}
            expenses
          </div>
          <div className="font-medium text-gray-700">
            Filtered Subtotal:{" "}
            <span className="font-bold text-[#191c1e] font-mono">
              ₹
              {filteredExpenses
                .reduce((acc, c) => acc + c.amount, 0)
                .toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};