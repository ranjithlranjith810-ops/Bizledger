"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { PurchaseOrder, InvoiceItem, PricingMode } from "@/types";
import { calculateLineTotals, calculateInvoiceTotals, buildDocumentNumber } from "@/lib/invoice";
import { financialYearForDate, matchFinancialYear } from "@/lib/financialYear";
import { localDateString, parseLocalDate } from "@/lib/dates";
import { fyShortName } from "@/lib/utils";
import { X, Check, Ship, GraduationCap } from "lucide-react";
import { LineItemsEditor, DocLineDraft, TotalsLabels } from "@/components/shared/LineItemsEditor";
import { useModalBehavior } from "@/components/shared/useModalBehavior";
import { normalizeBusinessText } from "@/lib/validation";
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
import type { DocPdfItem, DocPdfMetaRow } from "@/lib/print/document-pdf";
import { Icon } from "../ui/Icon";

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
  const d = parseLocalDate(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return localDateString(d);
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
    financialYears,
    documentSequenceFor,
    isServerSequenceReady,
    syncServerSequence,
  } = useApp();

  const isEdit = !!po;
  const activeFy = getActiveFinancialYear();
  const router = useRouter();

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

  const today = localDateString();
  const [date, setDate] = useState<string>(po?.date || today);

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

  // Nothing is shown until the server has confirmed this (FY, kind) counter; the
  // only earlier value is the localStorage seed, which starts at 1 on a fresh
  // browser and can be arbitrarily wrong.
  const seqReady = isServerSequenceReady(previewFy.id, "purchaseOrder");
  const displayedNumber = isEdit
    ? po?.poNumber || ""
    : !seqReady
      ? ""
      : buildDocumentNumber(
          "purchaseOrder",
          previewFy.name,
          documentSequenceFor(previewFy.id, "purchaseOrder")
        );

  // The preview must be the SERVER's counter, never a locally minted one. The
  // local cache starts at 1 on a fresh browser and is otherwise never told what
  // the server already handed out, so previewing from it can advertise a number
  // that already exists. Reconcile ONE kind — purchase orders only — for the FY
  // the document date actually falls in, whenever that FY changes.
  //
  // `syncServerSequence` is a read-only peek: it never allocates, never reserves
  // and never blocks the form. The authoritative number is allocated by the
  // server inside the create transaction.
  useEffect(() => {
    if (isEdit || !previewFy.id) return;
    void syncServerSequence(previewFy.id, "purchaseOrder");
  }, [isEdit, previewFy.id, syncServerSequence]);

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

  const dialogRef = useModalBehavior(handleClose);

  // Fix C: async so the modal closes only after the persisted purchase order
  // exists (see AddInvoiceModal.handleSubmit).
  //
  // `submitForm` holds the real work; `handleSubmit` wraps it in the
  // single-flight guard so a rapid double click cannot dispatch two purchase
  // order creates.
  const { isSubmitting, run: runSubmit } = useSubmitGuard();

  // Create-only experience: sample preview + learning tour (first run), the
  // in-form immutability warning, a confirmation dialog before the API call, a
  // loading overlay while it runs, and a success panel with View PDF / view /
  // list actions. Edit mode is not part of this flow.
  const [wantsSample, setWantsSample] = useState(false);
  const [wantConfirm, setWantConfirm] = useState(false);
  const [createdPo, setCreatedPo] = useState<PurchaseOrder | null>(null);
  const [firstRunWantsSample] = useState(
    () => !isLearningSeen("purchaseOrder") && !isLearningDismissed("purchaseOrder"),
  );
  const [learningDismissed] = useState(() => isLearningDismissed("purchaseOrder"));
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

    const totals = calculateInvoiceTotals(
      items.map((it) => ({
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        gstRate: it.gstRate,
      })),
      pricingMode
    );

    const snapshot: Omit<PurchaseOrder, "id" | "createdAt"> = {
      // An edit keeps its own number; a create sends NO client number so the
      // engine allocates the authoritative one inside the create transaction.
      // `displayedNumber` is a read-only preview and must never be submitted.
      // (The engine already ignores this field on create, so minting here was
      // dead weight that only ever misled the user.)
      poNumber: isEdit ? (po?.poNumber ?? displayedNumber) : "",
      vendor: {
        name: normalizeBusinessText(vendorName),
        contactPerson: normalizeBusinessText(vendorContact) || undefined,
        email: vendorEmail.trim() || undefined,
        phone: vendorPhone.trim() || undefined,
        gstin: vendorGstin.trim().toUpperCase(),
        address: normalizeBusinessText(vendorAddress) || undefined,
      },
      date,
      deliveryDate: deliveryDate || undefined,
      deliveryAddress: normalizeBusinessText(deliveryAddress) || undefined,
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
      notes: notes ? normalizeBusinessText(notes) : "",
      terms: normalizeBusinessText(terms),
    };

    if (isEdit && po) {
      updatePurchaseOrder({ ...po, ...snapshot, poNumber: po.poNumber });
      handleClose();
      return;
    }
    // Fix C: only surface success once the server returned a persisted order.
    const created = await addPurchaseOrder(snapshot);
    if (!created) return;
    setCreatedPo(created);
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
      void runSubmit(submitForm);
      return;
    }
    if (!vendorName.trim() || items.length === 0) return;
    setWantConfirm(true);
  };

  const closeSample = () => {
    markLearningSeen("purchaseOrder");
    setWantsSample(false);
  };

  const handleCreatedPdf = async () => {
    if (!createdPo) return;
    const d = createdPo;
    const metaRows: DocPdfMetaRow[] = [
      { label: "PO Date", value: d.date },
      ...(d.deliveryDate ? [{ label: "Delivery Date", value: d.deliveryDate }] : []),
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
    try {
      await openCreatedDocumentPdf(companyProfile, {
        banner: "Purchase Order",
        subtitle: "An official order issued by you to a supplier (buyer → seller).",
        docNumber: d.poNumber,
        metaRows,
        party: {
          title: "Vendor (Supplier)",
          name: d.vendor.name,
          address: d.vendor.address,
          phone: d.vendor.phone,
          gstin: d.vendor.gstin,
        },
        deliveryBlock: {
          deliveryDate: d.deliveryDate,
          deliveryAddress: d.deliveryAddress,
          deliveryMode: d.deliveryMode,
        },
        items: itemsPdf,
        subtotal: d.subtotal,
        cgst: d.cgst,
        sgst: d.sgst,
        total: d.grandTotal,
        notes: d.notes,
        terms: d.terms,
        footerNote: "This purchase order is not a tax invoice.",
      });
    } catch {
      // Popup blocked / render failure: the list still shows it.
    }
  };


  const totalsLabels: TotalsLabels = {
    subtotal: "GST Exclusive Amount",
    cgst: "CGST (9%)",
    sgst: "SGST (9%)",
    total: "Total Including GST",
  };

  // Create-success panel: the server has persisted the purchase order; offer
  // View PDF (rendered from the created record) / View / Go to list / Close.
  if (createdPo) {
    return (
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-order-title"
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
          <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#3730a3] flex items-center justify-center">
                <Ship className="w-5 h-5" />
              </div>
              <h3
                id="purchase-order-title"
                className="text-base font-bold text-[#191c1e]"
              >
                Purchase Order Created
              </h3>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close purchase order dialog"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DocumentCreateSuccess
            kind="purchaseOrder"
            number={createdPo.poNumber}
            onViewPdf={handleCreatedPdf}
            onViewDocument={() => {
              handleClose();
              router.push(`/purchase-orders/${createdPo.id}`);
            }}
            onGoToList={() => {
              handleClose();
              router.push("/purchase-orders");
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
      aria-labelledby="purchase-order-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#3730a3] flex items-center justify-center">
              <Ship className="w-5 h-5" />
            </div>
            <div>
              <h3 id="purchase-order-title" className="text-base font-bold text-[#191c1e]">
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
            aria-label="Close purchase order dialog"
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
              View sample purchase order &amp; learn
            </button>
          )}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2">
              <Icon name="local_shipping" className="text-[16px] text-[#3730a3]" />
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
                  onChange={(e) => setVendorName(e.target.value.toUpperCase())}
                  placeholder="e.g. Shree Radhe Auto Parts"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none uppercase"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={vendorContact}
                  onChange={(e) => setVendorContact(e.target.value.toUpperCase())}
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none uppercase"
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
            approximate={false}
            pricingMode={pricingMode}
          />

          <div className="flex flex-col sm:flex-row gap-6 pt-2">
            <div className="flex-1 space-y-2">
              <label className="block font-semibold text-gray-700">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value.toUpperCase())}
                placeholder="Special instructions for the supplier..."
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
                placeholder="Payment terms, delivery terms, acceptance..."
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
                disabled={isSubmitting || !vendorName.trim() || items.length === 0}
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
                      : "Save Purchase Order"}
                </span>
              </button>
          </div>
        </form>

        {wantConfirm && (
          <DocumentCreateConfirmation
            kind="purchaseOrder"
            summary={{
              number: displayedNumber,
              customer: vendorName.trim(),
              itemCount: items.length,
              total: totalsPreview.grandTotal,
              note: "The financial year is derived from the PO date.",
            }}
            isSubmitting={isSubmitting}
            onCancel={() => setWantConfirm(false)}
            onConfirm={confirmCreate}
          >
            <DocumentImmutabilityWarning kind="purchaseOrder" stacked />
          </DocumentCreateConfirmation>
        )}
        {wantsSample && !isEdit && (
          <DocumentExperienceModal
            kind="purchaseOrder"
            onClose={closeSample}
          />
        )}
        <DocumentSubmitLoading kind="purchaseOrder" visible={isSubmitting} />
      </div>
    </div>
  );
};