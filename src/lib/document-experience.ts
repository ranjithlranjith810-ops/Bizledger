// Client-side UX helpers for the four business documents (Invoice, Quotation,
// Estimate, Purchase Order): learning-guide steps, in-form immutable warnings,
// the final "confirm before create" copy, and the seen-state persistence for the
// first-time sample & learn tour.
//
// These are PURE helpers (dependency-free) so they are safe to import from tests
// (tsx/Node, no DOM). State persistence guards on `typeof window` so calling the
// helpers outside a browser is a harmless no-op.

export type DocumentKind = "invoice" | "quotation" | "estimate" | "purchaseOrder";

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "invoice",
  "quotation",
  "estimate",
  "purchaseOrder",
];

/** Singular display name, e.g. "Invoice", "Quotation". */
export function documentKindLabel(kind: DocumentKind): string {
  switch (kind) {
    case "invoice":
      return "Invoice";
    case "quotation":
      return "Quotation";
    case "estimate":
      return "Estimate";
    case "purchaseOrder":
      return "Purchase Order";
  }
}

/** Short document-noun name used inside buttons, e.g. "invoice", "quotation". */
export function documentKindNoun(kind: DocumentKind): string {
  switch (kind) {
    case "invoice":
      return "invoice";
    case "quotation":
      return "quotation";
    case "estimate":
      return "estimate";
    case "purchaseOrder":
      return "purchase order";
  }
}

export interface LearningStep {
  key: string;
  title: string;
  body: string;
}

/** The in-app guide offered around a sample document, step by step. */
export function documentLearningSteps(kind: DocumentKind): LearningStep[] {
  const label = documentKindLabel(kind);
  const base: LearningStep[] = [
    {
      key: "sample",
      title: "This is only a sample",
      body: `The PDF you see is a real ${label} rendered with sample data. It is created with the exact same PDF engine used for your real ${label.toLowerCase()}s, so you can see exactly what one looks like before you create it.`,
    },
    {
      key: "number",
      title: "Numbering & financial year",
      body: "Your document number is generated automatically for the financial year of the date you choose. You never have to remember or type a number yourself.",
    },
    {
      key: "customer",
      title: "Customer, then products",
      body: "Pick a customer first, then search your products to add line items. Prices and GST are calculated for you — you only choose the product, quantity, and price.",
    },
    {
      key: "warning",
      title: "What can be edited later",
      body: "After creation, the customer, dates, financial year and tax settings are locked. For an invoice only the number, product, quantity and price can be edited afterwards, and totals are always recalculated automatically.",
    },
    {
      key: "confirm",
      title: "Final confirmation",
      body: "Saving always opens a confirmation step that summarises your document before anything is created. Nothing is saved until you confirm.",
    },
  ];
  if (kind === "invoice") {
    return base;
  }
  if (kind === "purchaseOrder") {
    return [
      base[0],
      base[1],
      {
        key: "vendor",
        title: "Vendor, then products",
        body: "A purchase order is issued BY you TO a supplier. Enter the vendor details, then add the products and delivery dates. GST is calculated for you.",
      },
      {
        key: "warning",
        title: "Fixed after creation",
        body: "A purchase order is fully frozen after it is created — nothing can be edited later. Its status moves only through the status control (Draft, Sent, Accepted, Received, Cancelled).",
      },
      base[4],
    ];
  }
  // quotation / estimate
  return [
    base[0],
    base[1],
    base[2],
    {
      key: "warning",
      title: "Fixed after creation",
      body: `${label}s are also frozen after creation — none of the fields can be edited later. If a scope changes, create a new ${label.toLowerCase()} rather than editing the old one.`,
    },
    base[4],
  ];
}

export interface ImmutabilityWarningCopy {
  heading: string;
  message: string;
  /** Field labels that may still be changed after the document exists. */
  canEdit: string[];
  /** Field labels that are locked forever once the document exists. */
  cannotEdit: string[];
}

/** Copy for the in-form immutable-fields warning (Warning #1). */
export function documentImmutabilityWarning(
  kind: DocumentKind,
): ImmutabilityWarningCopy {
  switch (kind) {
    case "invoice":
      return {
        heading: "IMPORTANT — REVIEW YOUR INVOICE BEFORE SAVING",
        message:
          "An invoice is created and then frozen. Only the invoice number, product, quantity and price remain editable. Everything else below is locked for good — check the customer, date and totals carefully before you save.",
        canEdit: [
          "Invoice Number",
          "Product",
          "Product Quantity",
          "Product Price",
        ],        cannotEdit: [
          "Customer / Party",
          "Invoice Date",
          "Due Date",
          "Financial Year",
          "Tax settings",
          "Place of supply",
          "HSN/SAC",
          "Unit",
          "Discount",
          "Notes / Terms",
          "Company and customer snapshots",
          "Saved totals",
          "Every other protected invoice field",
        ],
      };
    case "quotation":
      return {
        heading: "IMPORTANT — REVIEW YOUR QUOTATION BEFORE SAVING",
        message:
          "After creation, document details are locked. A quotation cannot be edited — only the legal status workflow can change status. Review everything carefully before saving; to change scope, create a new quotation.",
        canEdit: ["Nothing — status is the only thing that changes"],
        cannotEdit: [
          "Customer details",
          "Quotation date",
          "Products, quantities and prices",
          "Notes and terms",
          "The saved totals",
        ],
      };
    case "estimate":
      return {
        heading: "IMPORTANT — REVIEW YOUR ESTIMATE BEFORE SAVING",
        message:
          "After creation, document details are locked. An estimate cannot be edited — only the legal status workflow can change status. Review everything carefully before saving; to change scope, create a new estimate.",
        canEdit: ["Nothing — status is the only thing that changes"],
        cannotEdit: [
          "Customer details",
          "Estimate date",
          "Scope, products, quantities and prices",
          "Notes and terms",
          "The saved totals",
        ],
      };
    case "purchaseOrder":
      return {
        heading: "IMPORTANT — REVIEW YOUR PURCHASE ORDER BEFORE SAVING",
        message:
          "After creation, document details are locked. A purchase order cannot be edited — only the legal status workflow can change status. Review everything carefully before saving.",
        canEdit: ["Nothing — status is the only thing that changes"],
        cannotEdit: [
          "Vendor details",
          "Products, quantities and prices",
          "Delivery dates and locations",
          "Notes and terms",
          "The saved totals",
        ],
      };
  }
}

export interface CreateConfirmationCopy {
  heading: string;
  message: string;
  /** The IMPORTANT caution block shown above the summary. */
  important: string;
  confirmLabel: string;
}

/** Copy for the final confirmation modal shown before any API call (Warning #2). */
export function documentCreateConfirmation(
  kind: DocumentKind,
): CreateConfirmationCopy {
  switch (kind) {
    case "invoice":
      return {
        heading: "CREATE INVOICE?",
        message:
          "A real, numbered tax invoice will be created in your current financial year.",
        important:
          "IMPORTANT: after creation the customer, dates, financial year and tax settings are locked for good. Only the invoice number, product, quantity and price can change later.",
        confirmLabel: "Yes, Create Invoice",
      };
    case "quotation":
      return {
        heading: "CREATE QUOTATION?",
        message: "A permanent quotation will be created and saved to your records.",
        important:
          "IMPORTANT: a quotation cannot be edited after it is created. The customer, dates, products, prices and terms will be locked for good. Only its status can change.",
        confirmLabel: "Yes, Create Quotation",
      };
    case "estimate":
      return {
        heading: "CREATE ESTIMATE?",
        message: "A permanent estimate will be created and saved to your records.",
        important:
          "IMPORTANT: an estimate cannot be edited after it is created. The customer, scope, dates, products and prices will be locked for good. Only its status can change.",
        confirmLabel: "Yes, Create Estimate",
      };
    case "purchaseOrder":
      return {
        heading: "CREATE PURCHASE ORDER?",
        message:
          "A permanent purchase order will be created and issued to your supplier.",
        important:
          "IMPORTANT: a purchase order cannot be edited after it is created. The vendor, products, prices, delivery dates and terms will be locked for good. Only its status can change.",
        confirmLabel: "Yes, Create Purchase Order",
      };
  }
}

// ---------------------------------------------------------------------------
// First-time "View sample & learn" seen-state (client-side preference).
//
// Two independent, persisted preferences:
//   * seen  — the tour was completed, skipped, or closed at least once; the
//     first-run auto-open is suppressed.
//   * dismissed — the user explicitly picked "Don't show again"; auto-open is
//     suppressed forever (reopening manually from Help stays available).
// Both are localStorage shim-friendly so DB-free tests can drive them.
// ---------------------------------------------------------------------------
export const LEARNING_SEEN_KEY = "bizledger.document-learning.seen";
export const LEARNING_DISMISSED_KEY = "bizledger.document-learning.dismissed";

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readKinds(key: string, store: Pick<Storage, "getItem"> | null): DocumentKind[] {
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (k): k is DocumentKind =>
        typeof k === "string" && (DOCUMENT_KINDS as readonly string[]).includes(k),
    );
  } catch {
    return [];
  }
}

function writeKinds(
  key: string,
  store: Pick<Storage, "setItem"> | null,
  kinds: DocumentKind[],
): void {
  if (!store) return;
  store.setItem(key, JSON.stringify(kinds));
}

/** True when the sample & learn tour for this kind has been seen before. */
export function isLearningSeen(kind: DocumentKind): boolean {
  return readKinds(LEARNING_SEEN_KEY, storage()).includes(kind);
}

/** True when the user picked "Don't show again" for this kind. */
export function isLearningDismissed(kind: DocumentKind): boolean {
  return readKinds(LEARNING_DISMISSED_KEY, storage()).includes(kind);
}

/** True when the tour is fully suppressed for this kind. */
export function isLearningSuppressed(kind: DocumentKind): boolean {
  return isLearningSeen(kind) || isLearningDismissed(kind);
}

/** Persist that the tour for this kind is done (idempotent). */
export function markLearningSeen(kind: DocumentKind): void {
  const store = storage();
  if (!store) return;
  const seen = readKinds(LEARNING_SEEN_KEY, store);
  if (seen.includes(kind)) return;
  writeKinds(LEARNING_SEEN_KEY, store, [...seen, kind]);
}

/** Persist the explicit "Don't show again" preference (idempotent). */
export function markLearningDismissed(kind: DocumentKind): void {
  const store = storage();
  if (!store) return;
  const dismissed = readKinds(LEARNING_DISMISSED_KEY, store);
  if (dismissed.includes(kind)) return;
  writeKinds(LEARNING_DISMISSED_KEY, store, [...dismissed, kind]);
}