"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { PurchaseOrder, InvoiceItem, PricingMode } from "@/types";
import { calculateLineTotals, calculateInvoiceTotals, buildDocumentNumber } from "@/lib/invoice";
import { X, Check, Ship } from "lucide-react";
import { LineItemsEditor, DocLineDraft, TotalsLabels } from "@/components/shared/LineItemsEditor";

const STATUS_OPTIONS = [
  "Draft",
  "Sent",
  "Accepted",
  "Partially Received",
  "Received",
  "Cancelled",
];

interface AddPurchaseOrderModalProps {
  po?: PurchaseOrder | null;
  onClose?: () => void;
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export const AddPurchaseOrderModal: React.FC<AddPurchaseOrderModalProps> = ({
  po,
  onClose,
}) => {
  const {
    products,
    addPurchaseOrder,
    updatePurchaseOrder,
    setOpenModal,
    companyProfile,
    getActiveFinancialYear,
    purchaseOrderSequence,
    mintDocumentNumber,
  } = useApp();

  const isEdit = !!po;
  const activeFy = getActiveFinancialYear();
  const fyName = activeFy?.name || "";

  const companyAddress = [
    companyProfile.addressLine1,
    companyProfile.addressLine2,
    companyProfile.city,
    companyProfile.state,
    companyProfile.pincode,
    companyProfile.country,
  ]
    .filter(Boolean)
    .join(", ");

  const today = new Date().toISOString().split("T")[0];
  const displayedNumber = isEdit
    ? po?.poNumber || ""
    : buildDocumentNumber("purchaseOrder", fyName, purchaseOrderSequence);

  const [vendorName, setVendorName] = useState<string>(po?.vendor.name || "");
  const [vendorContact, setVendorContact] = useState<string>(
    po?.vendor.contactPerson || ""
  );
  const [vendorPhone, setVendorPhone] = useState<string>(po?.vendor.phone || "");
  const [vendorEmail, setVendorEmail] = useState<string>(po?.vendor.email || "");
  const [vendorGstin, setVendorGstin] = useState<string>(po?.vendor.gstin || "");
  const [vendorAddress, setVendorAddress] = useState<string>(
    po?.vendor.address || companyAddress
  );
  const [date, setDate] = useState<string>(po?.date || today);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    po?.deliveryDate || addDays(today, 14)
  );
  const [deliveryAddress, setDeliveryAddress] = useState<string>(
    po?.deliveryAddress || companyAddress
  );
  const [deliveryMode, setDeliveryMode] = useState<string>(
    po?.deliveryMode || ""
  );
  const [status, setStatus] = useState<string>(po?.status || "Draft");
  const [notes, setNotes] = useState<string>(po?.notes || "");
  const [terms, setTerms] = useState<string>(
    po?.terms || companyProfile.invoiceTerms || ""
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    po?.pricingMode || "inclusive"
  );

  const [items, setItems] = useState<DocLineDraft[]>(() =>
    po
      ? po.items.map((it) => ({
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

  const handleClose = () => {
    if (onClose) onClose();
    else setOpenModal(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) return;
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

    const totals = calculateInvoiceTotals(
      items.map((it) => ({
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        gstRate: it.gstRate,
      })),
      pricingMode
    );

    const snapshot: Omit<PurchaseOrder, "id" | "createdAt"> = {
      poNumber: isEdit
        ? (po?.poNumber ?? displayedNumber)
        : mintDocumentNumber(companyProfile.invoicePrefix || "PO", "purchaseOrder"),
      vendor: {
        name: vendorName.trim(),
        contactPerson: vendorContact.trim() || undefined,
        email: vendorEmail.trim() || undefined,
        phone: vendorPhone.trim() || undefined,
        gstin: vendorGstin.trim() || undefined,
        address: vendorAddress.trim() || undefined,
      },
      date,
      deliveryDate: deliveryDate || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      deliveryMode: deliveryMode.trim() || undefined,
      items: invoiceItems,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
      status: status as PurchaseOrder["status"],
      pricingMode,
      notes,
      terms,
    };

    if (isEdit && po) {
      updatePurchaseOrder({ ...po, ...snapshot, poNumber: po.poNumber });
    } else {
      addPurchaseOrder(snapshot);
    }
    handleClose();
  };

  const totalsLabels: TotalsLabels = {
    subtotal: "GST Exclusive Amount",
    cgst: "CGST (9%)",
    sgst: "SGST (9%)",
    total: "Total Including GST",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#3730a3] flex items-center justify-center">
              <Ship className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">
                {isEdit ? "Edit Purchase Order" : "Create New Purchase Order"}
              </h3>
              <p className="text-xs text-gray-500">
                An official order issued by you to a supplier. Direction is
                buyer → seller.
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
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#3730a3]">
                local_shipping
              </span>
              <span className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">
                Vendor (Supplier) Details
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-gray-700 mb-1">
                  Vendor Name / Company <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. Shree Radhe Auto Parts"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={vendorContact}
                  onChange={(e) => setVendorContact(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={vendorEmail}
                  onChange={(e) => setVendorEmail(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  GSTIN
                </label>
                <input
                  type="text"
                  value={vendorGstin}
                  onChange={(e) => setVendorGstin(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono uppercase"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-gray-700 mb-1">
                  Vendor Address
                </label>
                <textarea
                  rows={2}
                  value={vendorAddress}
                  onChange={(e) => setVendorAddress(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-white p-4 rounded-xl border border-[#eceef0]">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                PO Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                readOnly
                value={displayedNumber}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] rounded-lg outline-none font-mono font-bold uppercase text-gray-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                PO Date <span className="text-rose-500">*</span>
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
                Delivery Date
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Delivery Mode
              </label>
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none"
              >
                <option value="">Select mode</option>
                {[
                  "Road (Truck)",
                  "Rail",
                  "Air",
                  "Courier",
                  "Own Transport",
                  "Other",
                ].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
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
            <div className="sm:col-span-5">
              <label className="block font-semibold text-gray-700 mb-1">
                Delivery Address
              </label>
              <textarea
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
              />
            </div>
          </div>

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
            approximate={false}
            pricingMode={pricingMode}
          />

          <div className="flex flex-col sm:flex-row gap-6 pt-2">
            <div className="flex-1 space-y-2">
              <label className="block font-semibold text-gray-700">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions for the supplier..."
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
                placeholder="Payment terms, delivery terms, acceptance..."
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
              disabled={!vendorName.trim() || items.length === 0}
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>{isEdit ? "Save Changes" : "Save Purchase Order"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};