// Shared A4 page frame for every generated document PDF.
//
// Invoice, estimate, quotation and purchase order are produced by two separate
// renderers — src/lib/invoice/gst-invoice-pdf.ts (invoice) and
// src/lib/print/document-pdf.ts (the other three) — which already share one set
// of A4 page constants. The frame therefore lives here and is stamped by both,
// so the border is identical across all four document types by construction
// rather than as four copies of the same numbers.
//
// Placement rules this module guarantees:
//   - The frame sits INSIDE the trimmed page edge by PAGE_FRAME_INSET, so it is
//     never clipped by a printer's non-printable area.
//   - PAGE_FRAME_INSET is smaller than the renderers' 48pt content margin, so
//     there is a clear, constant gap between the border and the content on all
//     four sides. The border cannot touch or overlap the header, party blocks,
//     items, totals, terms or signature.
//   - Nothing is reflowed: the frame is stroked last, on every page including
//     pages created by overflow, and it never moves existing content. Existing
//     internal separator rules are untouched.

import { PDFDocument, rgb, RGB } from "pdf-lib";

/** Inset from the trimmed A4 edge to the frame, in points. */
export const PAGE_FRAME_INSET = 20;

/** Hairline stroke weight, in points. Thin enough to read as a rule, not a box. */
export const PAGE_FRAME_WIDTH = 0.6;

// A muted slate that reads as a deliberate frame without competing with the
// document's red accents or its faint internal separators.
const FRAME_COLOR: RGB = rgb(0.72, 0.75, 0.79);

/**
 * Stroke the page frame on every page of the document.
 *
 * Call this immediately before `doc.save()`. Iterating the finished page list
 * (rather than stamping at each `addPage`) is what makes multi-page documents
 * frame every page, including pages the renderers created on overflow.
 */
export function stampPageFrame(
  doc: PDFDocument,
  pageWidth: number,
  pageHeight: number,
): void {
  for (const page of doc.getPages()) {
    page.drawRectangle({
      x: PAGE_FRAME_INSET,
      y: PAGE_FRAME_INSET,
      width: pageWidth - PAGE_FRAME_INSET * 2,
      height: pageHeight - PAGE_FRAME_INSET * 2,
      borderColor: FRAME_COLOR,
      borderWidth: PAGE_FRAME_WIDTH,
    });
  }
}
