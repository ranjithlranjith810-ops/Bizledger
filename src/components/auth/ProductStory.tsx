"use client";

import React, { useEffect, useRef, useState } from "react";
import { MOCKS } from "@/components/auth/product-story-mocks";
import { Reveal } from "@/components/shared/Reveal";
import { Icon, type IconName } from "../ui/Icon";

/**
 * Scroll-driven product story.
 *
 * A sticky product frame shows a different BizLedger screen for every stage; an
 * IntersectionObserver promotes the stage nearest the middle of the viewport to
 * "active". The stage list mutes the inactive stages, which is what produces
 * the scroll-linked feel without hijacking scroll position.
 *
 * Motion rules:
 *  - All motion is CSS transition based, so the global
 *    `prefers-reduced-motion: reduce` rule in globals.css neutralises it, and
 *    the observer is not even attached when reduced motion is requested.
 *  - The first stage is active in the initial state, so the server-rendered
 *    markup and the first client render agree, and every stage's copy is MUTED
 *    (never hidden) — a missing/failed observer can never cost a reader
 *    content, and nothing flashes in after hydration.
 *  - Transitions stay in the 350-650ms band and only ever animate opacity and
 *    small transforms, so the product UI never appears to bounce or shake.
 */

interface StoryStep {
  id: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
}

const STEPS: StoryStep[] = [
  {
    id: "customers",
    icon: "groups",
    eyebrow: "Customers",
    title: "One directory, with the money attached",
    body: "Every customer keeps their contact details, GSTIN, outstanding balance and full billing history in the same record, so a follow-up call starts with the balance already in front of you.",
    bullets: [
      "Outstanding balance per customer",
      "Ageing buckets for overdue money",
      "Full document history in one place",
    ],
  },
  {
    id: "products",
    icon: "inventory_2",
    eyebrow: "Products",
    title: "A catalogue that already speaks GST",
    body: "Store what you sell once — with HSN code, unit, tax rate and selling price — and every quotation, estimate, purchase order and invoice picks it up instead of being retyped.",
    bullets: [
      "HSN, unit and tax rate per product",
      "Selling rate reused on every document",
      "Low-stock visibility on the catalogue",
    ],
  },
  {
    id: "estimates",
    icon: "edit_note",
    eyebrow: "Estimates",
    title: "Quote the job before anyone commits",
    body: "Send a priced estimate for work that is not agreed yet, track it through Draft, Sent, Accepted, Rejected or Expired, then convert the accepted estimate into a quotation without re-entering a line.",
    bullets: [
      "Draft \u2192 Sent \u2192 Accepted or Rejected",
      "Convert to quotation in one click",
      "Share a branded PDF or WhatsApp it",
    ],
  },
  {
    id: "quotations",
    icon: "request_quote",
    eyebrow: "Quotations",
    title: "The accepted quote becomes the invoice",
    body: "A quotation is the commercial promise. When the customer accepts, BizLedger carries the exact lines, rates and GST across to the invoice, so what was agreed is what gets billed.",
    bullets: [
      "Same lines, rates and GST as the quote",
      "Expiry tracked on every quotation",
      "Accepted quotation converts to invoice",
    ],
  },
  {
    id: "purchaseOrders",
    icon: "local_shipping",
    eyebrow: "Purchase Orders",
    title: "Order material and close the loop",
    body: "Raise a purchase order against a supplier, move it from Draft to Sent and on to Accepted, Partially Received, Received or Cancelled, and see committed spend before the bill arrives.",
    bullets: [
      "Supplier, item, quantity and expected date",
      "Received status per purchase order",
      "Committed spend visible up front",
    ],
  },
  {
    id: "invoices",
    icon: "description",
    eyebrow: "Invoices",
    title: "Bill in under a minute, correctly every time",
    body: "Pick a customer, add line items with HSN and GST-inclusive pricing, and BizLedger fills in CGST/SGST, the round-off and the exact payable amount. The tax invoice is generated in the format your accountant expects.",
    bullets: [
      "GST computed from seller and place of supply",
      "Sequential invoice numbers, never reused",
      "Share on WhatsApp or download a real PDF",
    ],
  },
  {
    id: "expenses",
    icon: "payments",
    eyebrow: "Expenses & GST",
    title: "Every rupee of spend, filed and reconciled",
    body: "Log business and vehicle expenses with fuel, maintenance, fastag and toll breakdowns. Monthly GSTR summaries are built from real entries, so nothing is retyped at filing time.",
    bullets: [
      "Vehicle-wise cost per trip",
      "Monthly GSTR-1 and 3B ready totals",
      "Receipts attached to the expense line",
    ],
  },
  {
    id: "teamBusiness",
    icon: "monitoring",
    eyebrow: "Team & Business",
    title: "The people doing the work, and the numbers",
    body: "Invite team members with roles that limit who can edit which part of the business, and read receivables, payables and margin from the same entries the documents were built on.",
    bullets: [
      "Role-based access per team member",
      "Receivables, payables and margin",
      "Excel and PDF export for your CA",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export function ProductStory() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);
  // Set while a stage control drives the scroll, so the scroll-driven observer
  // does not fight the control for the active stage.
  const programmaticScroll = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // No scroll-linked motion: keep the first stage lit and stop observing.
      return;
    }

    const nodes = stepRefs.current.filter((n): n is HTMLLIElement => Boolean(n));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        // A stage control owns the active stage until its scroll settles. The
        // observer only recomputes when an element crosses its band, so during
        // a smooth programmatic scroll it can evaluate MID-FLIGHT, pick a
        // neighbour, and then never fire again once the target is centred —
        // which made "Next" jump several stages. Clearing this flag late is
        // safe: any callback after the scroll settles re-reads live rects.
        if (programmaticScroll.current) return;
        // Re-evaluate across EVERY stage rather than only the entries that just
        // changed, so a fast scroll can never leave a stale stage active. The
        // band is biased to the middle of the viewport, which is where a reader
        // is actually looking.
        const readingLine = window.innerHeight * 0.5;
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;

        nodes.forEach((node, index) => {
          const rect = node.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const distance = Math.abs(center - readingLine);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });

        setActive(bestIndex);
      },
      {
        rootMargin: "-40% 0px -40% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  const ActiveMock = MOCKS[STEPS[active].id] ?? MOCKS.invoices;
  const progress = (active + 1) / STEPS.length;
  const stageNumber = String(active + 1).padStart(2, "0");

  function goToStage(index: number) {
    const node = stepRefs.current[index];
    if (!node) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // The control names the stage, so the stage is set directly and the preview
    // swaps immediately. Leaving it to the observer made the control's result
    // depend on scroll timing, and out-of-range indices are ignored rather than
    // clamped, so the button stays disabled at the boundaries.
    setActive(index);
    programmaticScroll.current = true;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    if (reduce) {
      programmaticScroll.current = false;
    } else {
      window.setTimeout(() => {
        programmaticScroll.current = false;
      }, 700);
    }
  }

  return (
    <section
      id="product-tour"
      aria-labelledby="product-tour-heading"
      className="bl-story mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:pt-24 sm:pb-20"
    >
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">The product</p>
        <h2 id="product-tour-heading" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Everything a maker business needs, in one ledger
        </h2>
        <p className="mt-3 text-sm text-outline sm:text-base">
          Eight stages, in the order the work actually happens. Each one shows the screen you
          would really be using.
        </p>
      </Reveal>

      {/* Stage rail: a progress rail you can also use to jump. */}
      <Reveal className="mt-8" delay={60}>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
          <div
            className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>

        <nav aria-label="Product tour stages" className="mt-4 flex flex-wrap justify-center gap-1.5">
          {STEPS.map((step, i) => {
            const isActive = i === active;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStage(i)}
                aria-current={isActive ? "step" : undefined}
                data-active={isActive}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300"
                style={{
                  borderColor: isActive ? "rgb(149 0 42)" : "rgb(227 189 191)",
                  backgroundColor: isActive ? "rgba(149,0,42,0.08)" : "transparent",
                  color: isActive ? "rgb(149 0 42)" : "rgb(86 94 116)",
                }}
              >
                <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="hidden sm:inline">{step.eyebrow}</span>
              </button>
            );
          })}
        </nav>
      </Reveal>

      <div className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)] lg:gap-12">
        {/* Stage list */}
        <ol className="space-y-10 sm:space-y-16">
          {STEPS.map((step, i) => (
            <li
              key={step.id}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              data-step-index={i}
              data-active={i === active}
              className="bl-story-step"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name={step.icon} className="text-[18px]" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                  {stageNumberFor(i)} &middot; {step.eyebrow}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-extrabold leading-snug tracking-tight sm:text-xl">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-outline">{step.body}</p>
              <ul className="mt-3 space-y-1.5">
                {step.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-[13px] text-on-surface-variant">
                    <Icon name="check_circle" className="mt-px text-[15px] text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {/* Mobile: the screen rides with its own stage. */}
              <div className="mt-4 lg:hidden">
                <StageMock id={step.id} />
              </div>
            </li>
          ))}
        </ol>

        {/* Desktop: one sticky frame that swaps screens as you scroll. */}
        <div className="hidden lg:block">
          {/* `min-h` (never a fixed `h`) so the canvas fills the sticky viewport
              and grows the frame toward its bottom edge, while still expanding
              rather than clipping if a stage screen is taller than the viewport. */}
          <div className="sticky top-20 flex min-h-[calc(100dvh-8rem)] flex-col">
            <div className="bl-stage-canvas flex min-h-0 flex-1 items-center rounded-3xl border border-[#e6e9ee] px-4 py-6 sm:px-6 sm:py-8">
              <div aria-live="polite" className="bl-stage-frame w-full max-w-full">
                <ActiveMock />
              </div>
            </div>

            {/* Attached directly beneath the canvas so the controls read as part
                of the preview panel rather than trailing content. */}
            <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goToStage(active - 1)}
                disabled={active === 0}
                aria-label="Previous stage"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest text-primary transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:border-outline-variant/50 disabled:text-outline-variant/60 disabled:hover:bg-surface-container-lowest"
              >
                <Icon name="chevron_left" className="text-[20px]" aria-hidden="true" />
              </button>

              <span className="shrink-0 text-[11px] font-bold tabular-nums text-primary">
                {stageNumber} / {String(STEPS.length).padStart(2, "0")}
              </span>

              <button
                type="button"
                onClick={() => goToStage(active + 1)}
                disabled={active === STEPS.length - 1}
                aria-label="Next stage"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest text-primary transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:border-outline-variant/50 disabled:text-outline-variant/60 disabled:hover:bg-surface-container-lowest"
              >
                <Icon name="chevron_right" className="text-[20px]" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function stageNumberFor(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** Small helper so the mobile per-stage screen is a stable component identity. */
function StageMock({ id }: { id: string }) {
  const Mock = MOCKS[id] ?? MOCKS.invoices;
  return <Mock />;
}
