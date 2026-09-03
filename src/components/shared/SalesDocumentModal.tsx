"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Quotation, Estimate, InvoiceItem, PricingMode } from "@/types";
import { calculateLineTotals, calculateInvoiceTotals, buildDocumentNumber } from "@/lib/invoice";
import { X, Check, FileText } from "lucide-react";
import { SearchablePicker } from "@/components/invoices/SearchablePicker";
import { LineItemsEditor, DocLineDraft, TotalsLabels } from "@/components/shared/LineItemsEditor";

type Kind = "quotation" | "estimate";

interface SalesDocumentModalProps {
  kind: Kind;
  doc?: Quotation | Estimate | null;
  onClose?: () => void;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
    quotationSequence,
    estimateSequence,
    mintDocumentNumber,
  } = useApp();

  const isEdit = !!doc;
  const isQuote = kind === "quotation";
  const activeFy = getActiveFinancialYear();
  const fyName = activeFy?.name || "";

  // Preview document number: a NEW doc uses the current per-type sequence and
  // the ACTIVE financial year; an edited doc keeps its existing number.
  const displayedNumber = isEdit
    ? isQuote
      ? (doc as Quotation).quotationNumber || ""
      : (doc as Estimate).estimateNumber || ""
    : isQuote
      ? buildDocumentNumber("quotation", fyName, quotationSequence)
      : buildDocumentNumber("estimate", fyName, estimateSequence);

  const [customerId, setCustomerId] = useState<string>(
    doc?.customerId || ""
  );
  const [date, setDate] = useState<string>(
    doc?.date || new Date().toISOString().split("T")[0]
  );
  const [validUntil, setValidUntil] = useState<string>(
    (doc as Quotation | Estimate)?.validUntil || addDays(date, 30)
  );
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        description: it.description?.trim() || "Item",
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
      scope: scope || undefined,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerGstin: selectedCustomer.gstin,
      customerAddress,
      customerPhone: selectedCustomer.primaryContact?.mobile,
      items: invoiceItems,
      status: status as Quotation["status"],
      notes,
      terms,
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
      } else {
        // Submit-time mint (rollover idempotent) so the stored number is the
        // reconciled one even across the 31-Mar -> 1-Apr boundary.
        const finalNumber = mintDocumentNumber(companyProfile.invoicePrefix || "QT", "quotation");
        addQuotation({
          ...snapBase,
          quotationNumber: finalNumber,
        });
      }
    } else {
      if (isEdit && doc) {
        updateEstimate({
          ...(doc as Estimate),
          ...snapBase,
          estimateNumber: (doc as Estimate).estimateNumber,
        });
      } else {
        const finalNumber = mintDocumentNumber(companyProfile.invoicePrefix || "EST", "estimate");
        addEstimate({
          ...snapBase,
          estimateNumber: finalNumber,
        });
      }
    }
    handleClose();
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">
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
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs"
        >
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
              <span className="material-symbols-outlined text-[16px] text-[#93000b]">
                percent
              </span>
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
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for the customer..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="block font-semibold text-gray-700">
                Terms &amp; Conditions
              </label>
              <textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Payment terms, validity, delivery terms..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
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
              disabled={!selectedCustomer || items.length === 0}
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>
                {isEdit
                  ? "Save Changes"
                  : isQuote
                    ? "Save Quotation"
                    : "Save Estimate"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};