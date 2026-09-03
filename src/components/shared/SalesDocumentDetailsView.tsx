"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Quotation, Estimate } from "@/types";
import { ArrowLeft, Download, Printer, ReceiptText } from "lucide-react";
import { DocPrintSheet, PrintItem, PrintMetaRow } from "@/components/shared/DocPrintSheet";
import { SalesDocumentModal } from "@/components/shared/SalesDocumentModal";

type Kind = "quotation" | "estimate";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
  Expired: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_OPTIONS = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

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
    setDeleteConfirm,
  } = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);

  const isQuote = kind === "quotation";
  const doc = isQuote
    ? quotations.find((q) => q.id === params.id)
    : estimates.find((e) => e.id === params.id);

  if (!doc) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-gray-400">
          {isQuote ? "Quotation" : "Estimate"} not found.
        </div>
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

  const handleDownloadPdf = () => {
    addNotification({
      type: "success",
      title: isQuote ? "Quotation PDF Ready" : "Estimate PDF Ready",
      message: `${isQuote ? "Quotation" : "Estimate"} ${docNumber} has been downloaded.`,
    });
  };

  const handleDelete = () => {
    setDeleteConfirm({
      kind: isQuote ? "quotation" : "estimate",
      id: doc.id,
      name: docNumber,
    });
  };

  const handleStatusChange = (status: string) => {
    if (isQuote) updateQuotationStatus(doc.id, status as Quotation["status"]);
    else updateEstimateStatus(doc.id, status as Estimate["status"]);
  };

  const handleConvertToInvoice = () => {
    if (isQuote) convertQuotationToInvoice(doc.id);
    else convertEstimateToInvoice(doc.id);
  };

  const handleConvertToQuotation = () => {
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
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Convert to Invoice"
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>Convert to Invoice</span>
            </button>
          )}
          {!isQuote && !(doc as Estimate).convertedQuotationId && !(doc as Estimate).convertedInvoiceId && (
            <button
              onClick={handleConvertToQuotation}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Convert to Quotation"
            >
              <span className="material-symbols-outlined text-[15px]">
                request_quote
              </span>
              <span>Convert to Quotation</span>
            </button>
          )}
          {!isQuote && !(doc as Estimate).convertedInvoiceId && (
            <button
              onClick={handleConvertToInvoice}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Convert to Invoice"
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>Convert to Invoice</span>
            </button>
          )}

          <select
            value={doc.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-2 rounded-lg text-xs font-semibold outline-none text-gray-700"
            title="Change status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            <span>Edit</span>
          </button>

          <button
            onClick={handlePrint}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>

          <button
            onClick={handleDelete}
            className="p-2 bg-white border border-[#eceef0] hover:bg-rose-50 hover:text-rose-700 text-gray-700 rounded-lg transition-colors"
            title="Delete"
          >
            <span className="material-symbols-outlined text-[18px]">
              delete
            </span>
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
          <span className="material-symbols-outlined text-[16px]">
            request_quote
          </span>
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

      {editing && (
        <SalesDocumentModal
          kind={kind}
          doc={doc}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
};