"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ROUTES } from "@/lib/constants";
import { dateInRange, fyShortName } from "@/lib/utils";
import {
  TrendingUp,
  CreditCard,
  ReceiptText,
  ShoppingBag,
  Plus,
} from "lucide-react";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function DashboardPage() {
  const router = useRouter();
  const { setOpenModal, invoices, expenses, getActiveFinancialYear } = useApp();
  const activeFy = getActiveFinancialYear();
  const fyStart = activeFy?.startDate || "";
  const fyEnd = activeFy?.endDate || "";

  // FY-scoped transaction sets: the dashboard always reflects the active
  // financial year. Records dated outside the active FY are excluded.
  const fyInvoices = invoices.filter((i) =>
    fyStart && fyEnd ? dateInRange(i.date, fyStart, fyEnd) : true
  );
  const fyExpenses = expenses.filter((e) =>
    fyStart && fyEnd ? dateInRange(e.date, fyStart, fyEnd) : true
  );

  const totalReceivables = fyInvoices
    .filter((i) => i.status !== "Paid")
    .reduce((sum, i) => sum + i.grandTotal, 0);
  const openInvoices = fyInvoices.filter((i) => i.status !== "Paid").length;

  const unpaidExpenses = fyExpenses.filter((e) => e.status === "Pending");
  const totalPayables = unpaidExpenses.reduce((sum, e) => sum + e.amount, 0);

  const totalSales = fyInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const totalExpenses = fyExpenses.reduce((sum, e) => sum + e.amount, 0);

  const hasNoData = fyInvoices.length === 0 && fyExpenses.length === 0;
  const fyLabel = activeFy ? fyShortName(activeFy.name) : "";

  return (
    <div className="space-y-6">
      {/* Active financial year banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            Business Dashboard
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Overview for the active financial year.
          </p>
        </div>
        {fyLabel && (
          <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#fef2f2] text-[#93000b] border border-rose-100">
            {fyLabel}
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Receivables"
          value={inr(totalReceivables)}
          subValue={openInvoices === 0 ? "No open invoices" : `${openInvoices} Open Invoices`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          label="Total Payables"
          value={inr(totalPayables)}
          subValue={unpaidExpenses.length === 0 ? "Nothing pending" : `${unpaidExpenses.length} Pending Bills`}
          icon={<CreditCard className="w-5 h-5" />}
        />
        <StatCard
          label="Total Sales"
          value={inr(totalSales)}
          subValue={fyInvoices.length === 0 ? "No invoices this period" : `${fyInvoices.length} Invoices`}
          icon={<ReceiptText className="w-5 h-5" />}
        />
        <StatCard
          label="Total Expenses"
          value={inr(totalExpenses)}
          subValue={fyExpenses.length === 0 ? "No expenses this period" : `${fyExpenses.length} Expenses`}
          icon={<ShoppingBag className="w-5 h-5" />}
        />
      </div>

      {hasNoData && (
        <EmptyState
          icon="rocket_launch"
          title={fyLabel ? `No transactions for ${fyLabel}` : "Your business ledger is ready"}
          description="Everything is at zero — add your first customer, product, invoice, or expense to start recording real numbers."
          actionLabel="Create your first invoice"
          onAction={() => {
            setOpenModal("add-invoice");
            router.push(ROUTES.invoices);
          }}
        />
      )}

      {/* Quick Actions Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#515f74] mb-3">
          Quick Operational Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => {
              setOpenModal("add-invoice");
              router.push(ROUTES.invoices);
            }}
            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#93000b] hover:bg-[#fef2f2] group transition-all text-left"
          >
            <div>
              <p className="text-xs font-bold text-[#191c1e] group-hover:text-[#93000b]">
                New Invoice
              </p>
              <p className="text-[11px] text-[#515f74]">Draft customer quote</p>
            </div>
            <Plus className="w-4 h-4 text-slate-400 group-hover:text-[#93000b]" />
          </button>

          <button
            onClick={() => setOpenModal("add-expense")}
            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#93000b] hover:bg-[#fef2f2] group transition-all text-left"
          >
            <div>
              <p className="text-xs font-bold text-[#191c1e] group-hover:text-[#93000b]">
                Add Expense
              </p>
              <p className="text-[11px] text-[#515f74]">Record a purchase</p>
            </div>
            <Plus className="w-4 h-4 text-slate-400 group-hover:text-[#93000b]" />
          </button>

          <button
            onClick={() => router.push(ROUTES.customers)}
            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#93000b] hover:bg-[#fef2f2] group transition-all text-left"
          >
            <div>
              <p className="text-xs font-bold text-[#191c1e] group-hover:text-[#93000b]">
                Add Customer
              </p>
              <p className="text-[11px] text-[#515f74]">Build your directory</p>
            </div>
            <Plus className="w-4 h-4 text-slate-400 group-hover:text-[#93000b]" />
          </button>

          <button
            onClick={() => router.push(ROUTES.vehicles)}
            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#93000b] hover:bg-[#fef2f2] group transition-all text-left"
          >
            <div>
              <p className="text-xs font-bold text-[#191c1e] group-hover:text-[#93000b]">
                Manage Fleet
              </p>
              <p className="text-[11px] text-[#515f74]">Vehicles &amp; expenses</p>
            </div>
            <Plus className="w-4 h-4 text-slate-400 group-hover:text-[#93000b]" />
          </button>
        </div>
      </div>

      {/* Recent activity from live data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-[#191c1e]">Recent Invoices</h3>
              <p className="text-xs text-[#515f74]">Latest invoices raised</p>
            </div>
            <button
              onClick={() => router.push(ROUTES.invoices)}
              className="text-xs font-bold text-[#93000b] hover:underline"
            >
              View all
            </button>
          </div>
          {fyInvoices.length === 0 ? (
            <EmptyState
              icon="description"
              title={fyLabel ? `No invoices for ${fyLabel}` : "No invoices yet"}
              description="Create your first invoice to see it listed here."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {fyInvoices.slice(0, 4).map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => setOpenModal("invoice-details")}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#93000b]">{inv.invoiceNumber}</span>
                    </div>
                    <p className="text-sm font-medium text-[#191c1e] mt-0.5">{inv.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#191c1e]">{inr(inv.grandTotal)}</p>
                    <p className="text-xs text-[#515f74]">{inv.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-[#191c1e]">Recent Expenses</h3>
              <p className="text-xs text-[#515f74]">Latest purchases recorded</p>
            </div>
            <button
              onClick={() => router.push(ROUTES.expenses)}
              className="text-xs font-bold text-[#93000b] hover:underline"
            >
              View all
            </button>
          </div>
          {fyExpenses.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              title={fyLabel ? `No expenses for ${fyLabel}` : "No expenses yet"}
              description="Record your first expense to see it listed here."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {fyExpenses.slice(0, 4).map((exp) => (
                <div
                  key={exp.id}
                  onClick={() => setOpenModal("expense-details")}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#93000b]">{exp.expenseNumber}</span>
                    </div>
                    <p className="text-sm font-medium text-[#191c1e] mt-0.5">{exp.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#191c1e]">{inr(exp.amount)}</p>
                    <p className="text-xs text-[#515f74]">{exp.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
