// HELP CENTER CONTENT — the authoritative, per-document beginner guide shown on
// the in-app Help page (/help).
//
// Dependency-free pure data (plus a lookup helper) so it is safe to import from
// DB-free tests and from the client page. The editability wording here is the
// SAME product rule enforced by the create forms, the learning tour, and the
// server: an invoice may only have its number / product / quantity / price
// changed after creation; quotations, estimates and purchase orders are frozen
// apart from their legal status workflow.

import type { IconName } from "@/components/ui/Icon";
import {
  DOCUMENT_KINDS,
  DocumentKind,
  documentKindLabel,
  documentKindNoun,
} from "@/lib/document-experience";
import {
  INVOICE_STATUS_TRANSITIONS,
  PURCHASE_ORDER_STATUS_TRANSITIONS,
  QUOTATION_STATUS_TRANSITIONS,
  ESTIMATE_STATUS_TRANSITIONS,
} from "@/lib/sales-document/status-transitions";

export interface DocumentHelpGuide {
  kind: DocumentKind;
  /** Route of the list page where this document is created. */
  route: string;
  icon: IconName;
  /** One-line "what is this document" summary. */
  whatItIs: string;
  /** Numbered, beginner-safe creation steps. */
  howToCreate: string[];
  /** Quality advice that makes the document look professional. */
  howToCreateWell: string[];
  /** What may still be changed after the document exists. */
  canEditAfterCreation: string[];
  /** What is locked forever once the document exists. */
  cannotEditAfterCreation: string[];
  /** The legal status path, in order. */
  statusFlow: string[];
  /** What the app does once the document is created. */
  afterCreation: string[];
  /** How to view / download / print it. */
  viewDownloadPrint: string[];
}

const STATUS_MATRICES: Record<DocumentKind, Record<string, readonly string[]>> = {
  invoice: INVOICE_STATUS_TRANSITIONS,
  quotation: QUOTATION_STATUS_TRANSITIONS,
  estimate: ESTIMATE_STATUS_TRANSITIONS,
  purchaseOrder: PURCHASE_ORDER_STATUS_TRANSITIONS,
};

const STATUS_START: Record<DocumentKind, string> = {
  invoice: "Draft",
  quotation: "Draft",
  estimate: "Draft",
  purchaseOrder: "Draft",
};

/**
 * The legal status path for a kind, e.g. ["Draft", "Pending", "Overdue", "Paid"].
 * Derived from the same transition matrix the server validates against, so the
 * Help page can never describe a status move the app would reject.
 */
export function documentStatusFlow(kind: DocumentKind): string[] {
  const matrix = STATUS_MATRICES[kind] ?? {};
  const flow: string[] = [STATUS_START[kind]];
  const seen = new Set(flow);
  // Follow the first forward edge at each hop so the happy path is described in
  // order; alternative branches (Cancelled / Rejected / Expired) are appended.
  let cursor = STATUS_START[kind];
  while (true) {
    const next = (matrix[cursor] ?? [])[0];
    if (!next || seen.has(next)) break;
    flow.push(next);
    seen.add(next);
    cursor = next;
  }
  for (const status of Object.keys(matrix)) {
    if (!seen.has(status)) flow.push(status);
  }
  return flow;
}

const INVOICE_GUIDE: DocumentHelpGuide = {
  kind: "invoice",
  route: "/invoices",
  icon: "description",
  whatItIs:
    "A tax invoice is the bill you raise for goods or services you have supplied. It is a legal document: once it is created it carries a real invoice number for your financial year, and it is what your customer uses to pay you.",
  howToCreate: [
    "Open Invoices and choose New Invoice.",
    "Select the customer you are billing. The customer's saved GST details are filled in for you.",
    "Search for each product you are selling and add it as a line item. Set the quantity and, if needed, the price.",
    "Check the invoice date — the financial year is derived from it automatically, and it cannot be changed later.",
    "Review the tax summary on the right: taxable value, CGST/SGST (within your state) or IGST (other states), then the total.",
    "Choose Save & Generate Invoice, then confirm in the review dialog. Nothing is created until you confirm.",
  ],
  howToCreateWell: [
    "Add a short, clear description on every line so the customer understands what they are paying for.",
    "Keep the HSN/SAC code correct for your product — it is a tax requirement, not just a label.",
    "Set a payment term that matches your working capital, and adjust the default terms in Company Profile if you need your own wording.",
    "Add notes for delivery, payment details, or a thank-you line — they are printed on the PDF.",
    "Raise the invoice as soon as the goods are dispatched so the financial year and numbering stay accurate.",
  ],
  canEditAfterCreation: [
    "The invoice number.",
    "The product on a line.",
    "The quantity on a line.",
    "The price on a line. Totals and tax are always recalculated for you when you save.",
  ],
  cannotEditAfterCreation: [
    "The customer.",
    "The invoice date and due date.",
    "The financial year.",
    "Tax settings such as the place of supply, GSTIN on record, and the tax split.",
    "The product's HSN/SAC code, unit, discount, and line descriptions.",
    "Notes, terms, and the created totals.",
  ],
  statusFlow: documentStatusFlow("invoice"),
  afterCreation: [
    "A permanent, numbered invoice is stored against the financial year of its date.",
    "The status moves forward only — it can never go back to Draft.",
    "Paid, Overdue and Cancelled are final; once a document reaches one of them its history is closed.",
    "If something is genuinely wrong, raise a corrected document rather than trying to rewrite the old one.",
  ],
  viewDownloadPrint: [
    "Open the invoice from the list to see every detail.",
    "Use View PDF for the exact print-ready document your customer receives.",
    "Print or save the PDF from the browser's normal print dialog.",
  ],
};

const QUOTATION_GUIDE: DocumentHelpGuide = {
  kind: "quotation",
  route: "/quotations",
  icon: "request_quote",
  whatItIs:
    "A quotation is a formal price offer you send to a customer before you invoice them. It records what you would supply and at what price, and it is a permanent record of that offer.",
  howToCreate: [
    "Open Quotations and choose New Quotation.",
    "Select the customer you are quoting for.",
    "Add the products or services the quotation covers, with quantity and price.",
    "Review the totals and any notes you want printed on the document.",
    "Choose Save & Generate Quotation, then confirm in the review dialog. Nothing is created until you confirm.",
  ],
  howToCreateWell: [
    "Keep the line descriptions specific so the offer can be understood months later.",
    "Set notes with a clear validity period so the customer knows how long the price holds.",
    "Mention what is included and what is not — scope changes are the most common source of disputes.",
    "Use the customer's own saved details so the printed quotation matches your other documents.",
  ],
  canEditAfterCreation: [
    "Only the status. A quotation moves forward through its status workflow and never back.",
  ],
  cannotEditAfterCreation: [
    "The customer.",
    "The dates.",
    "The products, quantities, and prices.",
    "The notes and terms.",
    "The created totals.",
  ],
  statusFlow: documentStatusFlow("quotation"),
  afterCreation: [
    "A permanent quotation is stored against your records.",
    "The status moves forward only — it can never go back to Draft.",
    "Accepted, Rejected and Expired are final outcomes.",
    "If the scope or price changes, create a new quotation instead of editing the old one.",
  ],
  viewDownloadPrint: [
    "Open the quotation from the list to see every detail.",
    "Use View PDF for the print-ready document to send to the customer.",
    "Print or save the PDF from the browser's normal print dialog.",
  ],
};

const ESTIMATE_GUIDE: DocumentHelpGuide = {
  kind: "estimate",
  route: "/estimates",
  icon: "insights",
  whatItIs:
    "An estimate records the scope and expected cost of work before it starts. It is the document you use to agree a price with a customer, and it stays a permanent record of that agreement.",
  howToCreate: [
    "Open Estimates and choose New Estimate.",
    "Select the customer.",
    "Add the work or products the estimate covers, with quantity and price.",
    "Review the totals and add any notes about scope or assumptions.",
    "Choose Save & Generate Estimate, then confirm in the review dialog. Nothing is created until you confirm.",
  ],
  howToCreateWell: [
    "Write the scope in the notes so both sides agree on what the estimate includes.",
    "List assumptions and exclusions — this is what protects you later.",
    "Keep quantities and prices specific rather than a single lump sum.",
    "Set a validity note if the estimate is time-sensitive.",
  ],
  canEditAfterCreation: [
    "Only the status. An estimate moves forward through its status workflow and never back.",
  ],
  cannotEditAfterCreation: [
    "The customer.",
    "The dates.",
    "The scope, products, quantities, and prices.",
    "The notes and terms.",
    "The created totals.",
  ],
  statusFlow: documentStatusFlow("estimate"),
  afterCreation: [
    "A permanent estimate is stored against your records.",
    "The status moves forward only — it can never go back to Draft.",
    "Accepted, Rejected and Expired are final outcomes.",
    "If the scope changes, create a new estimate rather than editing the old one.",
  ],
  viewDownloadPrint: [
    "Open the estimate from the list to see every detail.",
    "Use View PDF for the print-ready document.",
    "Print or save the PDF from the browser's normal print dialog.",
  ],
};

const PURCHASE_ORDER_GUIDE: DocumentHelpGuide = {
  kind: "purchaseOrder",
  route: "/purchase-orders",
  icon: "local_shipping",
  whatItIs:
    "A purchase order is what you send to a supplier to order goods or services. It records what you have asked a vendor for, at what price, and what happens next.",
  howToCreate: [
    "Open Purchase Orders and choose New Purchase Order.",
    "Enter the vendor/supplier details you are ordering from.",
    "Add the products you are ordering, with quantity and price.",
    "Set the delivery details and review the totals.",
    "Choose Save & Generate Purchase Order, then confirm in the review dialog. Nothing is created until you confirm.",
  ],
  howToCreateWell: [
    "Name the vendor precisely — a purchase order is a commitment to a real supplier.",
    "Add delivery dates and locations so receiving can be tracked against the order.",
    "Use clear product descriptions and correct HSN/SAC codes.",
    "Keep quantities accurate; they drive the goods-received comparison later.",
  ],
  canEditAfterCreation: [
    "Only the status. A purchase order moves forward through its status workflow and never back.",
  ],
  cannotEditAfterCreation: [
    "The vendor.",
    "The products, quantities, and prices.",
    "The delivery dates and locations.",
    "The notes and terms.",
    "The created totals.",
  ],
  statusFlow: documentStatusFlow("purchaseOrder"),
  afterCreation: [
    "A permanent purchase order is stored against your records.",
    "The status moves forward only — it can never go back to Draft.",
    "Accepted, Partially Received, Received and Cancelled are final outcomes.",
    "If the requirement changes, raise a new purchase order rather than editing the old one.",
  ],
  viewDownloadPrint: [
    "Open the purchase order from the list to see every detail.",
    "Use View PDF for the print-ready order to send to the supplier.",
    "Print or save the PDF from the browser's normal print dialog.",
  ],
};

const GUIDES: Record<DocumentKind, DocumentHelpGuide> = {
  invoice: INVOICE_GUIDE,
  quotation: QUOTATION_GUIDE,
  estimate: ESTIMATE_GUIDE,
  purchaseOrder: PURCHASE_ORDER_GUIDE,
};

/** The per-document guide, or undefined for an unknown kind. */
export function documentHelpGuide(kind: DocumentKind): DocumentHelpGuide | undefined {
  return GUIDES[kind];
}

/** Every document guide, in the fixed order the Help page renders them. */
export function allDocumentHelpGuides(): DocumentHelpGuide[] {
  return DOCUMENT_KINDS.map((kind) => GUIDES[kind]);
}

/** Short label used on the Help page's document selector. */
export function helpGuideTitle(kind: DocumentKind): string {
  const label = documentKindLabel(kind);
  return `${label}s`;
}

/** Lowercase noun, reused by the Help page copy. */
export function helpGuideNoun(kind: DocumentKind): string {
  return documentKindNoun(kind);
}
