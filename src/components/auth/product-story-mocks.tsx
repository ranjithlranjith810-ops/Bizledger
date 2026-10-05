"use client";

import React from "react";
import { Icon, type IconName } from "../ui/Icon";

/**
 * Sample product screens for the landing product story.
 *
 * EVERYTHING IN THIS FILE IS SAMPLE DATA. The business, people, numbers and
 * documents belong to a fictional furniture business used only to illustrate the
 * real surfaces. Nothing here reads or writes data, calls the API, or imports a
 * server module: these are static illustrations, and the frame is labelled
 * "SAMPLE" so no visitor can mistake it for a live account.
 *
 * The field names, status values and GST maths mirror the real product
 * (src/lib/sales-document/status-transitions.ts, src/lib/constants.ts), so the
 * story cannot advertise a capability the app does not have.
 *
 * Containment rules — these keep the story usable at every width:
 *  - `max-w-full` + `overflow-hidden` on every box, so a frame can never push
 *    the page sideways on a narrow phone.
 *  - Text truncates (`min-w-0` + `truncate`) instead of wrapping unpredictably.
 *  - Numeric columns are `shrink-0 tabular-nums` so figures stay aligned.
 */

type Tone = "primary" | "muted" | "ok" | "warn" | "bad";

const CHIP: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  muted: "bg-surface-container text-secondary",
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-rose-100 text-rose-800",
};

const frameChrome =
  "w-full max-w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-[0_18px_50px_rgba(15,23,42,0.10)]";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function MockWindow({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <div className={frameChrome}>
      <div className="flex items-center gap-2 border-b border-outline-variant/40 bg-surface-container-low px-3 py-2">
        <Icon name={icon} className="text-[15px] text-primary" />
        <span className="min-w-0 truncate text-[11px] font-bold tracking-tight text-on-surface">
          {title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary sm:inline">
            Sample
          </span>
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
          </span>
        </span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

/** Label/value pair used in the totals blocks of the document screens. */
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={`truncate text-[10px] ${strong ? "font-bold text-on-surface" : "text-secondary"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 text-[10px] tabular-nums ${
          strong ? "font-extrabold text-primary" : "text-on-surface-variant"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Small metric tile. */
function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "primary" }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-container-low p-2">
      <p className="truncate text-[9px] text-secondary">{label}</p>
      <p
        className={`truncate text-[13px] font-extrabold tabular-nums ${
          tone === "primary" ? "text-primary" : "text-on-surface"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${CHIP[tone]}`}>
      {children}
    </span>
  );
}

/** Column headers for the miniature list/table screens. */
function ColHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`truncate text-[9px] font-bold uppercase tracking-wider text-secondary ${className}`}>
      {children}
    </span>
  );
}

/** One row of a miniature list: leading name, optional meta, trailing value. */
function ListRow({
  name,
  meta,
  trailing,
  chip,
}: {
  name: string;
  meta?: string;
  trailing: string;
  chip?: { label: string; tone: Tone };
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-semibold text-on-surface">{name}</span>
        {meta ? <span className="block truncate text-[9px] text-secondary">{meta}</span> : null}
      </span>
      {chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
      <span className="shrink-0 text-[10px] font-bold tabular-nums text-on-surface">{trailing}</span>
    </div>
  );
}

/** Proportional bar used by the expense and margin screens. */
function Bar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "muted" }) {
  return (
    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
      <div
        className={`h-full rounded-full ${tone === "primary" ? "bg-primary" : "bg-on-surface-variant/50"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ActionRow({ items }: { items: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={item}
          className={
            i === 0
              ? "rounded-md bg-primary px-2 py-1 text-[9px] font-bold text-white"
              : "rounded-md border border-outline-variant/60 px-2 py-1 text-[9px] font-semibold text-secondary"
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/** The seller block every document screen shares. */
function SellerBlock({ invoiceNo }: { invoiceNo: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold text-on-surface">Iswayam Traders</p>
        <p className="truncate text-[9px] text-secondary">GSTIN 33AABCI1234A1Z5 · Coimbatore</p>
      </div>
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
        {invoiceNo}
      </span>
    </div>
  );
}

/** The three-column line-item grid shared by the document screens. */
function LineItems({ items }: { items: readonly (readonly [string, string, string, string])[] }) {
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-baseline justify-between gap-2 border-b border-outline-variant/40 pb-1">
        <ColHead>Item</ColHead>
        <span className="flex shrink-0 gap-4">
          <ColHead>Qty</ColHead>
          <ColHead>Rate</ColHead>
          <ColHead>Amount</ColHead>
        </span>
      </div>
      {items.map(([name, qty, rate, amount]) => (
        <div key={name} className="flex items-baseline justify-between gap-2 py-0.5">
          <span className="min-w-0 truncate text-[10px] text-on-surface-variant">{name}</span>
          <span className="flex shrink-0 gap-4 text-[10px] tabular-nums text-on-surface">
            <span>{qty}</span>
            <span>{rate}</span>
            <span>{amount}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Customers                                                        */
/* ------------------------------------------------------------------ */

function CustomersMock() {
  return (
    <MockWindow title="Customers" icon="groups">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Customers" value="148" />
        <Stat label="With balance" value="61" />
        <Stat label="Outstanding" value="₹2.97L" tone="primary" />
      </div>

      <div className="mt-3 space-y-1.5">
        <ListRow name="Anand Enterprises" meta="98422 10394" trailing="₹64,200" />
        <ListRow name="Sri Furniture Mart" meta="₹1,18,500 · 31 days" trailing="Overdue" chip={{ label: "31d", tone: "bad" }} />
        <ListRow name="Kumar Interiors" meta="Last billed 4 days ago" trailing="₹27,900" />
      </div>

      <ActionRow items={["Add customer", "Send reminder", "Statement"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Products                                                         */
/* ------------------------------------------------------------------ */

function ProductsMock() {
  return (
    <MockWindow title="Products & Services" icon="inventory_2">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Products" value="212" />
        <Stat label="Low stock" value="7" />
        <Stat label="Categories" value="6" />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 border-b border-outline-variant/40 pb-1">
          <ColHead>Item</ColHead>
          <span className="flex shrink-0 gap-4">
            <ColHead>HSN</ColHead>
            <ColHead>Rate</ColHead>
          </span>
        </div>
        {[
          ["Teakwood Dining Table", "4421", "18,500"],
          ["Fabric Dining Chair", "9401", "4,250"],
          ["Cabinet Hardware (set)", "8302", "6,800"],
          ["Six-Seater Sofa", "9403", "62,000"],
        ].map(([name, hsn, rate]) => (
          <div key={name} className="flex items-baseline justify-between gap-2 py-0.5">
            <span className="min-w-0 truncate text-[10px] text-on-surface-variant">{name}</span>
            <span className="flex shrink-0 gap-4 text-[10px] tabular-nums text-on-surface">
              <span>{hsn}</span>
              <span>{rate}</span>
            </span>
          </div>
        ))}
      </div>

      <ActionRow items={["Add product", "Edit rate", "HSN lookup"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Estimates                                                        */
/* ------------------------------------------------------------------ */

function EstimatesMock() {
  return (
    <MockWindow title="Estimate EST-0091" icon="edit_note">
      <SellerBlock invoiceNo="EST-0091" />
      <p className="mt-1.5 truncate text-[9px] text-secondary">To: Kumar Interiors · valid for 15 days</p>

      <LineItems
        items={[
          ["Teakwood Dining Table", "2", "18,500", "37,000"],
          ["Fabric Dining Chair", "8", "4,250", "34,000"],
        ]}
      />

      <div className="mt-3 ml-auto w-3/5 min-w-32 space-y-0.5 border-t border-outline-variant/40 pt-1.5">
        <Line label="Estimate value" value="71,000" />
        <Line label="GST 18%" value="12,780" />
        <Line label="Total payable" value="83,780" strong />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip tone="muted">Draft</Chip>
        <Chip tone="warn">Sent</Chip>
        <Chip tone="ok">Accepted</Chip>
      </div>

      <ActionRow items={["Convert to quotation", "Download PDF"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Quotations                                                       */
/* ------------------------------------------------------------------ */

function QuotationsMock() {
  return (
    <MockWindow title="Quotation QTN-0134" icon="request_quote">
      <SellerBlock invoiceNo="QTN-0134" />
      <p className="mt-1.5 truncate text-[9px] text-secondary">
        To: Sri Furniture Mart · sent 2 days ago
      </p>

      <LineItems
        items={[
          ["Six-Seater Sofa", "2", "62,000", "1,24,000"],
          ["Cabinet Hardware (set)", "4", "6,800", "27,200"],
        ]}
      />

      <div className="mt-3 ml-auto w-3/5 min-w-32 space-y-0.5 border-t border-outline-variant/40 pt-1.5">
        <Line label="Taxable value" value="1,51,200" />
        <Line label="CGST 9%" value="13,608" />
        <Line label="SGST 9%" value="13,608" />
        <Line label="Quoted total" value="1,78,416" strong />
      </div>

      <ActionRow items={["Convert to invoice", "Send on WhatsApp", "Download PDF"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Purchase Orders                                                  */
/* ------------------------------------------------------------------ */

function PurchaseOrdersMock() {
  return (
    <MockWindow title="Purchase Orders" icon="local_shipping">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Open POs" value="9" />
        <Stat label="Committed" value="₹8.4L" tone="primary" />
      </div>

      <div className="mt-3 space-y-1.5">
        <ListRow
          name="PO-0318 · Teakwood Depot"
          meta="12 logs · expected 4 Oct"
          trailing="₹1,18,000"
          chip={{ label: "Sent", tone: "warn" }}
        />
        <ListRow
          name="PO-0317 · Upholstery Fab"
          meta="40 m · partially received"
          trailing="₹36,400"
          chip={{ label: "Part. received", tone: "primary" }}
        />
        <ListRow
          name="PO-0316 · Hardware Traders"
          meta="Closed"
          trailing="₹22,100"
          chip={{ label: "Received", tone: "ok" }}
        />
      </div>

      <ActionRow items={["New purchase order", "Mark received", "Supplier ledger"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Invoices                                                         */
/* ------------------------------------------------------------------ */

function InvoicesMock() {
  return (
    <MockWindow title="Tax Invoice" icon="description">
      <SellerBlock invoiceNo="INV-00412" />

      <LineItems
        items={[
          ["Teakwood Dining Table", "2", "18,500", "37,000"],
          ["Fabric Dining Chair", "8", "4,250", "34,000"],
          ["Cabinet Hardware (set)", "1", "6,800", "6,800"],
        ]}
      />

      <div className="mt-3 ml-auto w-3/5 min-w-32 space-y-0.5 border-t border-outline-variant/40 pt-1.5">
        <Line label="Taxable value" value="77,800" />
        <Line label="CGST 9%" value="7,002" />
        <Line label="SGST 9%" value="7,002" />
        <Line label="Round off" value="−4" />
        <Line label="Amount due" value="91,800" strong />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip tone="muted">Draft</Chip>
        <Chip tone="warn">Pending</Chip>
        <Chip tone="bad">Overdue</Chip>
        <Chip tone="ok">Paid</Chip>
      </div>

      <ActionRow items={["Download PDF", "WhatsApp", "Record payment"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Expenses & GST                                                   */
/* ------------------------------------------------------------------ */

function ExpensesMock() {
  const heads = [
    ["Raw material", 42],
    ["Labour", 24],
    ["Fuel & toll", 14],
    ["Rent", 11],
  ] as const;

  return (
    <MockWindow title="Expenses · March" icon="payments">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total spend" value="₹4,12,900" />
        <Stat label="GSTR-3B sales" value="₹18,64,200" />
      </div>

      <div className="mt-3 space-y-1.5">
        {heads.map(([name, pct]) => (
          <div key={name}>
            <div className="flex items-baseline justify-between text-[9px]">
              <span className="min-w-0 truncate text-on-surface-variant">{name}</span>
              <span className="shrink-0 tabular-nums text-secondary">{pct}%</span>
            </div>
            <Bar pct={pct} />
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-0.5 border-t border-outline-variant/40 pt-2">
        <Line label="Tata Ace · TN 39 · fastag" value="2,450" />
        <Line label="Teak wood · 12 logs" value="1,18,000" />
        <Line label="Workshop rent" value="35,000" />
      </div>

      <ActionRow items={["Add expense", "GSTR summary", "Attach receipt"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Team & Business                                                  */
/* ------------------------------------------------------------------ */

function TeamBusinessMock() {
  const bars = [42, 58, 71, 54, 83, 66, 92];
  const months = ["S", "O", "N", "D", "J", "F", "M"];

  return (
    <MockWindow title="Business Overview" icon="monitoring">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Revenue" value="₹18.6L" />
        <Stat label="Expenses" value="₹14.9L" />
        <Stat label="Net profit" value="₹3.7L" tone="primary" />
      </div>

      <div className="mt-3 flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <div key={months[i]} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t bg-primary/80" style={{ height: `${h}%` }} />
            <span className="text-[8px] text-secondary">{months[i]}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-outline-variant/40 pt-2">
        <ListRow name="Ravi · Sales" meta="Can edit invoices" trailing="Admin" chip={{ label: "Active", tone: "ok" }} />
        <ListRow name="Meena · Accounts" meta="Expenses & reports" trailing="Editor" chip={{ label: "Active", tone: "ok" }} />
        <ListRow name="Suresh · Workshop" meta="Products only" trailing="Staff" chip={{ label: "View", tone: "muted" }} />
      </div>

      <ActionRow items={["Invite member", "Receivables", "Export report"]} />
    </MockWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Stage id -> screen. The ids match `STEPS` in ProductStory.tsx, which is the
 * single source of truth for the story order.
 */
export const MOCKS: Record<string, React.FC> = {
  customers: CustomersMock,
  products: ProductsMock,
  estimates: EstimatesMock,
  quotations: QuotationsMock,
  purchaseOrders: PurchaseOrdersMock,
  invoices: InvoicesMock,
  expenses: ExpensesMock,
  teamBusiness: TeamBusinessMock,
};
