"use client";

import React, { useEffect, useState } from "react";
import { DocumentKind } from "@/lib/document-experience";
import {
  SAMPLE_PREVIEW_LABEL,
  SAMPLE_NOT_REAL_LABEL,
  sampleCompanyProfile,
  sampleInvoice,
  sampleSalesDocumentPdf,
  samplePurchaseOrderPdf,
} from "@/lib/sample-documents";
import { renderGstInvoicePdf } from "@/lib/invoice/gst-invoice-pdf";
import { renderDocumentPdf } from "@/lib/print/document-pdf";

interface DocumentSampleViewerProps {
  kind: DocumentKind;
  height?: number;
}

/**
 * Renders the BizLedger sample for the given document type through the PRODUCTION
 * PDF engine and shows it inside the page (an <iframe> backed by a blob URL).
 * Also carries two fixed badges: "SAMPLE PREVIEW" and "NOT A REAL DOCUMENT".
 * Nothing is ever auto-downloaded and no database record is created.
 */
export const DocumentSampleViewer: React.FC<DocumentSampleViewerProps> = ({
  kind,
  height = 420,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let createdUrl: string | null = null;

    void (async () => {
      try {
        const bytes =
          kind === "invoice"
            ? await renderGstInvoicePdf(sampleInvoice(), sampleCompanyProfile())
            : kind === "purchaseOrder"
              ? await renderDocumentPdf(sampleCompanyProfile(), samplePurchaseOrderPdf())
              : await renderDocumentPdf(
                  sampleCompanyProfile(),
                  sampleSalesDocumentPdf(kind),
                );
        const blob = new Blob([new Uint8Array(bytes)], {
          type: "application/pdf",
        });
        createdUrl = URL.createObjectURL(blob);
        if (alive) setObjectUrl(createdUrl);
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error ? err.message : "The sample could not be generated.",
          );
        }
      }
    })();

    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [kind]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
          {SAMPLE_PREVIEW_LABEL}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 border border-rose-300 text-rose-900 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
          {SAMPLE_NOT_REAL_LABEL}
        </span>
        <span className="text-[10px] text-gray-400">
          Generated live with the same engine used for your real documents.
        </span>
      </div>
      {error ? (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs"
        >
          {error}
        </div>
      ) : (
        <div
          // `max-w-full overflow-hidden` guarantees the embedded PDF viewer can
          // never push the app page wider than the viewport on a small screen:
          // any internal overflow is clipped (and scrollable) inside the
          // preview frame only.
          className="w-full max-w-full overflow-hidden rounded-xl border border-[#eceef0] bg-white"
          style={{ height }}
        >
          {objectUrl ? (
            <iframe
              title={`${SAMPLE_PREVIEW_LABEL} — ${SAMPLE_NOT_REAL_LABEL}`}
              src={objectUrl}
              className="w-full max-w-full h-full border-0"
              aria-label="Sample document preview"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
              Preparing sample preview…
            </div>
          )}
        </div>
      )}
    </div>
  );
};