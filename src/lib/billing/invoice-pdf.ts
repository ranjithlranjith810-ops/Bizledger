import "server-only";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { BillingPaymentDetail } from "@/lib/billing/billing-history-service";

// Phase 8D — server-side receipt PDF.
//
// Renders the VERIFIED-payment receipt (the same immutable BillingInvoice data
// the detail page shows) into an A4 PDF with pdf-lib. Only reached through
// GET /api/billing/invoice/download, which applies the exact same authz/
// tenant scoping as the invoice route and never re-sequences the counters.

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const RED = rgb(0.58, 0.0, 0.043);
const INK = rgb(0.098, 0.11, 0.118);
const MUTED = rgb(0.42, 0.47, 0.53);
const LINE = rgb(0.925, 0.933, 0.941);
const FAINT = rgb(0.969, 0.973, 0.976);

// pdf-lib's built-in Helvetica is WinAnsi-only; ₹ and smart punctuation are NOT
// encodable and would throw at draw time, so transliterate before drawing.
const TRANSLIT: Record<string, string> = {
  "\u20B9": "Rs.",
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00A0": " ",
};
export function pdfSafe(input: string | null | undefined): string {
  let out = String(input ?? "");
  for (const [from, to] of Object.entries(TRANSLIT)) {
    out = out.split(from).join(to);
  }
  return out.replace(/[^\x20-\x7E]/g, " ");
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** INR string from a server 2dp money string without any WinAnsi-hostile glyphs. */
function inr(value: string | undefined): string {
  const n = Number(value ?? "0");
  return `Rs. ${Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
}

function textWidth(text: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

interface Draw {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
}

function line(d: Draw) {
  d.page.drawRectangle({
    x: MARGIN,
    y: d.y,
    width: CONTENT_W,
    height: 0.8,
    color: LINE,
  });
}

function label(d: Draw, text: string, size = 8, color = MUTED) {
  d.page.drawText(pdfSafe(text), {
    x: MARGIN,
    y: d.y,
    size,
    font: d.bold,
    color,
    lineHeight: 4,
  });
}

/** Label + value pair (left column or right-aligned). */
function infoLine(d: Draw, text: string, boldLabel = false, color = INK, size = 10) {
  d.page.drawText(pdfSafe(text), {
    x: MARGIN,
    y: d.y,
    size,
    font: boldLabel ? d.bold : d.regular,
    color,
  });
}

function rightLine(d: Draw, text: string, font: PDFFont, size = 10, color = INK) {
  d.page.drawText(pdfSafe(text), {
    x: PAGE_W - MARGIN - textWidth(pdfSafe(text), font, size),
    y: d.y,
    size,
    font,
    color,
  });
}

function safeJoin(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && String(p).trim()).join(", ");
}

/**
 * Renders the receipt into a freshly created A4 PDF. Caller is responsible for
 * authorization and tenant scoping; this function is pure (no DB, no IO).
 * Throws for anything that cannot produce a byte-identical, drawable document.
 */
export async function renderInvoicePdf(
  detail: BillingPaymentDetail,
): Promise<Uint8Array> {
  if (!detail.invoice) {
    throw new Error("No invoice exists for this payment.");
  }

  const { payment, invoice } = detail;
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const d: Draw = { page, regular, bold, y: PAGE_H - MARGIN };

  const supplier = (invoice.supplierSnapshot ?? {}) as Record<string, unknown>;
  const customer = (invoice.customerSnapshot ?? {}) as Record<string, string>;
  const supplierName = pdfSafe(String(supplier.name ?? "")) || "BizLedger";
  const supplierGstin = pdfSafe(String(supplier.gstin ?? ""));
  const gstRate = Number(invoice.gstRate);

  // ── Header ───────────────────────────────────────────────────────────
  page.drawText("BizLedger", {
    x: MARGIN, y: d.y, size: 20, font: bold, color: RED,
  });
  page.drawText(`GST Supplier${supplierGstin ? ` - GSTIN ${supplierGstin}` : ""}`, {
    x: MARGIN, y: d.y - 22, size: 9, font: regular, color: MUTED,
  });

  rightLine(d, "Billing Invoice / Payment Receipt", bold, 16, RED);
  rightLine(
    { ...d, y: d.y - 26 },
    pdfSafe(invoice.invoiceNumber),
    bold,
    12,
    INK,
  );
  rightLine({ ...d, y: d.y - 44 }, `Invoice Date: ${fmtDate(invoice.invoiceDate)}`, regular, 8.5, MUTED);
  rightLine({ ...d, y: d.y - 56 }, `Payment Date: ${fmtDate(invoice.paymentDate)}`, regular, 8.5, MUTED);

  d.y -= 72;
  line(d);
  d.y -= 22;

  // ── Billed To / Subscription ──────────────────────────────────────────
  d.y -= 4;
  label(d, "BILLED TO");
  d.y -= 16;
  const customerName = pdfSafe(customer.name) || payment.planName;
  infoLine(d, customerName, true, INK, 11);
  if (customer.legalName) {
    d.y -= 17;
    infoLine(d, pdfSafe(customer.legalName), false, MUTED, 9.5);
  }
  if (customer.gstin) {
    d.y -= 17;
    infoLine(d, `GSTIN: ${pdfSafe(customer.gstin)}`, false, MUTED, 9.5);
  }
  const addressLine = safeJoin([
    customer.address,
    customer.city,
    customer.state,
    customer.stateCode,
    customer.pincode,
  ]);
  if (addressLine) {
    d.y -= 17;
    infoLine(d, pdfSafe(addressLine), false, MUTED, 9.5);
  }
  if (customer.email || customer.phone) {
    d.y -= 17;
    infoLine(d, pdfSafe(safeJoin([customer.email, customer.phone])), false, MUTED, 9.5);
  }

  const cursor = d.y; // remember top of subscription column

  d.y = cursor;
  const subText = `${invoice.planName} (${invoice.billingPeriod === "year" ? "Annual" : "Monthly"})`;
  rightLine(d, pdfSafe(subText), bold, 11, INK);
  d.y = cursor - 17;
  rightLine(d, "Billing period for a 12-month subscription billing cycle", regular, 8.5, MUTED);

  d.y = Math.min(d.y, cursor) - 24;
  line(d);
  d.y -= 24;

  // ── Amount table ──────────────────────────────────────────────────────
  label(d, "DESCRIPTION", 8.5);
  rightLine(d, "AMOUNT", bold, 8.5, MUTED);
  d.y -= 18;
  line(d);
  d.y -= 20;

  infoLine(d, pdfSafe(`${invoice.planName} - ${invoice.billingPeriod === "year" ? "annual" : "monthly"} subscription`), false, INK, 10);
  rightLine(d, inr(invoice.baseAmount), regular, 10, INK);

  d.y -= 26;
  infoLine(d, `GST @ ${Number.isFinite(gstRate) ? gstRate : 0}%`, false, MUTED, 10);
  rightLine(d, inr(invoice.gstAmount), regular, 10, INK);

  d.y -= 26;
  page.drawRectangle({
    x: MARGIN - 10,
    y: d.y - 4,
    width: CONTENT_W + 20,
    height: 26,
    color: FAINT,
  });
  infoLine(d, "Total Paid", true, INK, 11);
  rightLine(d, inr(invoice.totalAmount), bold, 12, RED);
  d.y -= 38;
  line(d);
  d.y -= 24;

  // ── Footer ────────────────────────────────────────────────────────────
  infoLine(d, `Order: ${pdfSafe(invoice.orderId)}`, false, MUTED, 9);
  if (invoice.paymentMethod) {
    d.y -= 16;
    infoLine(d, `Paid via ${pdfSafe(invoice.paymentMethod)}`, false, MUTED, 9);
  }
  d.y -= 16;
  infoLine(d, `Supplied by ${supplierName}`, false, MUTED, 9);

  if (!supplierGstin) {
    d.y -= 40;
    page.drawText(
      pdfSafe(
        "Supplier GST identification is not configured. This receipt is not eligible for GST input tax credit and is not a tax invoice under GST law.",
      ),
      {
        x: MARGIN,
        y: d.y,
        size: 7.5,
        font: regular,
        color: MUTED,
        maxWidth: CONTENT_W,
        lineHeight: 10,
      },
    );
  }

  return doc.save();
}

/**
 * Attachment filename for the download header. invoiceNumber is minted
 * server-side (BL-<fiscalYear>-<num>), so this needs no further sanitization,
 * but we encode it anyway to be safe inside Content-Disposition.
 */
export function invoiceDownloadFilename(invoiceNumber: string): string {
  return `Invoice_${encodeURIComponent(invoiceNumber)}.pdf`;
}