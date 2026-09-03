"use client";

import React, { useState } from "react";
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
} from "lucide-react";

export const ReportsView: React.FC = () => {
  const { addNotification } = useApp();

  const [dateRange, setDateRange] = useState<string>("This Month");

  const handleDownloadReport = (reportName: string, format: string) => {
    addNotification({
      type: "success",
      title: "Report Generated",
      message: `${reportName} has been compiled and downloaded as .${format.toLowerCase()}.`,
    });
  };

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
            ₹4,85,000
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+12.5% vs last mo</span>
          </div>
        </div>

        {/* Total Purchases */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Total Purchases
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            ₹3,12,000
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+8.2% raw stock</span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Total Expenses
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            ₹45,500
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>-3.1% operational</span>
          </div>
        </div>

        {/* Labour & Payroll */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Labour & Wages
          </span>
          <div className="mt-1.5 text-2xl font-bold text-gray-900 font-mono">
            ₹32,000
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            100% disbursed on time
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Outstanding Due
          </span>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono">
            ₹1,28,000
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium">
            3 customer accounts
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
            {[
              { day: "Mon", sales: 42000, purchases: 28000, hSales: "42%", hPurch: "28%" },
              { day: "Tue", sales: 68000, purchases: 45000, hSales: "68%", hPurch: "45%" },
              { day: "Wed", sales: 95000, purchases: 52000, hSales: "95%", hPurch: "52%" },
              { day: "Thu", sales: 78000, purchases: 38000, hSales: "78%", hPurch: "38%" },
              { day: "Fri", sales: 110000, purchases: 64000, hSales: "100%", hPurch: "58%" },
              { day: "Sat", sales: 92000, purchases: 48000, hSales: "84%", hPurch: "44%" },
              { day: "Sun", sales: 25000, purchases: 10000, hSales: "25%", hPurch: "10%" },
            ].map((item) => (
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
            <span>Peak turnover recorded on Friday (₹1,10,000)</span>
            <span className="font-bold text-gray-800">Gross Margin: 35.6%</span>
          </div>
        </div>

        {/* GST & Tax Liability Card (Stitch Design #14) */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#191c1e]">GST & Tax Summary</h3>
            <span className="text-[10px] bg-rose-50 text-[#93000b] font-bold px-2 py-0.5 rounded font-mono">
              Aug 2026
            </span>
          </div>

          <div className="space-y-3 text-xs divide-y divide-gray-100">
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Outward Tax Collected (GSTR-1)</span>
              <span className="font-mono font-bold text-gray-900">₹87,300</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Eligible Input Tax Credit (ITC)</span>
              <span className="font-mono font-bold text-emerald-700">- ₹56,160</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">RCM Tax Liability</span>
              <span className="font-mono font-medium text-gray-700">₹0.00</span>
            </div>
            <div className="flex justify-between py-2.5 bg-[#fef2f2] px-3 rounded-lg border border-rose-100">
              <span className="font-bold text-[#93000b]">Net GST Payable in Cash</span>
              <span className="font-mono font-bold text-[#93000b] text-sm">₹31,140</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => handleDownloadReport("GSTR_3B_Computation_Aug2026", "PDF")}
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

          <div className="space-y-3">
            {[
              { name: "Sri Lakshmi Steels & Fabricators", city: "Coimbatore", billed: "₹1,85,000", share: "38%" },
              { name: "Venkateshwara Engineering Works", city: "Tiruppur", billed: "₹1,42,000", share: "29%" },
              { name: "KSR Motors & Automotives", city: "Erode", billed: "₹98,000", share: "20%" },
              { name: "Deccan Hardware Agencies", city: "Salem", billed: "₹60,000", share: "13%" },
            ].map((c, i) => (
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
                  <span className="font-mono font-bold text-gray-900 block">{c.billed}</span>
                  <span className="text-[10px] text-emerald-600 font-semibold">{c.share} share</span>
                </div>
              </div>
            ))}
          </div>
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

          <div className="space-y-3">
            {[
              { name: 'Seamless High-Tensile Steel Pipe 2"', sku: "PIP-STL-2IN", qty: "270 Meters", amount: "₹1,13,400" },
              { name: "Heavy Duty Mild Steel Angle 50x50x5", sku: "ANG-MS-505", qty: "400 Kg", amount: "₹27,200" },
              { name: "Industrial Grade E6013 Electrodes", sku: "WLD-E6013-3", qty: "30 Boxes", amount: "₹25,500" },
              { name: "High Torque Precision Ball Bearing", sku: "BRG-6205-RS", qty: "25 Pcs", amount: "₹7,000" },
            ].map((p, i) => (
              <div key={p.name} className="flex items-center justify-between p-2.5 bg-[#f7f9fb] rounded-xl text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white font-bold text-gray-500 flex items-center justify-center text-[11px] border border-gray-200">
                    {i + 1}
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 block">{p.name}</span>
                    <span className="text-[10px] font-mono text-gray-400">SKU: {p.sku}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-gray-900 block">{p.amount}</span>
                  <span className="text-[10px] text-gray-500">{p.qty}</span>
                </div>
              </div>
            ))}
          </div>
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
              onClick={() => handleDownloadReport("GSTR1_Monthly_Sales_Aug2026", "JSON")}
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
              onClick={() => handleDownloadReport("Profit_and_Loss_Statement_2026", "PDF")}
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
              <p className="text-[11px] text-gray-400 mt-0.5">24 trucks fuel mileage, FASTag expenses, and service logs</p>
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
