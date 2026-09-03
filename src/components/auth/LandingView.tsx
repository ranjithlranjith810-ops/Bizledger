"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LEGAL_LINKS } from "@/config/legal";

const FEATURES = [
  {
    icon: "description",
    title: "Invoicing & Quotations",
    desc: "Create professional GST-ready invoices, quotations, and track payment status in one place.",
  },
  {
    icon: "point_of_sale",
    title: "Customers & Products",
    desc: "Maintain a clean customer directory and a product catalog with pricing and HSN details.",
  },
  {
    icon: "request_quote",
    title: "Expenses & Fleet",
    desc: "Log business and vehicle expenses with fuel, maintenance, and toll breakdowns.",
  },
  {
    icon: "monitoring",
    title: "Reports & Insights",
    desc: "See receivables, payables, and profitability at a glance with live dashboards.",
  },
  {
    icon: "groups",
    title: "Team Access",
    desc: "Invite team members and control who can view or edit each part of your business.",
  },
  {
    icon: "workspace_premium",
    title: "Plan-First Billing",
    desc: "Choose a plan that fits your business and manage your subscription and billing history.",
  },
];

export function LandingView() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-20 border-b border-outline-variant/50 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <BizLedgerLogo size="default" />
            <span className="text-lg font-bold tracking-tight">BizLedger</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="md">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button variant="primary" size="md">Create Account</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <div className="flex justify-center">
            <BizLedgerLogo size="large" />
          </div>
          <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface-container-lowest px-3 py-1 text-xs font-semibold text-secondary">
            <span className="material-symbols-outlined text-[15px]">verified</span>
            Built for furniture manufacturers &amp; sellers
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Run your business books with{" "}
            <span className="text-primary">one clean ledger</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-outline sm:text-lg">
            BizLedger replaces scattered spreadsheets and generic tools with a
            unified platform for invoicing, customers, expenses, fleet, and
            team — designed for maker businesses like yours.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg" icon="rocket_launch">Get Started Free</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">I have an account</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-outline">
            Frontend demo build — your data is stored locally in this browser.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[22px]">{f.icon}</span>
                </div>
                <h3 className="mt-4 text-sm font-bold">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-outline">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/50 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BizLedgerLogo size="compact" />
                <span className="text-sm font-bold tracking-tight">BizLedger</span>
              </div>
              <p className="text-xs text-outline leading-relaxed max-w-xs">
                A unified ledger platform for invoicing, customers, expenses, fleet &amp; team — built for maker businesses.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">Product</h4>
              <Link href="#features" className="block text-xs text-outline hover:text-on-surface transition-colors">Features</Link>
              <Link href="/pricing" className="block text-xs text-outline hover:text-on-surface transition-colors">Pricing</Link>
            </div>

            {/* Legal */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">Legal</h4>
              {LEGAL_LINKS.map((l) => (
                <Link key={l.slug} href={l.href} className="block text-xs text-outline hover:text-on-surface transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Account */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">Account</h4>
              <Link href="/login" className="block text-xs text-outline hover:text-on-surface transition-colors">Log In</Link>
              <Link href="/signup" className="block text-xs text-outline hover:text-on-surface transition-colors">Create Account</Link>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-outline">
              &copy; {new Date().getFullYear()} BizLedger. All rights reserved. v1.0
            </p>
            <p className="text-[11px] text-outline">
              Frontend demo build — your data is stored locally in this browser.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
