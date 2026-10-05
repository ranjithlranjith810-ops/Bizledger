"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants";
import { dateInRange, fyShortName } from "@/lib/utils";
import { Icon } from "../../components/ui/Icon";
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
  const {
    setOpenModal,
    invoices,
    expenses,
    getActiveFinancialYear,
    domainHydration,
    retryDomains,
  } = useApp();
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

  // Hydration lifecycle (invoices + expenses are the two domains this page
  // depends on). A failed request must never read as a successful empty
  // account: the empty-state below only renders when the domain is "ready"
  // AND the result is genuinely empty.
  const invoiceHydration = domainHydration.invoices;
  const expenseHydration = domainHydration.expenses;

  const invoicesLoading = invoiceHydration === "loading";
  const expensesLoading = expenseHydration === "loading";
  const invoicesError = invoiceHydration === "error";
  const expensesError = expenseHydration === "error";
  const loading = invoicesLoading || expensesLoading;

  const anyError = invoicesError || expensesError;
  const failedLabel = [invoicesError && "Invoices", expensesError && "Expenses"]
    .filter(Boolean)
    .join(" and ");

  const genuinelyEmpty =
    invoiceHydration === "ready" &&
    expenseHydration === "ready" &&
    fyInvoices.length === 0 &&
    fyExpenses.length === 0;

  const hasInvoices = fyInvoices.length > 0;
  const hasExpenses = fyExpenses.length > 0;

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

      {loading ? (
        /* Polished loading state — muted KPI placeholders + the project's
           standard Material spinner, so the page never flashes blank. */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, n) => (
              <div
                key={n}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="w-24 h-3 rounded bg-slate-100" />
                <div className="mt-3 h-7 w-28 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-20 rounded bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 py-10 bg-white rounded-xl border border-slate-200 shadow-xs">
            <Icon name="progress_activity" className="animate-spin text-[22px] text-[#93000b]" />
            <p className="text-xs font-semibold text-[#515f74]">
              Loading your financial dashboard…
            </p>
          </div>
        </>
      ) : (
        <>
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

          {/* Non-destructive error: never replaces existing (last-known) data. */}
          {anyError && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-rose-100 bg-[#fef2f2]">
              <div className="flex items-center gap-3 min-w-0">
                <Icon name="cloud_off" className="text-[20px] text-[#93000b] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#93000b]">
                    Couldn&apos;t refresh {failedLabel}
                  </p>
                  <p className="text-[11px] text-[#93000b]">
                    Showing the last known figures — your existing data is
                    safe.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon="refresh"
                onClick={retryDomains}
                className="shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Only a genuinely empty, successfully-hydrated account shows this. */}
          {genuinelyEmpty && (
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
        </>
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
      {!loading && (
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
            {invoicesError && !hasInvoices ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <Icon name="cloud_off" className="text-[28px] text-[#93000b] mb-2" />
                <h3 className="text-sm font-semibold text-[#191c1e] mb-1">
                  Couldn&apos;t load invoices
                </h3>
                <p className="text-xs text-[#515f74] mb-4 max-w-sm leading-relaxed">
                  The invoice list couldn&apos;t be refreshed. Your data is
                  safe — retry when you&apos;re ready.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  icon="refresh"
                  onClick={retryDomains}
                >
                  Retry
                </Button>
              </div>
            ) : fyInvoices.length === 0 ? (
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
            {expensesError && !hasExpenses ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <Icon name="cloud_off" className="text-[28px] text-[#93000b] mb-2" />
                <h3 className="text-sm font-semibold text-[#191c1e] mb-1">
                  Couldn&apos;t load expenses
                </h3>
                <p className="text-xs text-[#515f74] mb-4 max-w-sm leading-relaxed">
                  The expense list couldn&apos;t be refreshed. Your data is
                  safe — retry when you&apos;re ready.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  icon="refresh"
                  onClick={retryDomains}
                >
                  Retry
                </Button>
              </div>
            ) : fyExpenses.length === 0 ? (
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
      )}
    </div>
  );
}