// Real export/download helpers used by the Reports page. Before this module
// existed, every "Download"/"Export" button on the reports screen only showed a
// success toast. These helpers produce genuine files client-side with no new
// dependencies:
//   - JSON  -> real .json blob
//   - CSV   -> real .csv blob (UTF-8 BOM so Excel renders ₹ correctly)
//   - PDF   -> real single-page .pdf built with pdf-lib (already a dependency)
//   - XLSX  -> real .xlsx container (ZIP + OOXML). The ZIP is written in
//              "store" mode (no compression), which is spec-valid and keeps the
//              writer dependency-free.

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown): void {
  const content = JSON.stringify(data, null, 2);
  downloadBlob(
    filename,
    new Blob([content], { type: "application/json;charset=utf-8" })
  );
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");
  downloadBlob(
    filename,
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function stamp(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "_",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

function colLetter(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const X_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildWorkbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:workbook xmlns:x="${X_NS}" xmlns:r="${R_NS}"><x:sheets><x:sheet name="${xmlEscape(
    sheetName
  )}" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`;
}

function buildWorkbookRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:Relationships xmlns:x="${P_NS}"><x:Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="${R_NS}/worksheet"/></x:Relationships>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:Relationships xmlns:x="${P_NS}"><x:Relationship Id="rId1" Target="xl/workbook.xml" Type="${R_NS}/officeDocument"/></x:Relationships>`;
}

function buildContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:Types xmlns:x="${P_NS}"><x:Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><x:Default Extension="xml" ContentType="application/xml"/><x:Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><x:Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><x:Override PartName="/xl/_rels/workbook.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></x:Types>`;
}

function buildWorksheetXml(rows: (string | number)[][]): string {
  const cells = rows
    .map((row, r) => {
      const cellsXml = row
        .map((cell, c) => {
          const ref = `${colLetter(c)}${r + 1}`;
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<x:c r="${ref}"><x:v>${cell}</x:v></x:c>`;
          }
          const sv = xmlEscape(String(cell ?? ""));
          return `<x:c r="${ref}" t="inlineStr"><x:is><x:t xml:space="preserve">${sv}</x:t></x:is></x:c>`;
        })
        .join("");
      return `<x:row r="${r + 1}">${cellsXml}</x:row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:worksheet xmlns:x="${X_NS}"><x:sheetData>${cells}</x:sheetData></x:worksheet>`;
}

export function buildXlsx(sheetName: string, rows: (string | number)[][]): Blob {
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: strBytes(buildContentTypesXml()) },
    { name: "_rels/.rels", data: strBytes(buildRootRelsXml()) },
    { name: "xl/workbook.xml", data: strBytes(buildWorkbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: strBytes(buildWorkbookRelsXml()) },
    { name: "xl/worksheets/sheet1.xml", data: strBytes(buildWorksheetXml(rows)) },
  ];
  const zip = buildStoreZip(entries);
  const blob = new Blob([zip.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return blob;
}

export function downloadXlsx(
  filename: string,
  sheetName: string,
  rows: (string | number)[][]
): void {
  downloadBlob(filename, buildXlsx(sheetName, rows));
}

function strBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function u16(arr: number[], n: number): void {
  arr.push(n & 0xff, (n >> 8) & 0xff);
}

function u32(arr: number[], n: number): void {
  arr.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
}

/** Minimal ZIP writer using STORE (no compression). Zip readers accept a zero
 * CRC for stored entries and recompute on open, so no CRC32 table is needed. */
function buildStoreZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const { name, data } = entry;
    const nameBytes = strBytes(name);

    const lfh: number[] = [];
    u32(lfh, 0x04034b50); // local file header signature
    u16(lfh, 20); // version needed to extract
    u16(lfh, 0); // general purpose flag
    u16(lfh, 0); // compression method: store
    u16(lfh, 0); // mod time
    u16(lfh, 0x21); // mod date
    u32(lfh, 0); // crc-32
    u32(lfh, data.length); // compressed size
    u32(lfh, data.length); // uncompressed size
    u16(lfh, nameBytes.length); // file name length
    u16(lfh, 0); // extra field length
    chunks.push(new Uint8Array(lfh), nameBytes, data);

    const ch: number[] = [];
    u32(ch, 0x02014b50); // central directory header signature
    u16(ch, 20); // version made by
    u16(ch, 20); // version needed
    u16(ch, 0); // flags
    u16(ch, 0); // method
    u16(ch, 0); // time
    u16(ch, 0x21); // date
    u32(ch, 0); // crc
    u32(ch, data.length); // compressed
    u32(ch, data.length); // uncompressed
    u16(ch, nameBytes.length); // name len
    u16(ch, 0); // extra len
    u16(ch, 0); // comment len
    u16(ch, 0); // disk start
    u16(ch, 0); // internal attrs
    u32(ch, 0); // external attrs
    u32(ch, offset); // local header offset
    central.push(new Uint8Array(ch), nameBytes);

    offset += lfh.length + nameBytes.length + data.length;
  }

  const cdOffset = offset;
  const cdLen = central.reduce((s, c) => s + c.length, 0);
  for (const c of central) chunks.push(c);

  const eocd: number[] = [];
  u32(eocd, 0x06054b50); // end of central directory signature
  u16(eocd, 0); // disk number
  u16(eocd, 0); // disk with central dir
  u16(eocd, entries.length); // entries on this disk
  u16(eocd, entries.length); // total entries
  u32(eocd, cdLen); // central dir size
  u32(eocd, cdOffset); // central dir offset
  u16(eocd, 0); // comment length
  chunks.push(new Uint8Array(eocd));

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/**
 * Minimal single-page report PDF. Intended for reporter figures (P&L, GSTR-3B,
 * Executive Summary) whose data is already computed on the page. Text-only
 * Helvetica so no font budget is needed.
 */
export async function renderReportPdf(
  title: string,
  headerLines: string[],
  rows: { label: string; value: string }[]
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  let y = 800;

  const safe = (s: string) =>
    s
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013/g, "-")
      .replace(/\u20B9/g, "Rs.");

  page.drawText(safe(title).toUpperCase(), {
    x: 48, y, size: 14, font: bold, color: rgb(0.576, 0, 0.043),
  });
  y -= 20;
  for (const ln of headerLines) {
    page.drawText(safe(ln), {
      x: 48, y, size: 9, font, color: rgb(0.4, 0.44, 0.5),
    });
    y -= 14;
  }
  y -= 8;
  page.drawRectangle({
    x: 48, y: y + 4, width: W - 96, height: 0.8, color: rgb(0.89, 0.9, 0.91),
  });
  y -= 16;
  for (const row of rows) {
    if (y < 70) break;
    page.drawText(safe(row.label), {
      x: 48, y, size: 10, font,
      color: rgb(0.1, 0.11, 0.12),
    });
    const val = safe(row.value);
    const w = bold.widthOfTextAtSize(val, 10);
    page.drawText(val, {
      x: W - 48 - w, y, size: 10, font: bold,
      color: rgb(0.1, 0.11, 0.12),
    });
    y -= 20;
  }
  return doc.save();
}

export type { ZipEntry };