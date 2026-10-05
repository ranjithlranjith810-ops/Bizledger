"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Quotation, Estimate, InvoiceItem, PricingMode } from "@/types";
import { calculateLineTotals, calculateInvoiceTotals, buildDocumentNumber } from "@/lib/invoice";
import { financialYearForDate, matchFinancialYear } from "@/lib/financialYear";
import { localDateString, parseLocalDate } from "@/lib/dates";
import { fyShortName } from "@/lib/utils";
import { X, Check, FileText, GraduationCap } from "lucide-react";
import { SearchablePicker } from "@/components/invoices/SearchablePicker";
import { LineItemsEditor, DocLineDraft, TotalsLabels } from "@/components/shared/LineItemsEditor";
import { normalizeBusinessText } from "@/lib/validation";
import { useModalBehavior } from "@/components/shared/useModalBehavior";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { DocumentImmutabilityWarning } from "@/components/documents/DocumentImmutabilityWarning";
import { DocumentExperienceModal } from "@/components/documents/DocumentExperienceModal";
import { DocumentCreateConfirmation } from "@/components/documents/DocumentCreateConfirmation";
import { DocumentSubmitLoading } from "@/components/documents/DocumentSubmitLoading";
import { DocumentCreateSuccess } from "@/components/documents/DocumentCreateSuccess";
import {
  isLearningDismissed,
  isLearningSeen,
  markLearningSeen,
} from "@/lib/document-experience";
import { openCreatedDocumentPdf } from "@/lib/open-document-pdf";
import { Icon } from "../ui/Icon";
import type {
  DocPdfItem,
  DocPdfMetaRow,
  RenderDocumentPdfOptions,
} from "@/lib/print/document-pdf";

type Kind = "quotation" | "estimate";

interface SalesDocumentModalProps {
  kind: Kind;
  doc?: Quotation | Estimate | null;
  onClose?: () => void;
}

function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

const STATUS_OPTIONS = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

export const SalesDocumentModal: React.FC<SalesDocumentModalProps> = ({
  kind,
  doc,
  onClose,
}) => {
  const {
    customers,
    products,
    addQuotation,
    updateQuotation,
    addEstimate,
    updateEstimate,
    setOpenModal,
    companyProfile,
    getActiveFinancialYear,
    financialYears,
    documentSequenceFor,
    isServerSequenceReady,
    syncServerSequence,
  } = useApp();

  const isEdit = !!doc;
  const isQuote = kind === "quotation";
  const activeFy = getActiveFinancialYear();
  const router = useRouter();

  const [customerId, setCustomerId] = useState<string>(
    doc?.customerId || ""
  );
  const [date, setDate] = useState<string>(
    doc?.date || localDateString()
  );
  const [validUntil, setValidUntil] = useState<string>(
    (doc as Quotation | Estimate)?.validUntil || addDays(date, 30)
  );

  // F11 — the financial year is derived from the DATE (the date is
  // authoritative; the server re-derives and verifies it). The preview number
  // uses the FY the date falls in and that year's counter, so it can never
  // visually suggest a mismatched fiscal year.
  const derivedFy = financialYearForDate(parseLocalDate(date) ?? new Date());
  const derivedFyRow = matchFinancialYear(financialYears, derivedFy);
  const previewFy = derivedFyRow ?? derivedFy;
  const fyMismatchWarning =
    !derivedFyRow
      ? `This date falls outside every configured financial year (it belongs to ${fyShortName(
          derivedFy.name,
        )}). The financial year is derived from the document date, so saving will be rejected.`
      : derivedFyRow.id !== (activeFy?.id ?? null)
        ? `This date belongs to ${fyShortName(
            derivedFy.name,
          )}, but the active financial year is ${activeFy ? fyShortName(activeFy.name) : "unset"}. The financial year is derived from the document date — saving will be rejected.`
        : null;

  // Preview document number: a NEW doc shows NOTHING until the server has
  // confirmed this (FY, kind) counter, because the only value available before
  // then is the localStorage seed (which starts at 1 on a fresh browser and is
  // what made a list ending at 003 preview as 001). An edited doc keeps its
  // existing number.
  const seqReady = isServerSequenceReady(previewFy.id, kind);
  const displayedNumber = isEdit
    ? isQuote
      ? (doc as Quotation).quotationNumber || ""
      : (doc as Estimate).estimateNumber || ""
    : !seqReady
      ? ""
      : isQuote
        ? buildDocumentNumber(
            "quotation",
            previewFy.name,
            documentSequenceFor(previewFy.id, "quotation")
          )
        : buildDocumentNumber(
            "estimate",
            previewFy.name,
            documentSequenceFor(previewFy.id, "estimate")
          );

  // The preview must be the SERVER's counter, never a locally minted one. The
  // local cache starts at 1 on a fresh browser and is otherwise never told what
  // the server already handed out, so previewing from it could advertise a
  // number that already exists (this is exactly how a quotation list ending at
  // 003 used to preview as 001). Reconcile ONE kind — the kind this modal owns —
  // for the FY the date actually falls in, whenever that FY changes.
  //
  // `syncServerSequence` is a read-only peek: it never allocates, never reserves
  // and never blocks the form. The authoritative number is allocated by the
  // server inside the create transaction.
  useEffect(() => {
    if (isEdit || !previewFy.id) return;
    void syncServerSequence(previewFy.id, kind);
  }, [isEdit, previewFy.id, kind, syncServerSequence]);

  const [scope, setScope] = useState<string>(
    (doc as Estimate)?.scope || ""
  );
  const [status, setStatus] = useState<string>(
    doc?.status || "Draft"
  );
  const [notes, setNotes] = useState<string>(doc?.notes || "");
  const [terms, setTerms] = useState<string>(
    doc?.terms || companyProfile.invoiceTerms || ""
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    doc?.pricingMode || "inclusive"
  );

  const [items, setItems] = useState<DocLineDraft[]>(() =>
    doc
      ? doc.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          description: it.description,
          hsnSac: it.hsnSac || "",
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          gstRate: it.gstRate,
        }))
      : []
  );

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleClose = () => {
    if (onClose) onClose();
    else setOpenModal(null);
  };

  const dialogRef = useModalBehavior(handleClose);

  // Fix C: async so the wizard cannot close over a row that is still
  // optimistic - the caller receives the persisted record and the modal stays
  // open (with the existing error toast) if the create failed.
  //
  // `submitForm` holds the real work; `handleSubmit` wraps it in the
  // single-flight guard so a rapid double click on Save cannot dispatch two
  // creates (UX protection — the server's entitlement check and its
  // already-exists guard remain authoritative).
  const { isSubmitting, run: runSubmit } = useSubmitGuard();

  // Create-only experience: sample preview + learning tour (first run), the
  // in-form immutability warning, a confirmation dialog before the API call, a
  // loading overlay while it runs, and a success panel with View PDF / view /
  // list actions. Edit mode is not part of this flow.
  const [wantsSample, setWantsSample] = useState(false);
  const [wantConfirm, setWantConfirm] = useState(false);
  const [createdDoc, setCreatedDoc] = useState<Quotation | Estimate | null>(
    null,
  );
  const [firstRunWantsSample] = useState(
    () => !isLearningSeen(kind) && !isLearningDismissed(kind),
  );
  const [learningDismissed] = useState(() => isLearningDismissed(kind));
  useEffect(() => {
    if (!firstRunWantsSample) return;
    const t = window.setTimeout(() => setWantsSample(true), 350);
    return () => window.clearTimeout(t);
  }, [firstRunWantsSample]);

  // Render-level totals preview (also used by the confirmation summary).
  const totalsPreview = calculateInvoiceTotals(
    items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      gstRate: it.gstRate,
    })),
    pricingMode
  );

  const submitForm = async () => {
    if (!selectedCustomer) return;
    if (items.length === 0) return;

    const invoiceItems: InvoiceItem[] = items.map((it) => {
      const line = calculateLineTotals(
        {
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          gstRate: it.gstRate,
        },
        pricingMode
      );
      return {
        id: it.id,
        productId: it.productId,
        description: normalizeBusinessText(it.description) || "ITEM",
        hsnSac: it.hsnSac,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        taxableAmount: line.taxable,
        gstRate: it.gstRate,
        taxAmount: line.taxAmount,
        totalAmount: line.totalAmount,
      };
    });

    const ba = selectedCustomer.billingAddress;
    const customerAddress = [
      ba?.addressLine1,
      ba?.city,
      ba?.state,
      ba?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const snapshot = {
      // Used only for NEW docs; edited docs keep existing number (never
      // renumbered).
      date,
      validUntil,
      scope: scope ? normalizeBusinessText(scope) : undefined,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerGstin: selectedCustomer.gstin,
      customerAddress,
      customerPhone: selectedCustomer.primaryContact?.mobile,
      items: invoiceItems,
      status: status as Quotation["status"],
      notes: notes ? normalizeBusinessText(notes) : "",
      terms: normalizeBusinessText(terms),
    };

    const totals = calculateInvoiceTotals(
      items.map((it) => ({
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        gstRate: it.gstRate,
      })),
      pricingMode
    );

    const snapBase = {
      ...snapshot,
      pricingMode,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
    };

    if (isQuote) {
      if (isEdit && doc) {
        updateQuotation({
          ...(doc as Quotation),
          ...snapBase,
          quotationNumber: (doc as Quotation).quotationNumber,
        });
        handleClose();
        return;
      }
      // No client-minted number: the engine allocates the authoritative one
      // inside the create transaction and ignores this field. `displayedNumber`
      // is a read-only preview and must never be submitted — sending the local
      // preview would let a stale browser counter pick the number, which is how a
      // quotation list ending at 003 could be created as 001.
      // Fix C: await the persisted record and surface the success panel;
      // the modal never closes over an optimistic row.
      const created = await addQuotation({ ...snapBase, quotationNumber: "" });
      if (!created) return;
      setCreatedDoc(created);
    } else {
      if (isEdit && doc) {
        updateEstimate({
          ...(doc as Estimate),
          ...snapBase,
          estimateNumber: (doc as Estimate).estimateNumber,
        });
        handleClose();
        return;
      }
      const created = await addEstimate({ ...snapBase, estimateNumber: "" });
      if (!created) return;
      setCreatedDoc(created);
    }
  };

  // The confirmation is the human gate; submission is single-flight so a
  // double click can never dispatch two creates.
  const confirmCreate = () => {
    setWantConfirm(false);
    void runSubmit(submitForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (isEdit) {
      // Edit mode keeps its existing save path (submission stays single-flight).
      void runSubmit(submitForm);
      return;
    }
    if (!selectedCustomer || items.length === 0) return;
    setWantConfirm(true);
  };

  const closeSample = () => {
    markLearningSeen(kind);
    setWantsSample(false);
  };

  const handleCreatedPdf = async () => {
    if (!createdDoc) return;
    const d = createdDoc;
    const dNumber = isQuote
      ? (d as Quotation).quotationNumber
      : (d as Estimate).estimateNumber;
    const metaRows: DocPdfMetaRow[] = [
      {
        label: isQuote ? "Quotation Date" : "Estimate Date",
        value: d.date,
      },
      ...((d as Quotation).validUntil
        ? [{ label: "Valid Until", value: (d as Quotation).validUntil }]
        : []),
    ];
    const itemsPdf: DocPdfItem[] = d.items.map((it) => ({
      description: it.description,
      hsnSac: it.hsnSac,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      taxableAmount: it.taxableAmount,
      gstRate: it.gstRate,
      totalAmount: it.totalAmount,
    }));
    const opts: RenderDocumentPdfOptions = {
      banner: isQuote ? "Quotation" : "Estimate",
      subtitle: isQuote
        ? "A quotation is not a tax invoice."
        : "An estimate is not a firm quote or a tax invoice.",
      docNumber: dNumber,
      metaRows,
      party: {
        title: isQuote
          ? "Quotation For (Prepared To)"
          : "Estimate For (Prepared To)",
        name: d.customerName,
        address: d.customerAddress,
        phone: d.customerPhone,
        gstin: d.customerGstin,
      },
      items: itemsPdf,
      subtotal: d.subtotal,
      cgst: d.cgst,
      sgst: d.sgst,
      total: d.grandTotal,
      notes: d.notes,
      terms: d.terms,
      footerNote: isQuote
        ? "This quotation is not a tax invoice."
        : "This estimate is not a firm quote or a tax invoice.",
      approximate: !isQuote,
    };
    try {
      await openCreatedDocumentPdf(companyProfile, opts);
    } catch {
      // Popup blocked / render failure: the document list still shows it.
    }
  };

  const totalsLabels: TotalsLabels = isQuote
    ? {
        subtotal: "GST Exclusive Amount",
        cgst: "CGST (9%)",
        sgst: "SGST (9%)",
        total: "Total Including GST",
      }
    : {
        subtotal: "Estimated GST-Exclusive Amount",
        cgst: "Estimated CGST",
        sgst: "Estimated SGST",
        total: "Estimated Total",
      };

  // Create-success panel: the server has persisted the document; offer View
  // PDF (rendered from the created record) / View / Go to list / Close.
  if (createdDoc) {
    const docNumber = isQuote
      ? (createdDoc as Quotation).quotationNumber
      : (createdDoc as Estimate).estimateNumber;
    const listHref = isQuote ? "/quotations" : "/estimates";
    const detailHref = isQuote
      ? `/quotations/${(createdDoc as Quotation).id}`
      : `/estimates/${(createdDoc as Estimate).id}`;
    return (
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-document-title"
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
          <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <h3
                id="sales-document-title"
                className="text-base font-bold text-[#191c1e]"
              >
                {isQuote ? "Quotation" : "Estimate"} Created
              </h3>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close sales document modal"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DocumentCreateSuccess
            kind={kind}
            number={docNumber}
            onViewPdf={handleCreatedPdf}
            onViewDocument={() => {
              handleClose();
              router.push(detailHref);
            }}
            onGoToList={() => {
              handleClose();
              router.push(listHref);
            }}
            onClose={handleClose}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sales-document-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="sales-document-title" className="text-base font-bold text-[#191c1e]">
                {isEdit
                  ? isQuote
                    ? "Edit Quotation"
                    : "Edit Estimate"
                  : isQuote
                    ? "Create New Quotation"
                    : "Create New Estimate"}
              </h3>
              <p className="text-xs text-gray-500">
                {isQuote
                  ? "Select a customer, add line items, and auto-calculate GST for the quoted price."
                  : "Prepare an approximate expected cost estimate. This is NOT a final fixed price."}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close sales document modal"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs"
        >
          {!isEdit && !learningDismissed && (
            <button
              type="button"
              onClick={() => setWantsSample(true)}
              className="self-start inline-flex items-center gap-1.5 text-[#93000b] hover:text-[#770008] border border-[#ecd7d7] hover:border-[#93000b] bg-white rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              View sample {kind === "quotation" ? "quotation" : "estimate"} &amp; learn
            </button>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Select Customer <span className="text-rose-500">*</span>
              </label>
              <SearchablePicker
                items={customers}
                value={customerId}
                onSelect={setCustomerId}
                getLabel={(c) => c.name}
                getSub={(c) =>
                  `GSTIN: ${c.gstin || "-"} · ${c.billingAddress?.city || ""} · ${c.billingAddress?.state || ""}`
                }
                searchText={(c) =>
                  `${c.name} ${c.gstin || ""} ${c.primaryContact?.mobile || ""} ${c.billingAddress?.city || ""} ${c.billingAddress?.state || ""}`
                }
                placeholder="Select customer..."
                emptyText="No customers found. Add a customer first."
                emptyActionLabel="Add Customer"
                onEmptyAction={() => setOpenModal("add-customer")}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {isQuote ? "Quotation Number" : "Estimate Number"}{" "}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                readOnly
                value={displayedNumber}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] rounded-lg outline-none font-mono font-bold uppercase text-gray-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                {isQuote ? "Quotation Date" : "Estimate Date"}{" "}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
              {!isEdit && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Financial Year:{" "}
                  <span className="font-semibold text-gray-700">
                    {fyShortName(previewFy.name)}
                  </span>
                  <span className="text-gray-400"> (from the document date)</span>
                </p>
              )}
              {fyMismatchWarning && !isEdit && (
                <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  {fyMismatchWarning}
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Valid Until
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
          </div>

          {!isQuote && (
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Scope / Work Description
              </label>
              <textarea
                rows={2}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Describe the scope of work being estimated (final scope may vary)..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
              />
            </div>
          )}

          {/* Price Type selector */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 min-w-64">
              <Icon name="percent" className="text-[16px] text-[#93000b]" />
              <label className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                Price Type
              </label>
            </div>
            <select
              value={pricingMode}
              onChange={(e) =>
                setPricingMode(e.target.value as PricingMode)
              }
              className="flex-1 w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
            >
              <option value="inclusive">GST Inclusive</option>
              <option value="exclusive">GST Exclusive</option>
            </select>
            <p className="text-[10px] text-gray-500 sm:max-w-56 sm:text-right">
              {pricingMode === "exclusive"
                ? "Rates above are exclusive of GST — tax is added on top."
                : "Rates above include GST — tax is shown split out."}
            </p>
          </div>

          <LineItemsEditor
            lines={items}
            onChange={setItems}
            products={products}
            onOpenAddProduct={() => setOpenModal("add-product")}
            totalsLabel={totalsLabels}
            approximate={!isQuote}
            pricingMode={pricingMode}
          />

          <div className="flex flex-col sm:flex-row gap-6 pt-2">
            <div className="flex-1 space-y-2">
              <label className="block font-semibold text-gray-700">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value.toUpperCase())}
                placeholder="Additional notes for the customer..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none uppercase"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="block font-semibold text-gray-700">
                Terms &amp; Conditions
              </label>
              <textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value.toUpperCase())}
                placeholder="Payment terms, validity, delivery terms..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none uppercase"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 px-5 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedCustomer || items.length === 0}
              aria-busy={isSubmitting}
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              {/* Fixed-size icon slot: the check and the spinner swap in place
                  so the label change cannot shift the button's width. */}
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isSubmitting ? (
                  <Icon name="progress_activity" className="h-4 w-4 animate-spin text-[16px] leading-none" aria-hidden="true" />
                ) : (
                  <Check className="w-4 h-4" aria-hidden="true" />
                )}
              </span>
              <span>
                {isSubmitting
                  ? isEdit
                    ? "Saving…"
                    : "Creating…"
                  : isEdit
                    ? "Save Changes"
                    : isQuote
                      ? "Save Quotation"
                      : "Save Estimate"}
              </span>
            </button>
          </div>
        </form>

        {wantConfirm && selectedCustomer && (
          <DocumentCreateConfirmation
            kind={kind}
            summary={{
              number: displayedNumber,
              customer: selectedCustomer.name,
              itemCount: items.length,
              total: totalsPreview.grandTotal,
              note: "The financial year is derived from the document date.",
            }}
            isSubmitting={isSubmitting}
            onCancel={() => setWantConfirm(false)}
            onConfirm={confirmCreate}
          >
            <DocumentImmutabilityWarning kind={kind} stacked />
          </DocumentCreateConfirmation>
        )}
        {wantsSample && !isEdit && (
          <DocumentExperienceModal kind={kind} onClose={closeSample} />
        )}
        <DocumentSubmitLoading kind={kind} visible={isSubmitting} />
      </div>
    </div>
  );
};