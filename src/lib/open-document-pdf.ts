// Client-side helpers to open a JUST-CREATED document's PDF in a new tab, using
// the SAME production renderer the details views use. Called only from the
// create-flow success panel (never auto-downloaded on create).

import type { CompanyProfile, Invoice } from "@/types";
import { renderGstInvoicePdf } from "@/lib/invoice/gst-invoice-pdf";
import {
  renderDocumentPdf,
  RenderDocumentPdfOptions,
} from "@/lib/print/document-pdf";

function openBlob(bytes: Uint8Array): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  // The renderer holds the whole document in memory; releasing the blob URL a
  // little later lets the new tab finish loading the document first.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!win) {
    // Popup blocked: fall back to a same-window navigation-free hint.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    throw new Error(
      "The PDF could not be opened. Please allow pop-ups for this site.",
    );
  }
}

export async function openCreatedInvoicePdf(
  invoice: Invoice,
  company: CompanyProfile,
): Promise<void> {
  const bytes = await renderGstInvoicePdf(invoice, company);
  openBlob(new Uint8Array(bytes));
}

export async function openCreatedDocumentPdf(
  company: CompanyProfile,
  opts: RenderDocumentPdfOptions,
): Promise<void> {
  const bytes = await renderDocumentPdf(company, opts);
  openBlob(new Uint8Array(bytes));
}