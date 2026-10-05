// Client-side PDF renderer for non-tax documents (quotation, estimate,
// purchase order). The detail pages render a printable document via
// DocPrintSheet; "Download PDF" previously faked a success toast. This module
// produces a real .pdf with the SAME stored data (mirrors DocPrintSheet), using
// the already-installed pdf-lib — no new dependency, no server round-trip.
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
import type { CompanyProfile } from "@/types";
import { stampPageFrame } from "@/lib/print/page-frame";

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

/** Safe browser download filename derived from a document number. */
export function documentPdfFilename(docNumber: string, fallback: string): string {
  const safe = pdfSafe(docNumber || fallback)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safe || fallback}.pdf`;
}

function inr(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export interface DocPdfItem {
  description: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  totalAmount: number;
}

export interface DocPdfMetaRow {
  label: string;
  value: string;
}

export interface DocPdfParty {
  title: string;
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  extraRows?: { label: string; value: string }[];
}

export interface RenderDocumentPdfOptions {
  banner: string;
  subtitle?: string;
  docNumber: string;
  metaRows: DocPdfMetaRow[];
  party?: DocPdfParty;
  buyerBlock?: DocPdfParty;
  deliveryBlock?: {
    deliveryDate?: string;
    deliveryAddress?: string;
    deliveryMode?: string;
  };
  items: DocPdfItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  notes?: string;
  terms?: string;
  footerNote?: string;
  approximate?: boolean;
}

export async function renderDocumentPdf(
  company: CompanyProfile,
  opts: RenderDocumentPdfOptions
): Promise<Uint8Array> {
  if (!opts.items || opts.items.length === 0) {
    throw new Error("This document has no line items to render.");
  }

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const sfc: { page: PDFPage; y: number } = {
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
  };
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

  const rightDraw = (
    text: string,
    font: PDFFont,
    size: number,
    color: RGB = INK,
    rightEdge = CONTENT_R
  ) => {
    const safe = pdfSafe(text);
    put(rightEdge - font.widthOfTextAtSize(safe, size), sfc.y, safe, font, size, color);
  };

  const hline = () =>
    sfc.page.drawRectangle({
      x: MARGIN,
      y: sfc.y,
      width: CONTENT_W,
      height: 0.8,
      color: LINE,
    });

  // ── Document banner ────────────────────────────────────────────────────
  // Compact header band: document banner in the top margin, a hairline rule
  // below it, then the company/meta header starts with one tight gap. Uses the
  // same spacing constants as the GST invoice renderer so every document type
  // shares one visual header system.
  ensure(90);
  sfc.y -= 12;
  const bannerText = opts.banner.toUpperCase();
  put((PAGE_W - bold.widthOfTextAtSize(bannerText, 16)) / 2, sfc.y, bannerText, bold, 16, RED);
  if (opts.subtitle) {
    sfc.y -= 14;
    const subText = opts.subtitle.toUpperCase();
    put(
      (PAGE_W - regular.widthOfTextAtSize(subText, 7.5)) / 2,
      sfc.y,
      subText,
      regular,
      7.5,
      MUTED
    );
  }
  sfc.y -= 14;
  hline();

  // ── Header: company block + doc meta box ──────────────────────────────
  const headerTop = sfc.y - 12;
  sfc.y = headerTop;

  async function embedDataUrlImage(url: string | undefined) {
    if (!url || !url.startsWith("data:image/")) return undefined;
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(url);
    if (!m) return undefined;
    try {
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const img = m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      return img;
    } catch {
      return undefined;
    }
  }

  const logo = await embedDataUrlImage(company.logoUrl);
  const companyName = pdfSafe(company.companyName) || "Your Business";
  const supplierAddress = [company.streetAddress].filter(Boolean).join(", ");
  const supplierCityState = [company.city, company.state, company.pincode]
    .filter(Boolean)
    .join(", ");
  const headerLineCount = [supplierAddress, supplierCityState, company.gstin, company.pan]
    .filter(Boolean).length;
  const headerBoxH = Math.max(24 + 13 * headerLineCount, 4);

  let logoW = 0;
  let logoH = 0;
  if (logo) {
    const contain = Math.min(57, headerBoxH);
    const scale = Math.min(contain / logo.width, contain / logo.height);
    logoW = logo.width * scale;
    logoH = logo.height * scale;
  }
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
    put(nameX, sline, `GSTIN: ${pdfSafe(company.gstin)}`, regular, 8.5, MUTED);
    sline -= 13;
  }
  if (company.pan) {
    put(nameX, sline, `PAN: ${pdfSafe(company.pan)}`, regular, 8.5, MUTED);
    sline -= 13;
  }
  const supplierBottom = sline - 4;
  if (logo && logoW > 0 && logoH > 0) {
    const boxH = Math.max(headerTop - supplierBottom, 4);
    const y = headerTop - (boxH - logoH) / 2 - logoH;
    sfc.page.drawImage(logo, { x: MARGIN, y, width: logoW, height: logoH });
  }

  const metaWidth = 216;
  const metaLeft = CONTENT_R - metaWidth;
  const metaPairs: [string, string][] = [
    ["DOCUMENT NO.", pdfSafe(opts.docNumber) || "—"],
    ...opts.metaRows.map((r) => [pdfSafe(r.label).toUpperCase(), pdfSafe(r.value)] as [string, string]),
  ];
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

  // ── Party blocks (buyer first for PO, else party) ─────────────────────
  const blockHeight = (p: DocPdfParty) => {
    const addrLines = p.address ? wrap(p.address, regular, 8.5, 250).length * 13 + 2 : 0;
    const extra = (p.extraRows?.length || 0) * 13 + (p.gstin ? 13 : 0);
    return Math.max(54, 24 + addrLines + extra);
  };

  const parties: DocPdfParty[] = [];
  if (opts.buyerBlock) parties.push(opts.buyerBlock);
  if (opts.party) parties.push(opts.party);
  if (opts.deliveryBlock && (opts.deliveryBlock.deliveryDate || opts.deliveryBlock.deliveryMode || opts.deliveryBlock.deliveryAddress)) {
    parties.push({
      title: "Delivery Information",
      name: opts.deliveryBlock.deliveryMode || "—",
      address: opts.deliveryBlock.deliveryAddress,
      extraRows: opts.deliveryBlock.deliveryDate
        ? [{ label: "Delivery Date", value: opts.deliveryBlock.deliveryDate }]
        : undefined,
    });
  }

  for (const p of parties) {
    const h = blockHeight(p);
    ensure(h + 24 + 44 + 22);
    sfc.page.drawRectangle({
      x: MARGIN,
      y: sfc.y - h,
      width: CONTENT_W,
      height: h,
      color: FAINT,
    });
    put(MARGIN + 12, sfc.y - 12, pdfSafe(p.title).toUpperCase(), bold, 7, MUTED);
    let y = sfc.y - 28;
    put(MARGIN + 12, y, pdfSafe(p.name), bold, 10.5, INK);
    y -= 15;
    if (p.address) {
      for (const ln of wrap(p.address, regular, 8.5, 250)) {
        put(MARGIN + 12, y, ln, regular, 8.5, MUTED);
        y -= 13;
      }
      y -= 2;
    }
    if (p.gstin) {
      put(MARGIN + 12, y, `GSTIN: ${pdfSafe(p.gstin)}`, regular, 8.5, MUTED);
      y -= 13;
    }
    for (const row of p.extraRows || []) {
      put(MARGIN + 12, y, `${pdfSafe(row.label)}: ${pdfSafe(row.value)}`, regular, 8.5, MUTED);
      y -= 13;
    }
    sfc.y -= h;
    sfc.y -= 8;
    hline();
    sfc.y -= 14;
  }

  // ── Items table ────────────────────────────────────────────────────────
  const colGreen = {
    no: MARGIN,
    desc: MARGIN + 18,
    descRight: 246,
    descTrack: 246 - (MARGIN + 18) - 6,
    hsnRight: 292,
    hsnTrack: 42,
    qtyRight: 330,
    qtyTrack: 34,
    rateRight: 390,
    rateTrack: 56,
    taxableRight: 452,
    taxableTrack: 58,
    gstRight: 486,
    gstTrack: 30,
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

  const fitSize = (text: string, font: PDFFont, base: number, track: number, min = 6) => {
    let size = base;
    while (size > min && font.widthOfTextAtSize(text, size) > track) size -= 0.5;
    return size;
  };
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
    put(rightEdge - font.widthOfTextAtSize(safe, size), sfc.y, safe, font, size, color);
  };

  ensure(40);
  drawHeaders();
  sfc.y -= 8;

  opts.items.forEach((item, idx) => {
    const descLines = wrap(item.description || "Item", regular, 8, colGreen.descTrack);
    const hsn = (item.hsnSac ? pdfSafe(item.hsnSac) : "").trim();
    const rowH = Math.max(22, descLines.length * 11 + (hsn ? 11 : 0) + 8);
    if (ensure(rowH)) {
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
    rightFit(inr(item.taxableAmount ?? 0), regular, 8, INK, colGreen.taxableRight, colGreen.taxableTrack);
    rightFit(`${Number(item.gstRate) || 0}%`, regular, 8, INK, colGreen.gstRight, colGreen.gstTrack);
    rightFit(inr(item.totalAmount ?? 0), bold, 8, INK, colGreen.totalRight, colGreen.totalTrack);
    sfc.y -= rowH;
  });
  sfc.y -= 6;
  hline();
  sfc.y -= 22;

  // ── Financial summary ─────────────────────────────────────────────────
  const summaryRows: { label: string; value: string; highlight: boolean }[] = [
    { label: "Taxable Value:", value: inr(opts.subtotal ?? 0), highlight: false },
    { label: "CGST (9%):", value: inr(opts.cgst ?? 0), highlight: false },
    { label: "SGST (9%):", value: inr(opts.sgst ?? 0), highlight: false },
    {
      label: opts.approximate ? "Estimated Total:" : "Total (Rs.):",
      value: inr(opts.total ?? 0),
      highlight: true,
    },
  ];
  const summaryH = summaryRows.length * 24 + 8;
  ensure(summaryH + 24);

  const summaryLeft = CONTENT_R - 272;
  const summaryTop = sfc.y;
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
    put(summaryLeft + 12, baseline, row.label, bold, 8.5, row.highlight ? RED : INK);
    sfc.y = baseline;
    rightDraw(row.value, bold, row.highlight ? 9.5 : 8.5, row.highlight ? RED : INK, summaryLeft + 248);
    sy -= rowH + 2;
  }
  sfc.y = summaryTop - (summaryRows.length * 24) - 14;
  hline();
  sfc.y -= 24;

  // ── Footer: terms + notes + signature ─────────────────────────────────
  if (opts.terms) {
    put(MARGIN, sfc.y, "TERMS & CONDITIONS:", bold, 7.5, MUTED);
    sfc.y -= 15;
    for (const ln of wrap(opts.terms, regular, 7.5, 260)) {
      ensure(11 + 12);
      put(MARGIN, sfc.y, ln, regular, 7.5, MUTED);
      sfc.y -= 11;
    }
    sfc.y -= 2;
  }
  if (opts.notes) {
    put(MARGIN, sfc.y, "NOTES:", bold, 7.5, MUTED);
    sfc.y -= 15;
    for (const ln of wrap(opts.notes, regular, 7.5, 260)) {
      ensure(11 + 12);
      put(MARGIN, sfc.y, ln, regular, 7.5, MUTED);
      sfc.y -= 11;
    }
    sfc.y -= 2;
  }

  const signX = CONTENT_R - 180;
  const sig = await embedDataUrlImage(company.digitalSignatureUrl);
  let signTop = sfc.y;
  if (signTop - 88 < MARGIN) {
    newPage();
    signTop = sfc.y;
  }
  if (sig) {
    const scale = Math.min(120 / sig.width, 44 / sig.height);
    const w = sig.width * scale;
    const h = sig.height * scale;
    sfc.page.drawImage(sig, { x: signX + (180 - w) / 2, y: signTop - 40 - h, width: w, height: h });
  } else {
    put(
      signX + (180 - bold.widthOfTextAtSize("[Authorized Signatory]", 9)) / 2,
      signTop - 18,
      "[Authorized Signatory]",
      bold,
      9,
      MUTED
    );
  }
  sfc.page.drawRectangle({ x: signX, y: signTop - 4, width: 180, height: 0.8, color: LINE });
  put(signX, signTop - 16, `For ${companyName}`, bold, 8.5, INK);
  put(signX, signTop - 30, "AUTHORIZED SIGNATORY", regular, 7, MUTED);

  if (opts.footerNote) {
    put(signX, signTop + 12, pdfSafe(opts.footerNote), regular, 7, MUTED);
  }

  // ── Page frame ─────────────────────────────────────────────────────────
  // A thin rule set inside the trimmed page edge, on every page (including
  // overflow pages). Shared with the invoice renderer so quotation, estimate and
  // purchase order are framed identically to invoice. It reflows nothing and
  // sits clear of the 48pt content margin, so it clips no content and leaves
  // the internal separator rules intact.
  stampPageFrame(doc, PAGE_W, PAGE_H);

  return doc.save();
}

function formatNum(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}