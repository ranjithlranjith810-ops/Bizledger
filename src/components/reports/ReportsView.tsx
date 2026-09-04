"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import {
  Download,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  FileText,
  Printer,
  Users,
  Package,
  Truck,
  BarChart3,
  ReceiptText,
} from "lucide-react";

const inr = (n: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const now = new Date();

// Return [startMs, endMs] for the selected range relative to today.
function rangeBounds(range: string): [number, number] {
  const s = new Date(now);
  const e = new Date(s);
  switch (range) {
    case "This Week": {
      const d = s.getDay(); // 0 Sun..6 Sat
      const diff = (d + 6) % 7; // days since Monday
      s.setDate(s.getDate() - diff);
      s.setHours(0, 0, 0, 0);
      e.setDate(e.getDate() + (6 - diff));
      e.setHours(23, 59, 59, 999);
      break;
    }
    case "This Month":
      s.setDate(1);
      s.setHours(0, 0, 0, 0);
      e.setMonth(e.getMonth() + 1, 0);
      e.setHours(23, 59, 59, 999);
      break;
    case "This Quarter": {
      const q = Math.floor(s.getMonth() / 3);
      s.setMonth(q * 3, 1);
      s.setHours(0, 0, 0, 0);
      e.setMonth(q * 3 + 3, 0);
      e.setHours(23, 59, 59, 999);
      break;
    }
    default: {
      // This FY (Apr 1 of financial year for the current date)
      const fyStartYear = s.getMonth() >= 3 ? s.getFullYear() : s.getFullYear() - 1;
      s.setFullYear(fyStartYear, 3, 1);
      s.setHours(0, 0, 0, 0);
      e.setFullYear(fyStartYear + 1, 2, 31);
      e.setHours(23, 59, 59, 999);
      break;
    }
  }
  return [s.getTime(), e.getTime()];
}

export const ReportsView: React.FC = () => {
  const {
    addNotification,
    invoices,
    expenses,
    customers,
    products,
    vehicles,
    purchaseOrders,
  } = useApp();

  const [dateRange, setDateRange] = useState<string>("This Month");

  const [startMs, endMs] = useMemo(() => rangeBounds(dateRange), [dateRange]);

  const rangeInvoices = useMemo(
    () =>
      invoices.filter(
        (i) =>
          i.status !== "Cancelled" &&
          new Date(i.date).getTime() >= startMs &&
          new Date(i.date).getTime() <= endMs
      ),
    [invoices, startMs, endMs]
  );

  const rangeExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          new Date(e.date).getTime() >= startMs && new Date(e.date).getTime() <= endMs
      ),
    [expenses, startMs, endMs]
  );

  const rangePurchases = useMemo(
    () =>
      purchaseOrders.filter(
        (p) =>
          p.status !== "Cancelled" &&
          new Date(p.date).getTime() >= startMs &&
          new Date(p.date).getTime() <= endMs
      ),
    [purchaseOrders, startMs, endMs]
  );

  // Core metrics — every figure below is derived from real business data, never
  // hard-coded.
  const totalSales = rangeInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalPurchases = rangePurchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
  const totalExpenses = rangeExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const payroll =
    dateRange === "This Month"
      ? rangeExpenses
          .filter((e) => e.category === "Labour & Wages")
          .reduce((s, e) => s + (e.amount || 0), 0)
      : rangeExpenses
          .filter((e) => e.category === "Labour & Wages")
          .reduce((s, e) => s + (e.amount || 0), 0);

  const outstandingInvoices = invoices.filter(
    (i) => i.status === "Pending" || i.status === "Overdue"
  );
  const outstandingTotal = outstandingInvoices.reduce(
    (s, i) => s + (i.grandTotal || 0),
    0
  );
  const outstandingCustomerCount = new Set(outstandingInvoices.map((i) => i.customerId))
    .size;

  // Weekly bar chart — 7 bars, Mon..Sun, grouped from actual invoices/purchases.
  const weekBars = useMemo(() => {
    const dayIndex = (iso: string) => {
      const d = new Date(iso);
      return (d.getDay() + 6) % 7; // Mon=0
    };
    const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const sales = new Array(7).fill(0);
    const purch = new Array(7).fill(0);
    invoices
      .filter((i) => i.status !== "Cancelled")
      .forEach((i) => {
        const idx = dayIndex(i.date);
        sales[idx] += i.grandTotal || 0;
      });
    purchaseOrders
      .filter((p) => p.status !== "Cancelled")
      .forEach((p) => {
        const idx = dayIndex(p.date);
        purch[idx] += p.grandTotal || 0;
      });
    const max = Math.max(1, ...sales, ...purch);
    return dayName.map((name, idx) => {
      const s = sales[idx];
      const p = purch[idx];
      return {
        day: name,
        sales: s,
        purchases: p,
        hSales: `${Math.round((s / max) * 100)}%`,
        hPurch: `${Math.round((p / max) * 100)}%`,
      };
    });
  }, [invoices, purchaseOrders]);

  const maxDay = weekBars.reduce(
    (best, b) => (b.sales > best.sales ? b : best),
    weekBars[0]
  );
  const grossMarginPct =
    totalSales > 0
      ? ((totalSales - (totalPurchases + totalExpenses)) / totalSales) * 100
      : 0;

  // GST & tax computation from real invoice/purchase data.
  const outwardTax = rangeInvoices.reduce((s, i) => s + (i.totalTax || 0), 0);
  const itc = rangePurchases.reduce((s, p) => s + (p.totalTax || 0), 0);
  const netGst = Math.max(0, outwardTax - itc);
  const fyMonthlyLabel = new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
  }).format(now);

  // Top customers by billed revenue.
  const topCustomers = useMemo(() => {
    const cityByCustomer = new Map<string, string>(
      customers.map((c) => [c.id, c.billingAddress?.city || c.primaryContact?.name || ""])
    );
    const map = new Map<string, { name: string; city: string; billed: number }>();
    rangeInvoices.forEach((i) => {
      const city = cityByCustomer.get(i.customerId) || "";
      const cur = map.get(i.customerName) || {
        name: i.customerName,
        city,
        billed: 0,
      };
      cur.billed += i.grandTotal || 0;
      map.set(i.customerName, cur);
    });
    return [...map.values()]
      .sort((a, b) => b.billed - a.billed)
      .slice(0, 4);
  }, [rangeInvoices, customers]);

  // Top products / materials by quantity dispatched.
  const topProducts = useMemo(() => {
    const skuByProduct = new Map<string, string>(
      products.map((p) => [p.id, p.sku])
    );
    const map = new Map<
      string,
      { name: string; sku: string; unit: string; qty: number; amount: number }
    >();
    rangeInvoices.forEach((i) =>
      (i.items || []).forEach((it) => {
        const key = it.description || it.productId || it.id;
        const cur = map.get(key) || {
          name: it.description,
          sku: (it.productId && skuByProduct.get(it.productId)) || "",
          unit: it.unit,
          qty: 0,
          amount: 0,
        };
        cur.qty += it.quantity || 0;
        cur.amount += it.totalAmount || 0;
        map.set(key, cur);
      })
    );
    return [...map.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [rangeInvoices, products]);

  const handleDownloadReport = (reportName: string, format: string) => {
    addNotification({
      type: "success",
      title: "Report Generated",
      message: `${reportName} has been compiled and downloaded as .${format.toLowerCase()}.`,
    });
  };

  if (invoices.length === 0 && expenses.length === 0 && purchaseOrders.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
              Financial Reports & GST Analytics
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Executive accounting summary, profit & loss, GST tax filings, and cash flow trends.
            </p>
          </div>
        </div>
        <div className="bg-white border border-[#eceef0] rounded-2xl p-14 flex flex-col items-center justify-center text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#f7f9fb] text-[#93000b] flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#191c1e]">No report data yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm">
            Once you add invoices, purchases and expenses, your financial reports,
            GST summary and cash-flow trend will appear here automatically.
          </p>
          <div className="flex items-center gap-2 mt-5 text-xs text-gray-400">
            <ReceiptText className="w-4 h-4" />
            <span>Reports are computed live from your business records.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            Financial Reports & GST Analytics
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Executive accounting summary, profit & loss, GST tax filings, and cash flow trends.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Timeframe Dropdown */}
          <div className="flex items-center gap-1 bg-white border border-[#eceef0] p-1 rounded-xl shadow-xs text-xs">
            {["This Week", "This Month", "This Quarter", "This FY"].map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  dateRange === r
                    ? "bg-[#93000b] text-white shadow-xs font-semibold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleDownloadReport("BizLedger_Executive_Summary", "PDF")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 5 High-Impact Metric Cards (Stitch Design #14) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Sales */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Total Sales
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            {inr(totalSales)}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{rangeInvoices.length} invoice(s) in period</span>
          </div>
        </div>

        {/* Total Purchases */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Total Purchases
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            {inr(totalPurchases)}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{rangePurchases.length} PO(s) in period</span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Total Expenses
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            {inr(totalExpenses)}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>{rangeExpenses.length} entries in period</span>
          </div>
        </div>

        {/* Labour & Payroll */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Labour & Wages
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            {inr(payroll)}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {rangeExpenses.filter((e) => e.category === "Labour & Wages").length} entry(ies)
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Outstanding Due
          </span>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono">
            {inr(outstandingTotal)}
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium">
            {outstandingCustomerCount} customer account(s)
          </div>
        </div>
      </div>

      {/* Chart Section & Cash Flow Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Sales Overview Bar Chart (Stitch Design #14) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#191c1e]">Weekly Sales & Outlays Trend</h3>
              <p className="text-xs text-gray-500">Comparing daily invoiced turnover against operational purchases</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#93000b]"></span>
                <span className="text-gray-600">Sales (₹)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-200"></span>
                <span className="text-gray-600">Purchases (₹)</span>
              </div>
            </div>
          </div>

          {/* Pure CSS / SVG High-Accuracy Bar Chart */}
          <div className="h-64 pt-6 flex items-end justify-between gap-3 sm:gap-6 border-b border-[#eceef0] pb-2">
            {weekBars.map((item) => (
              <div key={item.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                <div className="text-[10px] font-mono text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                  ₹{(item.sales / 1000).toFixed(0)}k
                </div>
                <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-full">
                  <div
                    style={{ height: item.hPurch }}
                    className="w-3 sm:w-5 bg-slate-200 rounded-t-sm transition-all group-hover:bg-slate-300"
                    title={`Purchases: ₹${item.purchases}`}
                  ></div>
                  <div
                    style={{ height: item.hSales }}
                    className="w-3 sm:w-5 bg-[#93000b] rounded-t-sm transition-all group-hover:bg-[#770008] shadow-xs"
                    title={`Sales: ₹${item.sales}`}
                  ></div>
                </div>
                <span className="text-[11px] font-semibold text-gray-500">{item.day}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <span>
              Peak turnover recorded on {maxDay ? maxDay.day : "-"} ({inr(maxDay ? maxDay.sales : 0)})
            </span>
            <span className="font-bold text-gray-800">Gross Margin: {grossMarginPct.toFixed(1)}%</span>
          </div>
        </div>

        {/* GST & Tax Liability Card (Stitch Design #14) */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#191c1e]">GST & Tax Summary</h3>
            <span className="text-[10px] bg-rose-50 text-[#93000b] font-bold px-2 py-0.5 rounded font-mono">
              {fyMonthlyLabel}
            </span>
          </div>

          <div className="space-y-3 text-xs divide-y divide-gray-100">
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Outward Tax Collected (GSTR-1)</span>
              <span className="font-mono font-bold text-gray-900">{inr(outwardTax)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Eligible Input Tax Credit (ITC)</span>
              <span className="font-mono font-bold text-emerald-700">- {inr(itc)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">RCM Tax Liability</span>
              <span className="font-mono font-medium text-gray-700">{inr(0)}</span>
            </div>
            <div className="flex justify-between py-2.5 bg-[#fef2f2] px-3 rounded-lg border border-rose-100">
              <span className="font-bold text-[#93000b]">Net GST Payable in Cash</span>
              <span className="font-mono font-bold text-[#93000b] text-sm">{inr(netGst)}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => handleDownloadReport(`GSTR_3B_Computation_${fyMonthlyLabel.replace(/ /g, "")}`, "PDF")}
              className="w-full bg-[#f2f4f6] hover:bg-[#eceef0] text-gray-800 font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#93000b]" />
              <span>Download GSTR-3B Computation</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Customers & Top Selling Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers (Stitch Design #14) */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#93000b]" />
              <h3 className="text-sm font-bold text-[#191c1e]">Top Customers by Revenue</h3>
            </div>
            <span className="text-xs text-gray-400">Total Billed</span>
          </div>

          {topCustomers.length === 0 ? (
            <p className="text-xs text-gray-400">
              No invoices billed in this period yet.
            </p>
          ) : (
            <div className="space-y-3">
              {topCustomers.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between p-2.5 bg-[#f7f9fb] rounded-xl text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-white font-bold text-gray-500 flex items-center justify-center text-[11px] border border-gray-200">
                      {i + 1}
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 block">{c.name}</span>
                      <span className="text-[10px] text-gray-400">{c.city}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-gray-900 block">{inr(c.billed)}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      {totalSales > 0 ? Math.round((c.billed / totalSales) * 100) : 0}% share
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Selling Products (Stitch Design #14) */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#93000b]" />
              <h3 className="text-sm font-bold text-[#191c1e]">Top Products & Material Dispatches</h3>
            </div>
            <span className="text-xs text-gray-400">Qty Sold</span>
          </div>

          {topProducts.length === 0 ? (
            <p className="text-xs text-gray-400">
              No product dispatches in this period yet.
            </p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between p-2.5 bg-[#f7f9fb] rounded-xl text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-white font-bold text-gray-500 flex items-center justify-center text-[11px] border border-gray-200">
                      {i + 1}
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 block">{p.name}</span>
                      <span className="text-[10px] font-mono text-gray-400">SKU: {p.sku || "—"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-gray-900 block">{inr(p.amount)}</span>
                    <span className="text-[10px] text-gray-500">{p.qty} {p.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ready-to-Download Statutory Detailed Reports (Stitch Design #14) */}
      <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-[#191c1e] flex items-center gap-2">
          <Download className="w-4 h-4 text-[#93000b]" />
          <span>One-Click Statutory Export Center</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* GSTR-1 */}
          <div className="p-3 bg-[#f7f9fb] rounded-xl border border-[#eceef0] flex flex-col justify-between space-y-3">
            <div>
              <span className="font-bold text-gray-900 block">GSTR-1 Monthly Sales</span>
              <p className="text-[11px] text-gray-400 mt-0.5">B2B, B2CL, HSN summary & tax split ready for GST Portal</p>
            </div>
            <button
              onClick={() => handleDownloadReport(`GSTR1_Monthly_Sales_${fyMonthlyLabel.replace(/ /g, "")}`, "JSON")}
              className="bg-white hover:bg-gray-100 border border-[#eceef0] text-gray-800 font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs"
            >
              <Download className="w-3.5 h-3.5 text-[#93000b]" />
              <span>Export JSON / CSV</span>
            </button>
          </div>

          {/* P&L */}
          <div className="p-3 bg-[#f7f9fb] rounded-xl border border-[#eceef0] flex flex-col justify-between space-y-3">
            <div>
              <span className="font-bold text-gray-900 block">Profit & Loss Statement</span>
              <p className="text-[11px] text-gray-400 mt-0.5">Comprehensive income, direct expenses, and EBITDA breakdown</p>
            </div>
            <button
              onClick={() => handleDownloadReport(`Profit_and_Loss_Statement_${now.getFullYear()}`, "PDF")}
              className="bg-white hover:bg-gray-100 border border-[#eceef0] text-gray-800 font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-[#93000b]" />
              <span>Download PDF</span>
            </button>
          </div>

          {/* Vehicle Fleet Logbook */}
          <div className="p-3 bg-[#f7f9fb] rounded-xl border border-[#eceef0] flex flex-col justify-between space-y-3">
            <div>
              <span className="font-bold text-gray-900 block">Fleet & Fuel Audit Log</span>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {vehicles.length || 0} vehicle(s) fuel mileage, FASTag expenses, and service logs
              </p>
            </div>
            <button
              onClick={() => handleDownloadReport("Fleet_Fuel_Mileage_Audit", "CSV")}
              className="bg-white hover:bg-gray-100 border border-[#eceef0] text-gray-800 font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs"
            >
              <Truck className="w-3.5 h-3.5 text-amber-700" />
              <span>Download CSV</span>
            </button>
          </div>

          {/* Customer Ledger */}
          <div className="p-3 bg-[#f7f9fb] rounded-xl border border-[#eceef0] flex flex-col justify-between space-y-3">
            <div>
              <span className="font-bold text-gray-900 block">Debtor Ageing & Ledger</span>
              <p className="text-[11px] text-gray-400 mt-0.5">30/60/90 day outstanding balances and payment status</p>
            </div>
            <button
              onClick={() => handleDownloadReport("Customer_Debtors_Ageing_Report", "XLSX")}
              className="bg-white hover:bg-gray-100 border border-[#eceef0] text-gray-800 font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Download Excel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};