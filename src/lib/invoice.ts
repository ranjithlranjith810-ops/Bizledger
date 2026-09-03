// Single source of truth for GST arithmetic and invoice numbering. Supports
// two pricing modes:
//   - "inclusive" (DEFAULT / canonical): the unit price entered by the user
//     already includes GST; the line total reconciles exactly to qty x rate.
//   - "exclusive": the unit price is the taxable base; GST is added on top.
// Both the document builder modals and the printable details views call these
// so numbers can never drift out of sync.

import type { PricingMode } from "@/types";

// ---------------------------------------------------------------- rounding
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------- GST
export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number; // per-unit price ENTERED by the user (see pricingMode)
  gstRate: number; // total GST rate % (e.g. 18)
  pricingMode?: PricingMode; // per-line override; defaults to "inclusive"
}

export interface InvoiceLineTotals {
  inclusive: number; // qty x unitPrice (the amount entered)
  taxable: number; // inclusive mode: inclusive / (1 + gst/100); exclusive: qty x rate
  cgst: number; // taxable x gst/200
  sgst: number; // taxAmount - cgst (absorbs the rounding remainder)
  taxAmount: number; // cgst + sgst
  totalAmount: number; // taxable + taxAmount (inclusive mode: reconciles to inclusive)
}

// Compute per-line totals in the requested pricing mode. In "inclusive" mode
// the line always reconciles exactly to the amount entered by the user:
//   round2(taxable) + round2(cgst) + round2(sgst) === round2(inclusive)
// To make that an exact equality despite independent 2-decimal rounding of each
// component, SGST absorbs the tiny remainder:
//   taxAmount = inclusive - taxable   (total tax needed to hit inclusive exactly)
//   cgst      = round2(taxable * gst / 200)
//   sgst      = round2(taxAmount - cgst)
// This guarantees taxable + cgst + sgst == inclusive with no ₹0.01 drift
// (e.g. qty 1 x ₹5,000 @ 18% -> 4,237.29 + 381.36 + 381.35 = ₹5,000.00).
// In "exclusive" mode the rate is the taxable base so GST is layered on top:
//   taxAmount = round2(taxable * gst / 100)   (e.g. ₹5,000 @ 18% -> +₹900)
// The same SGST remainder policy keeps taxable + cgst + sgst == totalAmount.
export function calculateLineTotals(
  line: InvoiceLineInput,
  pricingMode?: PricingMode
): InvoiceLineTotals {
  const qty = Number(line.quantity) || 0;
  const rate = Number(line.unitPrice) || 0;
  const gst = Number(line.gstRate) || 0;
  const mode: PricingMode = pricingMode || line.pricingMode || "inclusive";

  const gross = round2(qty * rate);
  const taxable =
    mode === "exclusive" ? gross : round2(gross / (1 + gst / 100));
  const taxAmount =
    mode === "exclusive"
      ? round2(taxable * (gst / 100))
      : round2(gross - taxable);
  const cgst = round2(taxable * (gst / 200));
  const sgst = round2(taxAmount - cgst);
  const totalAmount = round2(taxable + taxAmount);

  return { inclusive: gross, taxable, cgst, sgst, taxAmount, totalAmount };
}

export interface InvoiceTotals {
  lines: InvoiceLineTotals[];
  subtotal: number; // total taxable value
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
}

// Summarise line inputs into store-ready document figures.
export function calculateInvoiceTotals(
  lines: InvoiceLineInput[],
  pricingMode?: PricingMode
): InvoiceTotals {
  const lineTotals = lines.map((l) => calculateLineTotals(l, pricingMode));
  const subtotal = round2(lineTotals.reduce((acc, l) => acc + l.taxable, 0));
  const cgst = round2(lineTotals.reduce((acc, l) => acc + l.cgst, 0));
  const sgst = round2(lineTotals.reduce((acc, l) => acc + l.sgst, 0));
  const igst = 0;
  const totalTax = round2(cgst + sgst + igst);
  const grandTotal = round2(subtotal + totalTax);

  return { lines: lineTotals, subtotal, cgst, sgst, igst, totalTax, grandTotal };
}

// Conversion helper for a stored invoice item already holding per-line
// taxable/cgst/sgst taxAmount fields, ensuring single-calculation consistency
// when re-rendering totals in the details view.
export function sumStoredInvoiceTotals(items: {
  taxableAmount: number;
  taxAmount: number;
}[]): {
  subtotal: number;
  totalTax: number;
  grandTotal: number;
} {
  const subtotal = round2(items.reduce((acc, it) => acc + (it.taxableAmount || 0), 0));
  const totalTax = round2(items.reduce((acc, it) => acc + (it.taxAmount || 0), 0));
  return { subtotal, totalTax, grandTotal: round2(subtotal + totalTax) };
}

// ------------------------------------------------------------ invoice number
// "MI/26-27/050" = PREFIX / FY-slug / zero-padded-3 sequence.
//
// Prefix sanitisation: only alphabetic characters are accepted, uppercased
// ("mi" -> "MI", "Inv" -> "INV"). Any other character (digits, -, /, spaces,
// ".") makes the prefix INVALID so it is rejected rather than silently mangled.
export function normalizeInvoicePrefix(input: string): {
  valid: boolean;
  prefix: string;
} {
  const trimmed = (input || "").trim();
  if (!trimmed) return { valid: false, prefix: "" };
  if (!/^[A-Za-z]+$/.test(trimmed)) return { valid: false, prefix: trimmed };
  return { valid: true, prefix: trimmed.toUpperCase() };
}

// "Financial Year 2026-27" -> "26-27", "FY 2027-28" -> "27-28", else "".
export function fySlug(fyName: string): string {
  const m = /(?:19|20)(\d{2})\s*-\s*(\d{2})/.exec(fyName || "");
  return m ? `${m[1]}-${m[2]}` : "";
}

export function buildInvoiceNumber(
  prefix: string,
  fyName: string,
  sequence: number
): string {
  const norm = normalizeInvoicePrefix(prefix);
  const p = norm.valid ? norm.prefix : "INV";
  const slug = fySlug(fyName);
  const num = String(sequence).padStart(3, "0");
  const slugPart = slug ? `/${slug}/` : "/";
  return `${p}${slugPart}${num}`;
}

// --------------------------------------------------------------- documents
// Reusable document numbering for the additional business documents. Every
// document type (Invoice, Quotation, Estimate, Purchase Order) keeps its own
// independent sequence and prefix "QT"/"EST"/"PO" (INV default handled by
// buildInvoiceNumber via the company prefix). The financial-year slug comes
// from the ACTIVE BizLedger financial year, so switching FY only affects NEW
// document numbers; stored numbers never change.
export type DocumentType = "quotation" | "estimate" | "purchaseOrder";

const DOCUMENT_DEFAULT_PREFIX: Record<DocumentType, string> = {
  quotation: "QT",
  estimate: "EST",
  purchaseOrder: "PO",
};

export function buildDocumentNumber(
  type: DocumentType,
  fyName: string,
  sequence: number,
  overridePrefix?: string
): string {
  const norm = normalizeInvoicePrefix(overridePrefix || "");
  const p = norm.valid ? norm.prefix : DOCUMENT_DEFAULT_PREFIX[type];
  const slug = fySlug(fyName);
  const num = String(sequence).padStart(3, "0");
  const slugPart = slug ? `/${slug}/` : "/";
  return `${p}${slugPart}${num}`;
}
