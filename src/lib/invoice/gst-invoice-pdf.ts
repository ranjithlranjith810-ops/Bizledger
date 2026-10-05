// Client-side GST tax invoice → PDF renderer.
//
// The web invoice detail page renders a TAX-INVOICE document from the stored
// Invoice + CompanyProfile. "Download PDF" previously just opened the browser
// print dialog; this module produces a real .pdf with the SAME data the on
// screen document shows (stored item amounts, stored tax splits, resolved
// company terms/bank details), using the already-installed pdf-lib — no new
// dependency, no server round-trip.
//
// pdf-lib's built-in Helvetica is WinAnsi-only, so ₹ and smart punctuation are
// transliterated before drawing (see pdfSafe).

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  RGB,
} from "pdf-lib";
import type { CompanyProfile, Invoice } from "@/types";
import { stampPageFrame } from "@/lib/print/page-frame";
import {
  resolveGstSupportInfo,
  resolveInvoiceTerms,
  resolvePaymentTerms,
} from "@/lib/documentConfig";
import { sumStoredInvoiceTotals } from "@/lib/invoice";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_R = PAGE_W - MARGIN;

const RED: RGB = rgb(0.576, 0.0, 0.043);
const INK: RGB = rgb(0.098, 0.11, 0.118);
const MUTED: RGB = rgb(0.42, 0.47, 0.53);
const LINE: RGB = rgb(0.894, 0.902, 0.91);
const FAINT: RGB = rgb(0.969, 0.976, 0.98);
const FAINT_RED: RGB = rgb(0.996, 0.949, 0.949);

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

/** Safe browser download filename derived from the invoice number. */
export function invoicePdfFilename(invoiceNumber: string): string {
  const safe = pdfSafe(invoiceNumber)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safe || "invoice"}.pdf`;
}

function inr(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return pdfSafe(iso);
  const pad = (nn: number) => String(nn).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (!word) continue;
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || font.widthOfTextAtSize(next, size) <= maxWidth) {
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [""];
}

interface Surface {
  page: PDFPage;
  y: number;
}

export async function renderGstInvoicePdf(
  invoice: Invoice,
  company: CompanyProfile
): Promise<Uint8Array> {
  if (!invoice.items || invoice.items.length === 0) {
    throw new Error("This invoice has no line items to render.");
  }

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const sfc: Surface = { page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN };
  const newPage = () => {
    sfc.page = doc.addPage([PAGE_W, PAGE_H]);
    sfc.y = PAGE_H - MARGIN;
  };
  const ensure = (height: number) => {
    if (sfc.y - height < MARGIN) {
      newPage();
      return true;
    }
    return false;
  };

  function put(
    x: number,
    yy: number,
    text: string,
    font: PDFFont,
    size: number,
    color: RGB = INK,
    maxWidth?: number
  ) {
    sfc.page.drawText(pdfSafe(text), {
      x,
      y: yy,
      size,
      font,
      color,
      ...(maxWidth !== undefined ? { maxWidth, lineHeight: size + 4 } : {}),
    });
  }

  const draw = (
    text: string,
    font: PDFFont,
    size: number,
    color: RGB = INK,
    opts: { maxWidth?: number } = {}
  ) => put(MARGIN, sfc.y, text, font, size, color, opts.maxWidth);

  const rightDraw = (
    text: string,
    font: PDFFont,
    size: number,
    color: RGB = INK,
    rightEdge = CONTENT_R
  ) => {
    const safe = pdfSafe(text);
    put(
      rightEdge - font.widthOfTextAtSize(safe, size),
      sfc.y,
      safe,
      font,
      size,
      color
    );
  };

  // Shrink a cell's font so its rendered width never exceeds the column track
  // (min floor). Numerics are right-aligned; a value too wide for its track
  // degrades to a slightly smaller size instead of bleeding into the neighbor
  // column. This is what keeps the item table columns from overlapping.
  const fitSize = (
    text: string,
    font: PDFFont,
    base: number,
    track: number,
    min = 6
  ): number => {
    let size = base;
    while (size > min && font.widthOfTextAtSize(text, size) > track) {
      size -= 0.5;
    }
    return size;
  };

  // Right-aligned draw with automatic scale-to-fit inside a column track.
  const rightFit = (
    text: string,
    font: PDFFont,
    baseSize: number,
    color: RGB,
    rightEdge: number,
    track: number,
    min = 6
  ) => {
    const safe = pdfSafe(text);
    const size = fitSize(safe, font, baseSize, track, min);
    put(
      rightEdge - font.widthOfTextAtSize(safe, size),
      sfc.y,
      safe,
      font,
      size,
      color
    );
  };

  const hline = () =>
    sfc.page.drawRectangle({
      x: MARGIN,
      y: sfc.y,
      width: CONTENT_W,
      height: 0.8,
      color: LINE,
    });

  async function embedDataUrlImage(url: string | undefined) {
    if (!url || !url.startsWith("data:image/")) return undefined;
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(url);
    if (!m) return undefined;
    try {
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const img =
        m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      return img;
    } catch {
      return undefined;
    }
  }

  const totals = sumStoredInvoiceTotals(invoice.items || []);
  const terms = resolveInvoiceTerms(company);
  const supportInfo = resolveGstSupportInfo(company);
  const paymentTerms = resolvePaymentTerms(company);

  // ── Document banner ────────────────────────────────────────────────────
  // Compact header band (same constants as the estimate/PO/quotation
  // renderer): banner in the top margin, hairline rule, then the header.
  ensure(90);
  sfc.y -= 12;
  const bannerText = "TAX-INVOICE";
  put(
    (PAGE_W - bold.widthOfTextAtSize(bannerText, 16)) / 2,
    sfc.y,
    bannerText,
    bold,
    16,
    RED
  );
  sfc.y -= 14;
  hline();

  // ── Header: supplier block + invoice meta box ──────────────────────────
  const headerTop = sfc.y - 12;
  sfc.y = headerTop;
  let supplierBottom = headerTop;

  const logo = await embedDataUrlImage(company.logoUrl);
  // Max contain-fit dimension for the header logo (24 → 44 → 57; keeps the
  // artwork readable). The actual image is drawn at its contain-fit size below,
  // preserving its own width/height ratio, original colors, and transparency.
  // NOTE: the source ISWAYAM logo is an opaque JPEG with NO transparent padding
  // and NO blank/white border — every region of the canvas is artwork, so we do
  // NOT crop it (that would remove real artwork). The "excess gap" to the
  // business name came from offsetting the text by the full reserved box even
  // though a portrait artwork renders far narrower than the box.
  const logoSize = 57;
  const companyName = pdfSafe(company.companyName) || "Your Business";
  const supplierAddress = [company.streetAddress]
    .filter(Boolean)
    .join(", ");
  const supplierCityState = [company.city, company.state, company.pincode]
    .filter(Boolean)
    .join(", ");

  // Number of the supplier text lines the header will render (address, city/
  // state, GSTIN, PAN) — drives the deterministic header-box height the logo is
  // capped against, exactly as the draw loop below measures it.
  const headerLineCount = [supplierAddress, supplierCityState, company.gstin, company.pan]
    .filter(Boolean).length;
  const headerBoxH = Math.max(24 + 13 * headerLineCount, 4);

  // Actual contain-fit artwork size, computed BEFORE the text is placed so the
  // name column starts just after the rendered artwork (plus a small, clean
  // gap) instead of after the unused reserved-box width — that reserved width
  // is what created the visible blank space between the portrait logo and the
  // business name.
  let logoW = 0;
  let logoH = 0;
  let logoScale = 0;
  if (logo) {
    const contain = Math.min(logoSize, headerBoxH);
    logoScale = Math.min(contain / logo.width, contain / logo.height);
    logoW = logo.width * logoScale;
    logoH = logo.height * logoScale;
  }
  // Small, intentional gap between the artwork edge and the supplier text.
  const nameX = logo ? MARGIN + logoW + 8 : MARGIN;
  put(nameX, headerTop - 4, companyName, bold, 12.5, INK);
  let sline = headerTop - 20;
  if (supplierAddress) {
    put(nameX, sline, pdfSafe(supplierAddress), regular, 8.5, MUTED);
    sline -= 13;
  }
  if (supplierCityState) {
    put(nameX, sline, pdfSafe(supplierCityState), regular, 8.5, MUTED);
    sline -= 13;
  }
  if (company.gstin) {
    put(
      nameX,
      sline,
      `GSTIN: ${pdfSafe(company.gstin)}`,
      regular,
      8.5,
      MUTED
    );
    sline -= 13;
  }
  if (company.pan) {
    put(nameX, sline, `PAN: ${pdfSafe(company.pan)}`, regular, 8.5, MUTED);
    sline -= 13;
  }
  supplierBottom = sline - 4;

  // Draw the supplier logo last so it is contained and centered against the
  // actual text block (company name → PAN). Contain-fit: the drawn size is the
  // image's own aspect ratio scaled to fit inside the logo box (precomputed as
  // `logoW`/`logoH` above), capped so the larger rendered logo can never extend
  // below the supplier text block and collide with the metadata box/separator.
  // Original colors and any alpha transparency are preserved (pdf-lib embeds
  // the real PNG/JPEG pixels).
  if (logo && logoW > 0 && logoH > 0) {
    const boxH = Math.max(headerTop - supplierBottom, 4);
    const y = headerTop - (boxH - logoH) / 2 - logoH;
    sfc.page.drawImage(logo, {
      x: MARGIN,
      y,
      width: logoW,
      height: logoH,
    });
  }

  // Invoice meta box (right).
  const metaWidth = 216;
  const metaLeft = CONTENT_R - metaWidth;
  const metaPairs: [string, string][] = [
    ["INVOICE / DOCUMENT NO.", pdfSafe(invoice.invoiceNumber)],
    ["INVOICE DATE", pdfSafe(invoice.date) || "—"],
    ["PAYMENT TERMS", pdfSafe(paymentTerms)],
    ["STATE / STATE CODE", pdfSafe(invoice.placeOfSupply)],
  ];
  const metaInnerY = 12;
  const rowTop = headerTop - 12;
  const metaHeight = 26 * metaPairs.length + 12;
  sfc.page.drawRectangle({
    x: metaLeft,
    y: headerTop - metaHeight,
    width: metaWidth,
    height: metaHeight,
    color: FAINT,
  });
  const valueMax = metaWidth - 20;
  let rowY = rowTop;
  for (const [label, value] of metaPairs) {
    put(metaLeft + 12, rowY, label, bold, 6.5, MUTED);
    rowY -= 11;
    put(metaLeft + 12, rowY, value, bold, 9, RED, valueMax);
    rowY -= 15;
  }

  sfc.y = Math.min(supplierBottom, headerTop - metaHeight);
  sfc.y -= 8;
  hline();
  sfc.y -= 14;

  // ── Bill To ────────────────────────────────────────────────────────────
  const billToWidth = CONTENT_W;
  const billToLines: { text: string; font: PDFFont; size: number; color: RGB }[] = [];
  billToLines.push({
    text: invoice.customerName || "Customer",
    font: bold,
    size: 10.5,
    color: INK,
  });
  if (invoice.customerAddress) {
    for (const ln of wrap(invoice.customerAddress, regular, 8.5, 250)) {
      billToLines.push({ text: ln, font: regular, size: 8.5, color: MUTED });
    }
  }
  if (invoice.customerPhone) {
    billToLines.push({
      text: `Contact: ${invoice.customerPhone}`,
      font: regular,
      size: 8.5,
      color: MUTED,
    });
  }
  const rightLines: {
    label: string;
    value: string;
  }[] = [
    {
      label: "CUSTOMER GSTIN",
      value: invoice.customerGstin ? pdfSafe(invoice.customerGstin) : "—",
    },
    {
      label: "STATE / CODE",
      value: pdfSafe(invoice.placeOfSupply) || "—",
    },
  ];
  if (invoice.vehicle?.vehicleNumber) {
    rightLines.push({
      label: "VEHICLE NO.",
      value: pdfSafe(invoice.vehicle.vehicleNumber),
    });
  } else {
    rightLines.push({
      label: "DISPATCH MODE",
      value: "Commercial Fleet Road Transport",
    });
  }
  const leftHeight = billToLines.reduce(
    (acc, l) =>
      acc + wrap(l.text, l.font, l.size, 250).length * 13 + 2,
    0
  );
  const rightHeight = rightLines.length * 24;
  const billToH = Math.max(leftHeight, rightHeight) + 16;
  ensure(billToH + 24);
  sfc.page.drawRectangle({
    x: MARGIN,
    y: sfc.y - billToH,
    width: billToWidth,
    height: billToH,
    color: FAINT,
  });
  put(MARGIN + 12, sfc.y - 12, "DETAILS OF RECEIVER (BILLED TO)", bold, 7, MUTED);
  let ly = sfc.y - 28;
  for (const l of billToLines) {
    for (const ln of wrap(l.text, l.font, l.size, 250)) {
      put(MARGIN + 12, ly, ln, l.font, l.size, l.color);
      ly -= 13;
    }
    ly -= 2;
  }
  let ry = sfc.y - 28;
  const rightLabelX = metaLeft;
  const rightValueX = CONTENT_R - 12;
  for (const pair of rightLines) {
    put(rightLabelX, ry, pair.label, bold, 6.5, MUTED);
    const valW = fontWidth(pair.value, regular, 8);
    put(rightValueX - Math.min(valW, 150), ry - 11, pair.value, regular, 8, INK);
    ry -= 24;
  }
  sfc.y = Math.min(ly, ry) - 8;
  hline();
  sfc.y -= 22;

  // ── Items table ────────────────────────────────────────────────────────
  // Column geometry: description takes the flexible left block; every numeric
  // column is right-aligned inside its own width (`*Right` edge + `*Track`
  // usable width). HSN is a dedicated right-aligned column (between ITEM
  // DESCRIPTION and QTY) with its own header; values too wide for a track
  // shrink to fit (never overlap). The HSN track borrows a little width from
  // the flexible description block so header and codes stay clearly readable.
  const colGreen = {
    no: MARGIN,
    desc: MARGIN + 22,
    descRight: 256,
    descTrack: 256 - (MARGIN + 22) - 6,
    hsnRight: 306,
    hsnTrack: 44,
    qtyRight: 342,
    qtyTrack: 32,
    rateRight: 402,
    rateTrack: 56,
    taxableRight: 462,
    taxableTrack: 56,
    gstRight: 490,
    gstTrack: 26,
    totalRight: CONTENT_R,
    totalTrack: 53,
  };

  const drawHeaders = () => {
    sfc.page.drawRectangle({
      x: MARGIN,
      y: sfc.y - 16,
      width: CONTENT_W,
      height: 16,
      color: FAINT,
    });
    put(colGreen.no + 4, sfc.y - 11, "#", bold, 7.5, MUTED);
    put(colGreen.desc, sfc.y - 11, "ITEM DESCRIPTION", bold, 7.5, MUTED);
    rightDraw("HSN", bold, 7.5, MUTED, colGreen.hsnRight);
    rightDraw("QTY", bold, 7.5, MUTED, colGreen.qtyRight);
    rightDraw("RATE", bold, 7.5, MUTED, colGreen.rateRight);
    rightDraw("TAXABLE", bold, 7.5, MUTED, colGreen.taxableRight);
    rightDraw("GST%", bold, 7.5, MUTED, colGreen.gstRight);
    rightDraw("TOTAL", bold, 7.5, MUTED, colGreen.totalRight);
    sfc.y -= 16;
  };
  ensure(40);
  drawHeaders();
  sfc.y -= 8;

  invoice.items.forEach((item, idx) => {
    const descLines = wrap(item.description || "Item", regular, 8, colGreen.descTrack);
    const hsn = (item.hsnSac ? pdfSafe(item.hsnSac) : "").trim();
    const rowH = Math.max(22, descLines.length * 11 + (hsn ? 11 : 0) + 8);
    if (ensure(rowH)) {
      // Re-draw the header on the continuation page, then the row.
      sfc.y -= 6;
      drawHeaders();
      sfc.y += 6;
    }
    const baseY = sfc.y - 4;
    put(colGreen.no + 4, baseY, String(idx + 1), regular, 8, MUTED);
    let dy = baseY;
    for (const ln of descLines) {
      put(colGreen.desc, dy, ln, regular, 8, INK);
      dy -= 11;
    }
    rightFit(hsn, regular, 8, MUTED, colGreen.hsnRight, colGreen.hsnTrack);
    rightFit(
      formatNum(item.quantity) + (item.unit ? ` ${pdfSafe(item.unit)}` : ""),
      regular,
      8,
      INK,
      colGreen.qtyRight,
      colGreen.qtyTrack
    );
    rightFit(inr(item.unitPrice), regular, 8, INK, colGreen.rateRight, colGreen.rateTrack);
    rightFit(
      inr(item.taxableAmount ?? 0),
      regular,
      8,
      INK,
      colGreen.taxableRight,
      colGreen.taxableTrack
    );
    rightFit(`${Number(item.gstRate) || 0}%`, regular, 8, INK, colGreen.gstRight, colGreen.gstTrack);
    rightFit(
      inr(item.totalAmount ?? 0),
      bold,
      8,
      INK,
      colGreen.totalRight,
      colGreen.totalTrack
    );
    sfc.y -= rowH;
  });
  sfc.y -= 6;
  hline();
  sfc.y -= 22;

  // ── Bank details + financial summary ───────────────────────────────────
  const bankLines: string[] = [];
  if (company.bankName) bankLines.push(`Bank: ${pdfSafe(company.bankName)}`);
  if (company.accountNumber) bankLines.push(`A/C: ${pdfSafe(company.accountNumber)}`);
  if (company.ifscCode) bankLines.push(`IFSC: ${pdfSafe(company.ifscCode)}`);
  if (company.upiId && company.upiId.trim()) {
    bankLines.push(`UPI: ${pdfSafe(company.upiId)}`);
  }
  const summaryRows: { label: string; value: string; highlight: boolean }[] = [];
  summaryRows.push({ label: "Taxable Value:", value: inr(totals.subtotal), highlight: false });
  if (Number(invoice.igst) > 0) {
    summaryRows.push({ label: "IGST:", value: inr(invoice.igst ?? 0), highlight: false });
  } else {
    summaryRows.push({ label: "CGST (9%):", value: inr(invoice.cgst ?? 0), highlight: false });
    summaryRows.push({ label: "SGST (9%):", value: inr(invoice.sgst ?? 0), highlight: false });
  }
  summaryRows.push({ label: "Grand Total (Rs.):", value: inr(totals.grandTotal), highlight: true });

  const bankH = bankLines.length ? bankLines.length * 16 + 30 : 0;
  const summaryH = summaryRows.length * 22 + 8;
  const financialH = Math.max(bankH, summaryH);
  ensure(financialH + 24);

  const bankTop = sfc.y;
  if (bankLines.length) {
    sfc.page.drawRectangle({
      x: MARGIN,
      y: bankTop - bankH,
      width: 210,
      height: bankH,
      color: FAINT,
    });
    put(MARGIN + 12, bankTop - 22, "REMITTANCE BANK DETAILS", bold, 7, MUTED);
    let by = bankTop - 38;
    for (const line of bankLines) {
      put(MARGIN + 12, by, line, regular, 8, INK);
      by -= 16;
    }
  }

  const summaryLeft = CONTENT_R - 272;
  const summaryTop = sfc.y;
  const summaryRight = summaryLeft + 248;
  let sy = summaryTop - 10;
  for (let i = 0; i < summaryRows.length; i++) {
    const row = summaryRows[i];
    const rowH = 22;
    const baseline = sy - 14;
    if (row.highlight) {
      sfc.page.drawRectangle({
        x: summaryLeft,
        y: sy - rowH,
        width: 240,
        height: rowH,
        color: FAINT_RED,
      });
    }
    put(summaryLeft + 12, baseline, row.label, bold, 9, row.highlight ? RED : INK);
    sfc.y = baseline;
    rightDraw(row.value, bold, row.highlight ? 9.5 : 8.5, row.highlight ? RED : INK, summaryLeft + 248);
    sy -= rowH + 2;
  }
  sfc.y = Math.min(bankTop - bankH, summaryTop - (summaryRows.length * 24)) - 14;
  hline();
  sfc.y -= 24;

  // ── Footer: terms + support info (left) | signatory (right) ────────────
  //
  // Two INDEPENDENT columns that can never collide:
  //   * left  — a pre-wrapped list of terms clauses (numbered) + support info,
  //     wrapped to LEFT_COL_W starting at MARGIN;
  //   * right — a fixed-height signatory block occupying the SIGN_W band that
  //     starts at SIGN_X.
  // The left column is capped at what the gap actually leaves available, so
  // LEFT_COL_W + FOOTER_GAP + SIGN_W <= CONTENT_W holds by construction even if
  // the page margins change. The whole block's height is known BEFORE anything
  // is drawn, so `ensure` can move the entire footer to a fresh page when it
  // would not fit — which is what previously left an orphaned signatory drawn
  // at the old page's y-offset on the new page, overlapping the terms.
  const SIGN_W = 180;
  const FOOTER_GAP = 16;
  const SIGN_X = CONTENT_R - SIGN_W;
  const LEFT_COL_W = Math.min(258, SIGN_X - FOOTER_GAP - MARGIN);
  const LEFT_LH = 10.5; // terms line height
  const SIGN_LABEL_TOP = 8; // "For <company>" below the block top
  const SIGN_BAND_H = 40; // reserved signature image band
  const SIGN_RULE_GAP = 4; // gap above the signature rule
  const SIGN_CAPTION_GAP = 12; // gap below the rule to the caption
  const SIGN_H =
    SIGN_LABEL_TOP + SIGN_BAND_H + SIGN_RULE_GAP + SIGN_CAPTION_GAP + 10;

  type FooterLine = {
    text: string;
    font: PDFFont;
    size: number;
    color: RGB;
    /** Horizontal indent inside the left column (hanging-clause indent). */
    indent: number;
  };

  // Pre-wrap the entire left column so the block height is known up front.
  const termsFooterLines: FooterLine[] = [];
  if (terms.length > 0) {
    termsFooterLines.push({
      text: "TERMS & CONDITIONS:",
      font: bold,
      size: 7.5,
      color: MUTED,
      indent: 0,
    });
    terms.forEach((clause, i) => {
      const marker = `${i + 1}.`;
      const markerW = fontWidth(`${marker} `, regular, 7.5);
      const clauseLines = wrap(clause, regular, 7.5, LEFT_COL_W - markerW);
      clauseLines.forEach((ln, j) => {
        termsFooterLines.push({
          text: j === 0 ? `${marker} ${ln}` : ln,
          font: regular,
          size: 7.5,
          color: MUTED,
          indent: j === 0 ? 0 : markerW,
        });
      });
    });
  }
  if (supportInfo) {
    if (termsFooterLines.length > 0) termsFooterLines.push({
      text: "",
      font: regular,
      size: 7.5,
      color: MUTED,
      indent: 0,
    });
    for (const ln of wrap(supportInfo, regular, 7.5, LEFT_COL_W)) {
      termsFooterLines.push({
        text: ln,
        font: regular,
        size: 7.5,
        color: MUTED,
        indent: 0,
      });
    }
  }

  const footerBlockH = Math.max(termsFooterLines.length * LEFT_LH, SIGN_H) + 6;
  ensure(footerBlockH);

  // Anchor BOTH columns to the same page/top. `footerPage` is captured before
  // the left column is drawn so a left-column page break can never move the
  // signatory off its reserved band.
  const footerPage = sfc.page;
  const footerTop = sfc.y;
  const drawOn = (
    page: PDFPage,
    x: number,
    yy: number,
    text: string,
    font: PDFFont,
    size: number,
    color: RGB = INK
  ) => {
    page.drawText(pdfSafe(text), { x, y: yy, size, font, color });
  };

  let fy = footerTop;
  for (const line of termsFooterLines) {
    if (fy - LEFT_LH < MARGIN) {
      newPage();
      fy = sfc.y;
    }
    if (line.text) drawOn(sfc.page, MARGIN + line.indent, fy, line.text, line.font, line.size, line.color);
    fy -= LEFT_LH;
  }
  sfc.y = Math.min(footerTop - termsFooterLines.length * LEFT_LH, fy) - 6;

  // Signatory block — drawn on the reserved right band of the footer page.
  const sig = await embedDataUrlImage(company.digitalSignatureUrl);
  if (sig) {
    const scale = Math.min(120 / sig.width, (SIGN_BAND_H - 8) / sig.height);
    const w = sig.width * scale;
    const h = sig.height * scale;
    footerPage.drawImage(sig, {
      x: SIGN_X + (SIGN_W - w) / 2,
      y: footerTop - SIGN_LABEL_TOP - 4 - h,
      width: w,
      height: h,
    });
  } else {
    drawOn(
      footerPage,
      SIGN_X + (SIGN_W - fontWidth("[Authorized Signatory]", bold, 9)) / 2,
      footerTop - SIGN_LABEL_TOP - 14,
      "[Authorized Signatory]",
      bold,
      9,
      MUTED
    );
  }
  const signRuleY = footerTop - SIGN_LABEL_TOP - SIGN_BAND_H - SIGN_RULE_GAP;
  footerPage.drawRectangle({
    x: SIGN_X,
    y: signRuleY,
    width: SIGN_W,
    height: 0.8,
    color: LINE,
  });
  drawOn(footerPage, SIGN_X, footerTop - SIGN_LABEL_TOP, `For ${companyName}`, bold, 8.5, INK);
  drawOn(
    footerPage,
    SIGN_X,
    signRuleY - SIGN_CAPTION_GAP,
    "AUTHORIZED SIGNATORY",
    regular,
    7,
    MUTED
  );

  // ── Page frame ─────────────────────────────────────────────────────────
  // A thin rule set inside the trimmed page edge, on every page (including
  // overflow pages). Shared with the quotation/estimate/purchase-order
  // renderer so all four document types are framed identically. It reflows
  // nothing and sits clear of the 48pt content margin, so it clips no content
  // and leaves the internal separator rules intact.
  stampPageFrame(doc, PAGE_W, PAGE_H);

  return doc.save();
}

function fontWidth(text: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(pdfSafe(text), size);
}

function formatNum(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
