"use client";

import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { ProductStory } from "@/components/auth/ProductStory";
import { Reveal } from "@/components/shared/Reveal";
import { LEGAL_LINKS } from "@/config/legal";
import { Icon, type IconName } from "../ui/Icon";

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/** Real modules of the product — nothing here is aspirational. */
const CAPABILITIES = [
  "Invoices",
  "Customers",
  "Products",
  "Expenses",
  "Estimates",
  "Quotations",
  "Purchase Orders",
  "Team",
];

const WHY: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "grid_view",
    title: "One ledger, not five spreadsheets",
    body: "Customers, products, documents, expenses and reports all read from the same records, so nothing is retyped at month end and nothing drifts out of sync.",
  },
  {
    icon: "percent",
    title: "GST that adds itself up",
    body: "Place of supply, CGST/SGST, the round-off and the exact payable amount are computed when the document is saved — not corrected later by hand.",
  },
  {
    icon: "verified_user",
    title: "Records that stay correct",
    body: "Invoices keep sequential numbers and their financial content is locked. Quotations, estimates and purchase orders move through a status flow the server validates.",
  },
  {
    icon: "handshake",
    title: "Fleet and team included",
    body: "Vehicle-wise fuel, maintenance and toll costs sit next to role-based access, so the workshop and the accounts team work from the same business.",
  },
];

const HOW = [
  {
    title: "Set up the business",
    body: "Company profile, GSTIN, address and financial year, then invite the people who will use it.",
  },
  {
    title: "Load customers and products",
    body: "Build the directory and the catalogue with the HSN codes, units and rates you actually sell at.",
  },
  {
    title: "Quote, order and bill",
    body: "Estimates and quotations for customers, purchase orders for suppliers, then convert the accepted quote into a GST invoice.",
  },
  {
    title: "Watch the money",
    body: "Record payments, log expenses and vehicle costs, and read receivables, payables and margin from the same entries.",
  },
];

/**
 * Trust without invention: every tile describes a control the product actually
 * enforces. No customer counts, no logos, no certifications, no invented praise.
 */
const TRUST: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "domain",
    title: "Business-scoped data",
    body: "Customers, products and documents belong to one business, never a shared pool.",
  },
  {
    icon: "shield",
    title: "Server-side validation",
    body: "Status moves and document rules are enforced on the server, not hidden in the UI.",
  },
  {
    icon: "key",
    title: "Plan-aware features",
    body: "Each capability is checked against the business's plan before it can be used.",
  },
  {
    icon: "picture_as_pdf",
    title: "PDF and print ready",
    body: "Documents generate as PDFs and print cleanly on paper for your records.",
  },
  {
    icon: "groups",
    title: "Role-based team access",
    body: "Control who can view or edit each part of the business, per team member.",
  },
  {
    icon: "lock",
    title: "Behind sign-in",
    body: "Every workspace is authenticated, and what a member sees depends on their role.",
  },
];

/* ------------------------------------------------------------------ */
/* Header scroll state                                                 */
/* ------------------------------------------------------------------ */

function subscribeToScroll(onStoreChange: () => void) {
  window.addEventListener("scroll", onStoreChange, { passive: true });
  return () => window.removeEventListener("scroll", onStoreChange);
}

function getScrolledSnapshot() {
  return window.scrollY > 24;
}

function getServerScrolledSnapshot() {
  return false;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function LandingView() {
  const scrolled = useSyncExternalStore(subscribeToScroll, getScrolledSnapshot, getServerScrolledSnapshot);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* Visitors without JavaScript still see every revealed heading. */}
      <noscript>
        <style>{`.bl-reveal{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <header
        className={`sticky top-0 z-30 border-b bg-background/85 backdrop-blur transition-colors duration-300 ${
          scrolled ? "border-outline-variant/70" : "border-transparent"
        }`}
      >
        <div
          className={`mx-auto flex max-w-7xl items-center justify-between px-4 transition-[height] duration-300 sm:px-6 ${
            scrolled ? "h-14" : "h-16"
          }`}
        >
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
        {/* First viewport: brand on the left, the promise and the action on
            the right. Full width, split ~40/60 on desktop. */}
        <section className="relative overflow-hidden border-b border-outline-variant/40 bg-surface">
          <div aria-hidden="true" className="bl-hero-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,40%)_minmax(0,60%)] lg:gap-14 lg:py-20">
            {/* Left: brand. Centred as a block on desktop — the logo is the
                first thing the eye lands on, so it sits on the column's own
                centre line (horizontally and, via the grid's items-center,
                vertically) instead of hanging off the left edge. */}
            <div className="text-center sm:text-left lg:text-center">
              <div className="bl-enter flex justify-center sm:justify-start lg:justify-center" style={{ animationDelay: "0ms" }}>
                <BizLedgerLogo
                  size="large"
                  className="h-auto w-24 shadow-[0_10px_30px_rgba(15,23,42,0.08)] sm:w-28 lg:w-36"
                />
              </div>

              <h2
                className="bl-enter mt-6 text-2xl font-extrabold leading-[1.15] tracking-tight sm:text-3xl"
                style={{ animationDelay: "80ms" }}
              >
                One place for the work behind your business.
              </h2>

              <p
                className="bl-enter mx-auto mt-3 max-w-sm text-sm leading-relaxed text-outline sm:mx-0 lg:mx-auto"
                style={{ animationDelay: "160ms" }}
              >
                A unified ledger for maker businesses — furniture, fittings, and the trade around
                them.
              </p>

              <ul
                className="bl-enter mt-5 flex flex-wrap justify-center gap-1.5 sm:justify-start lg:justify-center"
                style={{ animationDelay: "240ms" }}
              >
                {CAPABILITIES.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border border-outline-variant/60 bg-surface-container-lowest px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: the promise and the action */}
            <div>
              <span
                className="bl-enter inline-flex items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface-container-lowest px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary"
                style={{ animationDelay: "120ms" }}
              >
                <Icon name="verified" className="text-[15px] text-primary" />
                Built for maker businesses
              </span>

              <h1
                className="bl-enter mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]"
                style={{ animationDelay: "200ms" }}
              >
                Run your business books with{" "}
                <span className="text-primary">one clean ledger.</span>
              </h1>

              <p
                className="bl-enter mt-4 max-w-xl text-sm leading-relaxed text-outline sm:text-base"
                style={{ animationDelay: "280ms" }}
              >
                BizLedger replaces scattered spreadsheets with a single platform for customers,
                quotations, estimates, purchase orders, GST invoicing, expenses, fleet and your
                team.
              </p>

              <div
                className="bl-enter mt-6 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "360ms" }}
              >
                <Link href="/signup">
                  <Button size="lg" icon="rocket_launch">Get Started Free</Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg">I have an account</Button>
                </Link>
              </div>

              <a
                href="#product-tour"
                className="bl-enter mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-opacity duration-200 hover:opacity-70"
                style={{ animationDelay: "440ms" }}
              >
                See how BizLedger works
                <Icon name="south" className="text-[16px]" />
              </a>
            </div>
          </div>
        </section>

        <ProductStory />

        {/* Why BizLedger exists. Anchored as #features for the footer link. */}
        <section id="features" className="border-y border-outline-variant/40 bg-surface-container-lowest">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Why BizLedger</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                The work behind the work, in one place
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-outline sm:text-base">
                Most small businesses run on a folder of spreadsheets, a chat thread and a memory
                that never quite holds the numbers. BizLedger gives that work a home.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {WHY.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon name={item.icon} className="text-[22px]" />
                  </div>
                  <h3 className="mt-4 text-sm font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-outline">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works — the same workflow, now as four concrete steps. */}
        <section className="bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Four steps to a business that books itself
              </h2>
            </Reveal>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HOW.map((step, i) => (
                <li
                  key={step.title}
                  className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5"
                >
                  <span className="text-[11px] font-extrabold tabular-nums text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-sm font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-outline">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust: restrained, and every claim is a real control. */}
        <section className="border-y border-outline-variant/40 bg-surface-container-lowest">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Trust</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Built on controls, not claims
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-outline sm:text-base">
                No invented customer counts, no borrowed logos, no badges we have not earned. These
                are the rules the product enforces on your data.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TRUST.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon name={item.icon} className="text-[20px]" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-outline">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="mx-auto max-w-2xl text-2xl font-extrabold tracking-tight sm:text-3xl">
                Put your business books in one place
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-outline sm:text-base">
                Start with your customers and products, then send your first GST invoice from the
                same records.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link href="/signup">
                  <Button size="lg" icon="rocket_launch">Get Started Free</Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg">I have an account</Button>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/50 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BizLedgerLogo size="compact" />
                <span className="text-sm font-bold tracking-tight">BizLedger</span>
              </div>
              <p className="max-w-xs text-xs leading-relaxed text-outline">
                A unified ledger platform for invoicing, customers, expenses, fleet &amp; team —
                built for maker businesses.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">Product</h4>
              <Link href="#product-tour" className="block text-xs text-outline transition-colors hover:text-on-surface">Product tour</Link>
              <Link href="#features" className="block text-xs text-outline transition-colors hover:text-on-surface">Features</Link>
              <Link href="/pricing" className="block text-xs text-outline transition-colors hover:text-on-surface">Pricing</Link>
            </div>

            {/* Legal */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">Legal</h4>
              {LEGAL_LINKS.map((l) => (
                <Link key={l.slug} href={l.href} className="block text-xs text-outline transition-colors hover:text-on-surface">
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Account */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">Account</h4>
              <Link href="/login" className="block text-xs text-outline transition-colors hover:text-on-surface">Log In</Link>
              <Link href="/signup" className="block text-xs text-outline transition-colors hover:text-on-surface">Create Account</Link>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-outline-variant/30 pt-6 sm:flex-row">
            <p className="text-[11px] text-outline">
              &copy; {new Date().getFullYear()} BizLedger. All rights reserved. v1.0
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
