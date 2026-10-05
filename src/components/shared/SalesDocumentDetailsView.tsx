"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Quotation, Estimate } from "@/types";
import { ArrowLeft, Download, Printer, ReceiptText } from "lucide-react";
import { DocPrintSheet, PrintItem, PrintMetaRow } from "@/components/shared/DocPrintSheet";
import {
  estimatesApi,
  fromBackendEstimate,
} from "@/lib/api/estimates";
import {
  quotationsApi,
  fromBackendQuotation,
} from "@/lib/api/quotations";
import { isTemporaryId } from "@/lib/optimistic-id";
import { ApiError } from "@/lib/api-client";
import {
  nextEstimateStatuses,
  nextQuotationStatuses,
} from "@/lib/sales-document/status-transitions";
import {
  renderDocumentPdf,
  documentPdfFilename,
} from "@/lib/print/document-pdf";
import { BizLedgerLoader } from "@/components/ui/BizLedgerLoader";
import { Icon } from "../ui/Icon";

type Kind = "quotation" | "estimate";

/**
 * The conversion request in flight FOR THIS DOCUMENT, or null. Scoping by `id`
 * means a conversion started elsewhere can never disable this row's buttons.
 */
type ActiveConversion = { target: "quotation" | "invoice" } | null;

/** Inline spinner for a converting button. Decorative: the label and the
 *  overlay's live region carry the meaning, so this stays aria-hidden. */
const ConvertingSpinner: React.FC = () => (
  <Icon name="progress_activity" className="animate-spin text-[15px]" aria-hidden="true" />
);

/**
 * Lightweight processing indication shown while a conversion request is in
 * flight. Purely presentational: it appears the moment the request starts and
 * disappears when that same request settles, so it can never outlive the real
 * work. It is advisory only (`pointer-events-none`) - the buttons themselves
 * carry the disabled state, so unrelated navigation stays available.
 */
const ConversionOverlay: React.FC = () => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
    aria-hidden="true"
  >
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center rounded-2xl bg-white/95 px-8 py-7 shadow-lg ring-1 ring-[#eceef0] backdrop-blur-sm"
    >
      <BizLedgerLoader size="sm" label="Processing your request" />
      <p className="mt-4 text-sm font-bold text-[#191c1e]">Please wait</p>
      <p className="mt-1 max-w-[15rem] text-center text-xs text-[#515f74]">
        Your request is being processed...
      </p>
    </div>
  </div>
);

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
  Expired: "bg-gray-100 text-gray-500 border-gray-200",
};

/**
 * Status lifecycle notes for this view.
 *
 * The selectable status options are derived from the SAME authoritative
 * transition matrix the server validates against (nextQuotationStatuses /
 * nextEstimateStatuses), so an illegal target is never offered. This is UX
 * only, never a security boundary — the server re-reads the document's current
 * status from the database and rejects an illegal edge regardless.
 *
 * A terminal status (Accepted / Rejected / Expired) yields an empty list, and a
 * terminal document gets a read-only status control rather than an empty box.
 */
export const SalesDocumentDetailsView: React.FC<{ kind: Kind }> = ({ kind }) => {
  const {
    quotations,
    estimates,
    updateQuotationStatus,
    updateEstimateStatus,
    convertQuotationToInvoice,
    convertEstimateToQuotation,
    convertEstimateToInvoice,
    addNotification,
    companyProfile,
    activeBusinessId,
    convertingDocument,
    transitioningDocument,
  } = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    id: string;
    record: Estimate | Quotation | null;
    error: "missing" | "error" | null;
  } | null>(null);

  const isQuote = kind === "quotation";
  const docFromState = isQuote
    ? quotations.find((q) => q.id === params.id)
    : estimates.find((e) => e.id === params.id);

  // Keyed by id so a result for a previous route is never shown, and so the
  // status can be derived during render instead of being reset in an effect
  // (which would cascade extra renders).
  const current = fetchResult?.id === params.id ? fetchResult : null;
  const doc = docFromState ?? current?.record ?? null;
  const fetchStatus: "idle" | "loading" | "saving" | "missing" | "error" = (() => {
    if (docFromState) return "idle";
    if (isTemporaryId(params.id)) return "saving";
    if (!activeBusinessId) return "idle";
    if (current === null) return "loading";
    return current.error ?? "idle";
  })();

  // Fix C: a deep link, a reload, or a navigation from another screen has no
  // client state for this id. Previously that rendered "not found" for a
  // document that genuinely exists. Fetch the authoritative record instead.
  useEffect(() => {
    if (docFromState) return;
    // An optimistic id has no database row yet - fetching it would only 404.
    if (isTemporaryId(params.id)) return;
    if (!activeBusinessId) return;
    let cancelled = false;
    const request = isQuote
      ? quotationsApi
          .get(activeBusinessId, params.id)
          .then((r) => fromBackendQuotation(r.quotation))
      : estimatesApi
          .get(activeBusinessId, params.id)
          .then((r) => fromBackendEstimate(r.estimate));
    request
      .then((record) => {
        if (cancelled) return;
        setFetchResult({ id: params.id, record, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchResult({
          id: params.id,
          record: null,
          error: err instanceof ApiError && err.status === 404 ? "missing" : "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [docFromState, activeBusinessId, params.id, isQuote]);

  if (!doc) {
    const label = isQuote ? "Quotation" : "Estimate";
    let message = `${label} not found.`;
    if (fetchStatus === "loading") message = `Loading ${label.toLowerCase()}...`;
    else if (fetchStatus === "saving")
      message = `This ${label.toLowerCase()} is still being saved...`;
    else if (fetchStatus === "error")
      message = `${label} could not be loaded.`;
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-gray-400">{message}</div>
      </div>
    );
  }

  const docNumber = isQuote
    ? (doc as Quotation).quotationNumber
    : (doc as Estimate).estimateNumber;
  const listHref = isQuote ? "/quotations" : "/estimates";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const bytes = await renderDocumentPdf(companyProfile, {
        banner: isQuote ? "Quotation" : "Estimate",
        docNumber,
        metaRows,
        party: {
          title: isQuote ? "Quotation For (Prepared To)" : "Estimate For (Prepared To)",
          name: doc.customerName,
          address: doc.customerAddress,
          phone: doc.customerPhone,
          gstin: doc.customerGstin,
        },
        items,
        subtotal: doc.subtotal,
        cgst: doc.cgst,
        sgst: doc.sgst,
        total: doc.grandTotal,
        notes: doc.notes,
        terms: doc.terms,
        footerNote: "This quotation is not a tax invoice.",
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = documentPdfFilename(docNumber, "document");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Could not download PDF",
        message:
          err instanceof Error
            ? err.message
            : "Try the Print button instead.",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // NOTE: quotations and estimates are NOT deletable. There is deliberately no
  // Delete action here and no delete path in the context or the API — a
  // quotation that was sent and is no longer wanted is closed with Rejected or
  // Expired via the status control below, never erased.

  // The status transition in flight FOR THIS DOCUMENT. Scoped by `id` so a
  // transition on one row never disables another's status control. The status
  // itself is never changed locally — the context replaces the row with the
  // server's authoritative response once the request resolves.
  const isTransitioning = transitioningDocument?.id === doc.id;

  // Options come from the shared authoritative matrix, so the UI can only ever
  // offer a legal destination (UX only; the server still validates).
  const nextStatusOptions: readonly string[] = isQuote
    ? nextQuotationStatuses(doc.status)
    : nextEstimateStatuses(doc.status);

  const handleStatusChange = (status: string) => {
    if (isQuote) void updateQuotationStatus(doc.id, status as Quotation["status"]);
    else void updateEstimateStatus(doc.id, status as Estimate["status"]);
  };

  // The conversion the user started on THIS document, if it is still running.
  // Both Convert buttons disable while it is set, which blocks the duplicate
  // click that would otherwise create a second document.
  const activeConversion: ActiveConversion =
    convertingDocument?.id === doc.id
      ? { target: convertingDocument.target }
      : null;
  const isConverting = activeConversion !== null;
  const convertingToInvoice = activeConversion?.target === "invoice";
  const convertingToQuotation = activeConversion?.target === "quotation";

  const handleConvertToInvoice = () => {
    if (isConverting) return;
    if (isQuote) convertQuotationToInvoice(doc.id);
    else convertEstimateToInvoice(doc.id);
  };

  const handleConvertToQuotation = () => {
    if (isConverting) return;
    convertEstimateToQuotation((doc as Estimate).id);
  };

  const metaRows: PrintMetaRow[] = [
    { label: isQuote ? "Quotation Date" : "Estimate Date", value: doc.date },
    ...((doc as Quotation).validUntil
      ? [{ label: "Valid Until", value: (doc as Quotation).validUntil }]
      : []),
    {
      label: "Price Type",
      value:
        doc.pricingMode === "exclusive" ? "GST Exclusive" : "GST Inclusive",
    },
  ];

  const items: PrintItem[] = doc.items.map((it) => ({
    id: it.id,
    description: it.description,
    hsnSac: it.hsnSac,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    taxableAmount: it.taxableAmount,
    gstRate: it.gstRate,
    totalAmount: it.totalAmount,
  }));

  return (
    <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
      {isConverting && <ConversionOverlay />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(listHref)}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-600 rounded-xl transition-colors shadow-xs"
            title={`Back to ${isQuote ? "Quotations" : "Estimates"}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-[#191c1e] font-mono tracking-tight">
                {docNumber}
              </h2>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  STATUS_COLORS[doc.status] || STATUS_COLORS.Draft
                }`}
              >
                {doc.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Prepared for{" "}
              <strong className="text-gray-800">{doc.customerName}</strong> on{" "}
              {doc.date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isQuote && !(doc as Quotation).convertedInvoiceId && (
            <button
              onClick={handleConvertToInvoice}
              disabled={isConverting}
              aria-busy={convertingToInvoice}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Convert to Invoice"
            >
              {convertingToInvoice ? <ConvertingSpinner /> : <ReceiptText className="w-3.5 h-3.5" />}
              <span>{convertingToInvoice ? "Converting…" : "Convert to Invoice"}</span>
            </button>
          )}
          {!isQuote && !(doc as Estimate).convertedQuotationId && !(doc as Estimate).convertedInvoiceId && (
            <button
              onClick={handleConvertToQuotation}
              disabled={isConverting}
              aria-busy={convertingToQuotation}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Convert to Quotation"
            >
              {convertingToQuotation ? (
                <ConvertingSpinner />
              ) : (
                <Icon name="request_quote" className="text-[15px]" />
              )}
              <span>{convertingToQuotation ? "Converting…" : "Convert to Quotation"}</span>
            </button>
          )}
          {!isQuote && !(doc as Estimate).convertedInvoiceId && (
            <button
              onClick={handleConvertToInvoice}
              disabled={isConverting}
              aria-busy={convertingToInvoice}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Convert to Invoice"
            >
              {convertingToInvoice ? <ConvertingSpinner /> : <ReceiptText className="w-3.5 h-3.5" />}
              <span>{convertingToInvoice ? "Converting…" : "Convert to Invoice"}</span>
            </button>
          )}

          {/*
            Only legally-available next statuses are selectable, derived from
            the same matrix the server enforces. A terminal status shows a
            read-only label instead of a control with no valid options.
          */}
          {nextStatusOptions.length === 0 ? (
            <span
              className="rounded-lg border border-[#eceef0] bg-white px-3 py-2 text-xs font-semibold text-gray-500"
              title={`${doc.status} is a final status and cannot be changed`}
            >
              {doc.status}
            </span>
          ) : (
            <select
              value={doc.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isTransitioning}
              aria-busy={isTransitioning}
              className="bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-2 rounded-lg text-xs font-semibold outline-none text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                isTransitioning
                  ? "Saving status…"
                  : `Change status (next: ${nextStatusOptions.join(", ")})`
              }
            >
              <option value={doc.status}>{doc.status}</option>
              {nextStatusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handlePrint}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title={`Download this ${isQuote ? "quotation" : "estimate"} as a PDF file`}
          >
            {downloadingPdf ? (
              <Icon name="progress_activity" className="text-[16px] animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloadingPdf ? "Generating PDF..." : "Download PDF"}</span>
          </button>
        </div>
      </div>

      {(doc as Quotation).convertedInvoiceId ? (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
          <ReceiptText className="w-4 h-4" />
          <span>
            {isQuote ? "Quotation" : "Estimate"} was converted to invoice{" "}
            <span className="font-mono font-bold">
              {(doc as Quotation).convertedInvoiceNumber}
            </span>
          </span>
        </div>
      ) : !isQuote && (doc as Estimate).convertedQuotationId ? (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
          <Icon name="request_quote" className="text-[16px]" />
          <span>
            Estimate was converted to quotation{" "}
            <span className="font-mono font-bold">
              {(doc as Estimate).convertedQuotationNumber}
            </span>
          </span>
        </div>
      ) : null}

      {!isQuote && (doc as Estimate).scope && (
        <div className="bg-[#fef8ec] border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <span className="font-bold uppercase tracking-wider text-[10px]">
            Scope / Description:
          </span>
          <p className="mt-1 whitespace-pre-wrap">
            {(doc as Estimate).scope}
          </p>
        </div>
      )}

      <DocPrintSheet
        banner={isQuote ? "QUOTATION" : "ESTIMATE"}
        docNumber={docNumber}
        metaRows={metaRows}
        party={{
          title: "Quotation For (Prepared To)",
          name: doc.customerName,
          address: doc.customerAddress,
          phone: doc.customerPhone,
          gstin: doc.customerGstin,
        }}
        items={items}
        subtotal={doc.subtotal}
        cgst={doc.cgst}
        sgst={doc.sgst}
        total={doc.grandTotal}
        notes={doc.notes}
        terms={doc.terms}
        showBank={false}
        signature
        footerNote="This quotation is not a tax invoice."
      />
    </div>
  );
};