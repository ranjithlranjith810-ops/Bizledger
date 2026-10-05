"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Invoice } from "@/types";
import {
  calculateInvoiceTotals,
  calculateLineTotals,
  normalizeManualInvoiceNumber,
  resolveTaxType,
} from "@/lib/invoice";
import { stateWithCode } from "@/lib/india";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { useModalBehavior } from "@/components/shared/useModalBehavior";
import { SearchablePicker } from "@/components/invoices/SearchablePicker";
import { validatePrice, validateQuantity, normalizeBusinessText } from "@/lib/validation";
import { X, FileText, Check, ShieldAlert, Lock } from "lucide-react";
import { Icon } from "../ui/Icon";

interface EditableLine {
  id: string;
  productId?: string;
  description: string;
  hsnSac: string;
  unit: string;
  gstRate: number;
  quantity: number;
  unitPrice: number;
}

interface InvoiceEditModalProps {
  invoice: Invoice;
  onClose?: () => void;
}

/**
 * The ONLY post-creation edits an invoice allows (document-edit rule). This
 * modal edits the invoice number and each line's product / quantity / price;
 * every other field (customer, dates, financial year, tax settings, notes,
 * terms, place of supply, snapshots) is LOCKED and shown read-only. Totals are
 * previewed client-side but always recomputed authority-server-side.
 */
export const InvoiceEditModal: React.FC<InvoiceEditModalProps> = ({
  invoice,
  onClose,
}) => {
  const { products, companyProfile, updateInvoice } = useApp();

  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    invoice.invoiceNumber || "",
  );
  const [lines, setLines] = useState<EditableLine[]>(() =>
    invoice.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      description: it.description,
      hsnSac: it.hsnSac || "",
      unit: it.unit,
      gstRate: it.gstRate,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  const close = () => {
    if (onClose) onClose();
  };

  const dialogRef = useModalBehavior(close);

  const sellerStateCode = (() => {
    const m = /\((\d+)\)/.exec(stateWithCode(companyProfile.state));
    return m ? m[1] : "";
  })();
  const taxType = resolveTaxType(sellerStateCode, invoice.placeOfSupplyCode || "");

  const totals = calculateInvoiceTotals(
    lines.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      gstRate: it.gstRate,
    })),
    invoice.pricingMode,
    taxType,
  );

  const replaceProduct = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    setLines((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              productId: prod.id,
              description: normalizeBusinessText(prod.name),
              hsnSac: prod.hsnSac,
              unit: prod.unit || "Pcs",
              gstRate: prod.gstRate,
            }
          : it,
      ),
    );
  };

  const updateLine = (
    index: number,
    patch: Partial<EditableLine>,
  ) => {
    setLines((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  };

  const submit = async () => {
    if (lines.length === 0) {
      setError("An invoice needs at least one line item.");
      return;
    }
    const parsed = normalizeManualInvoiceNumber(invoiceNumber);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    for (const it of lines) {
      const qty = validateQuantity().validate(String(it.quantity));
      const price = validatePrice().validate(String(it.unitPrice));
      if (qty || price) {
        setError(qty || price || "");
        return;
      }
    }
    if (
      parsed.value === invoice.invoiceNumber &&
      lines.every(
        (it, i) =>
          it.productId === (invoice.items[i]?.productId ?? undefined) &&
          it.quantity === invoice.items[i]?.quantity &&
          it.unitPrice === invoice.items[i]?.unitPrice,
      )
    ) {
      // Nothing changed: a no-op save (also the server treats it as a no-op).
      close();
      return;
    }
    setError(null);

    const updated: Invoice = {
      ...invoice,
      invoiceNumber: parsed.value,
      items: lines.map((it) => {
        const line = calculateLineTotals(
          { quantity: it.quantity, unitPrice: it.unitPrice, gstRate: it.gstRate },
          invoice.pricingMode,
          taxType,
        );
        return {
          id: it.id,
          productId: it.productId,
          description: it.description || "ITEM",
          hsnSac: it.hsnSac || undefined,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          taxableAmount: line.taxable,
          gstRate: it.gstRate,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
        };
      }),
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
    };
    const ok = await updateInvoice(updated);
    if (ok) close();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(submit);
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-edit-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eef6ff] text-[#0057c8] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="invoice-edit-title" className="text-base font-bold text-[#191c1e]">
                Edit Tax Invoice
              </h3>
              <p className="text-xs text-gray-500">
                Only the invoice number, product, quantity and price are
                editable — everything else is locked.
              </p>
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close invoice edit dialog"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5 text-xs"
        >
          <div className="flex items-start gap-2.5 bg-[#fef2f2] border border-rose-200 text-[#93000b] rounded-xl px-4 py-3">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold block">
                Customer, dates and tax settings are locked.
              </span>
              <p className="text-rose-700 mt-0.5">
                The customer, invoice date, due date, financial year, tax
                settings, notes and terms cannot be changed after creation.
                Totals are recalculated automatically by the server.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs"
            >
              {error}
            </div>
          )}

          {/* Locked summary (read-only) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Customer <Lock className="inline w-3 h-3 ml-1 text-gray-400" aria-hidden="true" />
              </label>
              <div className="py-2 px-3 bg-white border border-[#eceef0] rounded-lg text-gray-800">
                {invoice.customerName}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Invoice Date <Lock className="inline w-3 h-3 ml-1 text-gray-400" aria-hidden="true" />
              </label>
              <div className="py-2 px-3 bg-white border border-[#eceef0] rounded-lg text-gray-800">
                {invoice.date}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Due Date <Lock className="inline w-3 h-3 ml-1 text-gray-400" aria-hidden="true" />
              </label>
              <div className="py-2 px-3 bg-white border border-[#eceef0] rounded-lg text-gray-800">
                {invoice.dueDate || "-"}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Place of Supply <Lock className="inline w-3 h-3 ml-1 text-gray-400" aria-hidden="true" />
              </label>
              <div className="py-2 px-3 bg-white border border-[#eceef0] rounded-lg text-gray-800">
                {invoice.placeOfSupply || "-"}
              </div>
            </div>
          </div>

          {/* Editable: number */}
          <div className="max-w-xs">
            <label className="block font-semibold text-gray-700 mb-1">
              Invoice Number
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => {
                setInvoiceNumber(e.target.value);
                if (error) setError(null);
              }}
              className="w-full rounded-xl border border-[#d8dcdf] px-3 py-2.5 font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-[#0057c8]/30"
              placeholder="e.g. INV/FY26-27/0042"
              maxLength={64}
              autoFocus
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Must be unique within this business.
            </p>
          </div>

          {/* Editable: product / quantity / price per line */}
          <fieldset className="min-w-0 p-0 m-0 border-0 space-y-3">
            <h4 className="font-bold text-[#191c1e] uppercase tracking-wider text-xs">
              Line Items — product, quantity &amp; price
            </h4>
            <div className="bg-[#f7f9fb] border border-[#eceef0] rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead className="bg-white border-b border-[#eceef0] text-gray-600 font-semibold text-[11px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">HSN</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3">Unit</th>
                    <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                    <th className="py-2.5 px-3 text-right">GST %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef0]">
                  {lines.map((it, idx) => (
                    <tr key={it.id} className="bg-white">
                      <td className="py-2 px-3 min-w-56">
                        <SearchablePicker
                          items={products}
                          value={it.productId || ""}
                          onSelect={(id) => replaceProduct(idx, id)}
                          getLabel={(p) => p.name}
                          getSub={(p) =>
                            `₹${p.unitPrice}/${p.unit} · GST ${p.gstRate}%`
                          }
                          searchText={(p) =>
                            `${p.name} ${p.sku} ${p.hsnSac} ${p.category}`
                          }
                          placeholder="Replace product…"
                          emptyText="No products found."
                        />
                      </td>
                      <td className="py-2 px-3 text-gray-700 min-w-48">
                        {it.description}
                      </td>
                      <td className="py-2 px-3 font-mono text-gray-600">
                        {it.hsnSac || "-"}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={it.quantity}
                          onChange={(e) =>
                            updateLine(idx, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          aria-label={`Quantity for line ${idx + 1}`}
                          className="w-20 py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs text-right font-mono font-bold outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-gray-600">{it.unit}</td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) =>
                            updateLine(idx, {
                              unitPrice: parseFloat(e.target.value) || 0,
                            })
                          }
                          aria-label={`Rate for line ${idx + 1}`}
                          className="w-24 py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs text-right font-mono font-bold outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-gray-700">
                        {it.gstRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-500">
              Changing the product refreshes its name, HSN, unit and GST from
              your product master. Line order and the count of lines stay fixed.
            </p>
          </fieldset>

          {/* Totals preview (authoritative values are recomputed server-side) */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-2 sm:ml-auto sm:max-w-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">GST Exclusive Amount</span>
              <span className="font-mono font-semibold">
                ₹{totals.subtotal.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">
                {taxType === "interstate" ? "IGST" : "CGST + SGST"}
              </span>
              <span className="font-mono font-semibold">
                ₹{totals.totalTax.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="font-bold text-[#93000b]">Total Including GST</span>
              <span className="font-mono font-bold text-[#93000b] text-base">
                ₹{totals.grandTotal.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={close}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 px-5 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isSubmitting ? (
                  <Icon name="progress_activity" className="h-4 w-4 animate-spin text-[16px] leading-none" aria-hidden="true" />
                ) : (
                  <Check className="w-4 h-4" aria-hidden="true" />
                )}
              </span>
              <span>{isSubmitting ? "Saving…" : "Save Changes"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};