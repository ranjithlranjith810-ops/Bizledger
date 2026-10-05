"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Invoice, InvoiceItem, InvoiceStatus, PricingMode } from "@/types";
import {
  calculateInvoiceTotals,
  calculateLineTotals,
  buildInvoiceNumber,
  resolveTaxType,
} from "@/lib/invoice";
import { stateWithCode, INDIAN_STATES } from "@/lib/india";
import { getEWayBillComplianceStatus } from "@/lib/compliance";
import { financialYearForDate, matchFinancialYear } from "@/lib/financialYear";
import { localDateString, parseLocalDate } from "@/lib/dates";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { fyShortName } from "@/lib/utils";
import {
  validateName,
  validateGstin,
  validateHsnSAC,
  validatePrice,
  validateQuantity,
  validateGstRate,
  validateVehicleNumber,
  normalizeBusinessText,
} from "@/lib/validation";
import { X, FileText, Trash2, Check, Truck, ShieldAlert, GraduationCap } from "lucide-react";
import { useModalBehavior } from "@/components/shared/useModalBehavior";
import { SearchablePicker } from "@/components/invoices/SearchablePicker";
import { InvoiceEditModal } from "@/components/invoices/InvoiceEditModal";
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
import { openCreatedInvoicePdf } from "@/lib/open-document-pdf";
import { Icon } from "../ui/Icon";

interface LineDraft {
  id: string;
  productId?: string;
  description: string;
  hsnSac: string;
  quantity: number;
  unit: string;
  unitPrice: number; // per-unit price entered (mode-aware incl./excl. GST)
  gstRate: number;
}

function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

interface AddInvoiceModalProps {
  invoice?: Invoice | null;
  onClose?: () => void;
}

export const AddInvoiceModal: React.FC<AddInvoiceModalProps> = ({
  invoice,
  onClose,
}) => {
  const {
    customers,
    products,
    vehicles,
    addInvoice,
    setOpenModal,
    companyProfile,
    getActiveFinancialYear,
    financialYears,
    documentSequenceFor,
    isServerSequenceReady,
    syncServerSequence,
    canCreateResource,
  } = useApp();
  const router = useRouter();
  const isEdit = !!invoice;

  const activeFy = getActiveFinancialYear();
  const [complianceError, setComplianceError] = useState<string | null>(null);

  const validateContact = (cust: { name: string; gstin?: string }): string | null => {
    const nameMsg = validateName("Customer name").validate(cust.name);
    if (nameMsg) return nameMsg;
    if (cust.gstin) {
      const gstinMsg = validateGstin().validate(cust.gstin);
      if (gstinMsg) return gstinMsg;
    }
    return null;
  };

  const [customerId, setCustomerId] = useState<string>(
    invoice?.customerId || ""
  );
  const [date, setDate] = useState<string>(
    invoice?.date || localDateString()
  );

  // F11 — the financial year is derived from the DOCUMENT DATE (the date is
  // authoritative; the server re-derives and verifies it). The number preview
  // therefore uses the FY containing the selected date and that year's counter,
  // so it can never visually suggest a mismatched fiscal year.
  const derivedFy = financialYearForDate(parseLocalDate(date) ?? new Date());
  const derivedFyRow = matchFinancialYear(financialYears, derivedFy);
  const previewFy = derivedFyRow ?? derivedFy;
  // Cross-year warning: when the date's FY is not the active FY (or no
  // configured FY covers the date), the create will be rejected server-side.
  const activeFyIdUi = activeFy?.id ?? null;
  const fyMismatchWarning =
    !derivedFyRow
      ? `This date falls outside every configured financial year (it belongs to ${fyShortName(
          derivedFy.name,
        )}). The financial year is derived from the invoice date, so saving will be rejected.`
      : derivedFyRow.id !== activeFyIdUi
        ? `This date belongs to ${fyShortName(
            derivedFy.name,
          )}, but the active financial year is ${activeFy ? fyShortName(activeFy.name) : "unset"}. The financial year is derived from the invoice date and cannot be changed separately — saving will be rejected.`
        : null;
  const [placeOfSupply, setPlaceOfSupply] = useState<string>(
    invoice?.placeOfSupply || "Tamil Nadu (33)"
  );
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState<string>(
    () => {
      // P1-2: keep state + code synchronised. When editing an existing invoice we
      // preserve the stored values; when creating, the default is "Tamil Nadu (33)",
      // which must carry its matching code so the pair is always consistent.
      const init = invoice?.placeOfSupplyCode;
      if (init && init.trim() !== "") return init;
      const source = invoice?.placeOfSupply || "Tamil Nadu (33)";
      const codeMatch = /\((\d+)\)/.exec(source);
      return codeMatch ? codeMatch[1] : "";
    }
  );
  const [status, setStatus] = useState<InvoiceStatus>(
    invoice?.status || "Pending"
  );
  const [notes, setNotes] = useState<string>(invoice?.notes || "");
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    invoice?.pricingMode || "inclusive"
  );

  // Vehicle dispatch block (optional).
  const [vehicleNumber, setVehicleNumber] = useState<string>(
    invoice?.vehicle?.vehicleNumber || ""
  );
  const [driverName, setDriverName] = useState<string>(
    invoice?.vehicle?.driverName || ""
  );
  const [vehicleStatus, setVehicleStatus] = useState<string>(
    invoice?.vehicle?.status || "Loaded"
  );

  const [items, setItems] = useState<LineDraft[]>(() =>
    invoice
      ? invoice.items.map((it) => ({
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

  // Issued invoices (anything that left Draft) are financially frozen
  // server-side; mirror that lock in the UI so the user cannot configure
  // financial changes that the server will reject with a 409.
  const financialLocked = !!invoice && invoice.status !== "Draft";

  // INVOICE NUMBER — server-assigned only.
//
// A preview is only ever an estimate: another browser (or another user) can
// consume the same number at any moment, which is exactly how a form ends up
// offering a number that already exists. The create form therefore NEVER sends
// a number. The server allocates the authoritative one inside the create
// transaction (see invoice-service.createInvoice, which always calls
// allocateDocumentNumber), reconciled against the highest number that already
// exists for this business + financial year.
//
// A number that must be chosen by hand is an EDIT-time concern, handled by the
// existing Invoice Number edit functionality after the invoice exists — not by
// the create form. Keeping a manual entry point here meant the form could offer
// a number the allocator was never going to honour.
  //
  // The number shown below is a read-only PREVIEW of what the server will
  // assign. It stays BLANK until the server confirms this (FY, kind) counter, so
  // the form can never flash the localStorage seed (which starts at 1 on a fresh
  // browser).
  const invoiceSeqReady = isServerSequenceReady(previewFy.id, "invoice");
  const displayedInvoiceNumber = isEdit
    ? invoice?.invoiceNumber || ""
    : !invoiceSeqReady
      ? ""
      : buildInvoiceNumber(
          companyProfile.invoicePrefix || "INV",
          previewFy.name,
          documentSequenceFor(previewFy.id, "invoice"),
        );

  // The preview must come from the server's counter, not the local cache. The
  // cache starts at 1 on a fresh browser and is otherwise never told what the
  // server already handed out, so it could preview a number that already
// existed. Reconcile the FY this form is actually previewing (derived from the
    // document date, so it can differ from the active FY) whenever it changes.
  // `syncServerSequence` only reads; allocation stays in the create transaction.
  useEffect(() => {
    if (isEdit || !previewFy.id) return;
    void syncServerSequence(previewFy.id, "invoice");
  }, [isEdit, previewFy.id, syncServerSequence]);

  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust && cust.billingAddress?.state) {
      const full = stateWithCode(cust.billingAddress.state);
      setPlaceOfSupply(full);
      const codeMatch = /\((\d+)\)/.exec(full);
      setPlaceOfSupplyCode(codeMatch ? codeMatch[1] : "");
    }
  };

  const addProductLine = (prod: (typeof products)[number]) => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length}`,
        productId: prod.id,
        description: normalizeBusinessText(prod.name),
        hsnSac: prod.hsnSac,
        quantity: 1,
        unit: prod.unit || "Pcs",
        unitPrice: prod.unitPrice,
        gstRate: prod.gstRate,
      },
    ]);
  };

  const handleVehicleSelect = (id: string) => {
    const veh = vehicles.find((v) => v.id === id);
    if (veh) {
      setVehicleNumber(veh.registrationNumber);
      setDriverName(veh.driverName || "");
      setVehicleStatus("Loaded");
    }
  };

  const handleItemChange = (
    index: number,
    field: keyof LineDraft,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              [field]:
                field === "description" || field === "hsnSac"
                  ? String(value).toUpperCase()
                  : value,
            }
          : it
      )
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Live GST-inclusive calculation using the ONE shared function. The tax split
  // (CGST+SGST vs IGST) is derived from the seller's state code vs the place of
  // supply code so inter-state invoices classify tax correctly.
  const sellerStateCode = (() => {
    const m = /\((\d+)\)/.exec(stateWithCode(companyProfile.state));
    return m ? m[1] : "";
  })();
  const taxType = resolveTaxType(sellerStateCode, placeOfSupplyCode);
  const totalTaxGstRate = items.length
    ? Math.max(...items.map((it) => Number(it.gstRate) || 0))
    : 0;

  const totals = calculateInvoiceTotals(
    items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      gstRate: it.gstRate,
    })),
    pricingMode,
    taxType
  );

  const compliance = getEWayBillComplianceStatus(totals.grandTotal);

  // Fix C: async so the modal only closes once the server has returned the
  // persisted invoice. Closing on the optimistic row would let the user act on
  // a temp id that has no database row behind it.
  //
  // `submitForm` holds the real work; `handleSubmit` wraps it in the
  // single-flight guard so a rapid double click cannot dispatch two invoice
  // creates (UX protection — the server's invoice entitlement check inside the
  // create transaction remains authoritative).
  const { isSubmitting, run: runSubmit } = useSubmitGuard();

  // The invoice is created-and-frozen. The full GST form below is CREATE-only;
  // editing opens InvoiceEditModal (number + product/quantity/price only).
  // Before a create is dispatched we show a confirmation; while it runs a
  // loading overlay; on success a panel (View PDF / View / Go to list); on a
  // server 409 a duplicate-number dialog. First-run surfaces the sample
  // preview + learning tour once per browser.
  const [wantsSample, setWantsSample] = useState(false);
  const [wantConfirm, setWantConfirm] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [firstRunWantsSample] = useState(
    () => !isLearningSeen("invoice") && !isLearningDismissed("invoice"),
  );
  const [learningDismissed] = useState(() => isLearningDismissed("invoice"));
  useEffect(() => {
    if (!firstRunWantsSample) return;
    const t = window.setTimeout(() => setWantsSample(true), 350);
    return () => window.clearTimeout(t);
  }, [firstRunWantsSample]);

  const validateForm = (): boolean => {
    if (!selectedCustomer) {
      setComplianceError("Select a customer to continue.");
      return false;
    }
    if (items.length === 0) {
      setComplianceError("Add at least one line item.");
      return false;
    }
    // Field-level validation (UX only; re-enforced server-side later).
    for (const it of items) {
      const hsn = it.hsnSac ? validateHsnSAC(true).validate(it.hsnSac) : null;
      const qty = validateQuantity().validate(String(it.quantity));
      const price = validatePrice().validate(String(it.unitPrice));
      const gst = validateGstRate().validate(String(it.gstRate));
      if (hsn || qty || price || gst) {
        setComplianceError(hsn || qty || price || gst || "");
        return false;
      }
    }
    if (vehicleNumber.trim()) {
      const veh = validateVehicleNumber(true).validate(vehicleNumber);
      if (veh) {
        setComplianceError(veh);
        return false;
      }
    }
    const contactErr = validateContact(selectedCustomer);
    if (contactErr) {
      setComplianceError(contactErr);
      return false;
    }
    setComplianceError(null);
    return true;
  };

  const submitForm = async () => {
    if (!validateForm()) return;
    // validateForm guarantees a selection; capture for TypeScript narrowing.
    const cust = selectedCustomer;
    if (!cust) return;

    const invoiceItems: InvoiceItem[] = items.map((it) => {
      const line = calculateLineTotals(
        {
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          gstRate: it.gstRate,
        },
        pricingMode,
        taxType
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

    // Auto-populate receiver snapshot from the selected customer.
    const ba = cust.billingAddress;
    const customerAddress = [
      ba?.addressLine1,
      ba?.city,
      ba?.state,
      ba?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    // The number the request carries. The create form NEVER sends one: the client
    // must not pre-mint a counter value, because doing so produced a client/server
    // split where the form could present a number the server would never issue,
    // and it advanced a local counter that has no authority. An empty string is
    // the explicit "server, you decide" signal, so the server allocates the
    // authoritative number inside the create transaction.
    const finalNumber = "";

    const base = {
      invoiceNumber: finalNumber,
      customerId: cust.id,
      customerName: cust.name,
      customerGstin: cust.gstin,
      customerAddress,
      customerPhone: cust.primaryContact?.mobile,
      date,
      dueDate: addDays(date, 15),
      placeOfSupply,
      placeOfSupplyCode,
      vehicle:
        vehicleNumber.trim() || driverName.trim()
          ? {
              vehicleNumber: vehicleNumber.trim() || undefined,
              driverName: normalizeBusinessText(driverName) || undefined,
              status: vehicleStatus,
            }
          : undefined,
      items: invoiceItems,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
      ewayBillNumber: invoice?.ewayBillNumber,
      ewayBillDate: invoice?.ewayBillDate,
      status,
      pricingMode,
      notes:
        notes
          ? normalizeBusinessText(notes.replace(/<[^>]*>/g, "")).slice(0, 1000) ||
            undefined
          : undefined,
    };

    const created = await addInvoice(base);
    if (created.status === "created") {
      // Close the confirmation first so the success panel mounts cleanly.
      setCreatedInvoice(created.invoice);
    }
    // "duplicate" can no longer come from a create: no number is submitted, so
    // the server allocates one it has already reserved. "failed" is already
    // toasted. Either way the form stays open so the user can try again.

    // Re-reconcile against the server after every attempt, success or failure.
    // A create that rolls back (e.g. insufficient stock) or that allocated a
    // number the server then issued differently leaves the local cache out of
    // step, and the preview is a display aid, so it is simply re-read. This is
    // the only thing that keeps the preview honest: the form never advances the
    // counter itself, and it never assumes the number it showed was kept.
    void syncServerSequence(previewFy.id, "invoice");
  };

  // Submission is single-flight (useSubmitGuard); the confirmation dialog is
  // the human gate before the API call, so a double view of the dialog or a
  // double click can never dispatch two creates.
  const confirmCreate = () => {
    setWantConfirm(false);
    void runSubmit(submitForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validateForm()) return;
    setWantConfirm(true);
  };

  const closeSample = () => {
    markLearningSeen("invoice");
    setWantsSample(false);
  };

  const close = () => {
    if (onClose) onClose();
    else setOpenModal(null);
  };

  const dialogRef = useModalBehavior(close);

  // DOCUMENT IMMUTABILITY: an invoice is created-and-frozen. Editing an existing
  // invoice opens the narrow edit modal (invoice number + product / quantity /
  // price only); the full GST form below is CREATE-only. All hooks above
  // already ran, so these conditional returns keep hook order stable.
  if (isEdit && invoice) {
    return <InvoiceEditModal invoice={invoice} onClose={close} />;
  }

  // Create-success panel: the server has persisted the invoice; offer View PDF
  // (rendered from the created record) / View invoice / Go to invoices / Close.
  if (createdInvoice) {
    return (
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-modal-title"
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
          <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <h3
                id="invoice-modal-title"
                className="text-base font-bold text-[#191c1e]"
              >
                Invoice Created
              </h3>
            </div>
            <button
              onClick={close}
              aria-label="Close invoice dialog"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DocumentCreateSuccess
            kind="invoice"
            number={createdInvoice.invoiceNumber}
            onViewPdf={() =>
              void openCreatedInvoicePdf(createdInvoice, companyProfile).catch(
                () => undefined
              )
            }
            onViewDocument={() => {
              const id = createdInvoice.id;
              close();
              router.push(`/invoices/${id}`);
            }}
            onGoToList={() => {
              close();
              router.push("/invoices");
            }}
            onClose={close}
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
      aria-labelledby="invoice-modal-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="invoice-modal-title" className="text-base font-bold text-[#191c1e]">
                {isEdit ? "Edit Tax Invoice" : "Generate GST Tax Invoice"}
              </h3>
              <p className="text-xs text-gray-500">
                Select a customer, add line items, and auto-calculate GST (inclusive of tax)
              </p>
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close invoice dialog"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs"
        >
          {complianceError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs">
              <span className="font-semibold">Please correct the invoice: </span>
              {complianceError}
            </div>
          )}
          {!isEdit && !learningDismissed && (
            <button
              type="button"
              onClick={() => setWantsSample(true)}
              className="self-start inline-flex items-center gap-1.5 text-[#93000b] hover:text-[#770008] border border-[#ecd7d7] hover:border-[#93000b] bg-white rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              View sample invoice &amp; learn
            </button>
          )}
          {!isEdit && !canCreateResource("invoices") && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fef2f2] border border-rose-200 text-[#93000b] rounded-xl px-4 py-3">
              <div className="text-xs">
                <span className="font-bold">You’ve reached your invoice limit</span>
                <p className="text-rose-700 mt-0.5">
                  Upgrade your plan to create more invoices this month.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/pricing")}
                className="shrink-0 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Upgrade Plan
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Select Customer <span className="text-rose-500">*</span>
              </label>
              <SearchablePicker
                items={customers}
                value={customerId}
                onSelect={handleCustomerSelect}
                getLabel={(c) => c.name}
                getSub={(c) =>
                  `GSTIN: ${c.gstin || "-"} · ${
                    c.billingAddress?.city || ""
                  } · ${c.billingAddress?.state || ""}`
                }
                searchText={(c) =>
                  `${c.name} ${c.gstin || ""} ${c.primaryContact?.mobile || ""} ${
                    c.billingAddress?.city || ""
                  } ${c.billingAddress?.state || ""}`
                }
                placeholder="Select customer..."
                emptyText="No customers found. Add a customer first."
                emptyActionLabel="Add Customer"
                onEmptyAction={() => setOpenModal("add-customer")}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-gray-700">
                  Invoice Number
                </label>
                <span className="text-xs font-medium text-gray-500 bg-gray-100 border border-[#eceef0] rounded px-2 py-0.5">
                  Server-assigned
                </span>
              </div>
              {/* Always read-only: the number is allocated by the server inside the
                  create transaction. A number is never typed here, so the form
                  cannot "accidentally keep" a value that was never allocated. To
                  change a number, save the invoice and use Invoice Number edit. */}
              <input
                type="text"
                readOnly
                value={displayedInvoiceNumber}
                title={
                  isEdit
                    ? "The number assigned to this invoice."
                    : "Preview of the number the server will assign when you save. The server may allocate a different number if someone else saves first."
                }
                placeholder="Assigned when you save"
                className="w-full py-2 px-3 bg-gray-50 border border-[#eceef0] rounded-lg outline-none font-mono font-bold uppercase text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {isEdit
                  ? "This is the number assigned to this invoice."
                  : "Preview only. The server assigns the next available number when you save — this value is not reserved and may change. You can change the number later from the saved invoice."}
              </p>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="Pending">Pending Payment</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Invoice Date <span className="text-rose-500">*</span>
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
                  <span className="text-gray-400"> (from the invoice date)</span>
                </p>
              )}
              {fyMismatchWarning && !isEdit && (
                <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  {fyMismatchWarning}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Place of Supply
              </label>
              <select
                value={placeOfSupply}
                onChange={(e) => {
                  setPlaceOfSupply(e.target.value);
                  const codeMatch = /\((\d+)\)/.exec(e.target.value);
                  setPlaceOfSupplyCode(codeMatch ? codeMatch[1] : "");
                }}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={`${s.name} (${s.code})`}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              {!placeOfSupplyCode && null}
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
              disabled={financialLocked}
              className="flex-1 w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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

          {/* Line Items */}
          {financialLocked && (
            <div className="flex items-start gap-2.5 bg-[#fef2f2] border border-rose-200 text-[#93000b] rounded-xl px-4 py-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold">
                  Financial fields are locked for Pending/Issued invoices.
                </span>
                <p className="text-rose-700 mt-0.5">
                  Quantity, rate, GST, and totals cannot be changed after an
                  invoice has been issued. Non-financial details (notes,
                  vehicle) remain editable.
                </p>
              </div>
            </div>
          )}
          <fieldset
            disabled={financialLocked}
            className="min-w-0 p-0 m-0 border-0 space-y-3"
          >
            <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[#191c1e] uppercase tracking-wider text-xs">
                Line Items &amp; Materials
              </h4>
            </div>

            {/* ONE main product search area (the only line-item mechanism) */}
            <div className="bg-[#f7f9fb] border border-[#eceef0] rounded-xl p-3">
              <label className="block font-semibold text-gray-700 mb-1.5">
                Search product to add
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <SearchablePicker
                    items={products}
                    value=""
                    onSelect={(id) => {
                      const prod = products.find((p) => p.id === id);
                      if (prod) addProductLine(prod);
                    }}
                    getLabel={(p) => p.name}
                    getSub={(p) =>
                      `SKU: ${p.sku} · ₹${p.unitPrice}/${p.unit} · GST ${p.gstRate}%`
                    }
                    searchText={(p) =>
                      `${p.name} ${p.sku} ${p.hsnSac} ${p.category}`
                    }
                    placeholder={
                      pricingMode === "exclusive"
                        ? "Search products... (prices are GST-exclusive)"
                        : "Search products... (prices are GST-inclusive)"
                    }
                    emptyText="No products found. Add a product first."
                    emptyActionLabel="Add Product"
                    onEmptyAction={() => setOpenModal("add-product")}
                  />
                </div>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="border border-dashed border-[#eceef0] rounded-xl p-6 text-center text-gray-400">
                <FileText className="w-6 h-6 mx-auto mb-1.5 text-gray-300" />
                No items yet. Search and select a product to add it to this invoice.
              </div>
            ) : (
              <div className="border border-[#eceef0] rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-600 font-semibold text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3">HSN Code</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3 text-right">
                        {pricingMode === "exclusive"
                          ? "Rate (₹, excl. GST)"
                          : "Rate (₹, incl. GST)"}
                      </th>
                      <th className="py-2.5 px-3 text-right">GST %</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                      <th className="py-2.5 px-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eceef0]">
                    {items.map((it, idx) => {
                      const line = calculateLineTotals(
                        {
                          quantity: it.quantity,
                          unitPrice: it.unitPrice,
                          gstRate: it.gstRate,
                        },
                        pricingMode
                      );
                      return (
                        <tr key={it.id} className="bg-white">
                          <td className="py-2 px-3 min-w-52">
                            <input
                              type="text"
                              value={it.description}
                              onChange={(e) =>
                                handleItemChange(idx, "description", e.target.value)
                              }
                              placeholder="Item description"
                              className="w-full py-1 px-2 bg-white border border-[#eceef0] rounded text-[11px] outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="text"
                              value={it.hsnSac}
                              onChange={(e) =>
                                handleItemChange(idx, "hsnSac", e.target.value)
                              }
                              className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs font-mono outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 w-20 text-right">
                            <input
                              type="number"
                              min="0"
                              value={it.quantity}
                              onChange={(e) =>
                                handleItemChange(
                                  idx,
                                  "quantity",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs text-right font-mono font-bold outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 w-20">
                            <input
                              type="text"
                              value={it.unit}
                              onChange={(e) =>
                                handleItemChange(idx, "unit", e.target.value)
                              }
                              className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 w-28 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.unitPrice}
                              onChange={(e) =>
                                handleItemChange(
                                  idx,
                                  "unitPrice",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs text-right font-mono font-bold outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 w-24 text-right">
                            <select
                              value={it.gstRate}
                              onChange={(e) =>
                                handleItemChange(
                                  idx,
                                  "gstRate",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs outline-none font-mono"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                            ₹{line.totalAmount.toLocaleString("en-IN")}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-gray-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </fieldset>

          {/* Vehicle dispatch block */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-3">
            <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
              <Truck className="w-4 h-4 text-[#93000b]" />
              <span>Vehicle Dispatch (Optional)</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Vehicle
                </label>
                <SearchablePicker
                  items={vehicles}
                  value=""
                  onSelect={handleVehicleSelect}
                  getLabel={(v) => v.registrationNumber}
                  getSub={(v) =>
                    `${v.makeModel || ""} ${v.vehicleType || ""}`
                      .trim() || v.registrationNumber
                  }
                  searchText={(v) =>
                    `${v.registrationNumber} ${v.makeModel} ${v.driverName} ${v.vehicleType}`
                  }
                  placeholder="Select vehicle..."
                  emptyText="No vehicles found. Add a vehicle first."
                  emptyActionLabel="Add Vehicle"
                  onEmptyAction={() => setOpenModal("add-vehicle")}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="Select a vehicle above"
                    className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value.toUpperCase())}
                    placeholder="Auto from vehicle"
                    className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={vehicleStatus}
                    onChange={(e) => setVehicleStatus(e.target.value)}
                    className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
                  >
                    <option value="Loaded">Loaded</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Totals & Notes */}
          <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
            <div className="flex-1 space-y-2">
              <label className="block font-semibold text-gray-700">
                Payment Terms &amp; Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value.toUpperCase())}
                placeholder="Add delivery note, bank transfer instructions, or lorry receipt number..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none uppercase"
              />
            </div>

            <div className="sm:w-80 space-y-3">
              {compliance.state !== "SAFE" && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                    compliance.state === "REQUIRED_REVIEW"
                      ? "bg-orange-50 border-orange-200 text-orange-800"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">
                      {compliance.state === "REQUIRED_REVIEW"
                        ? "E-Way Bill review required"
                        : "E-Way Bill advisory"}
                    </div>
                    <div className="mt-0.5 leading-relaxed opacity-90">{compliance.message}</div>
                  </div>
                </div>
              )}

              <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">GST Exclusive Amount</span>
                <span className="font-mono font-semibold">
                  ₹{totals.subtotal.toLocaleString("en-IN")}
                </span>
              </div>
              {taxType === "interstate" ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">IGST ({totalTaxGstRate}%):</span>
                  <span className="font-mono font-semibold">
                    ₹{totals.igst.toLocaleString("en-IN")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">CGST (9%):</span>
                    <span className="font-mono font-semibold">
                      ₹{totals.cgst.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SGST (9%):</span>
                    <span className="font-mono font-semibold">
                      ₹{totals.sgst.toLocaleString("en-IN")}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-bold text-[#93000b]">Total Including GST</span>
                <span className="font-mono font-bold text-[#93000b] text-base">
                  ₹{totals.grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
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
                    : "Save & Generate Invoice"}
              </span>
            </button>
          </div>
        </form>

        {wantConfirm && selectedCustomer && (
          <DocumentCreateConfirmation
            kind="invoice"
            summary={{
              number: displayedInvoiceNumber,
              customer: selectedCustomer.name,
              itemCount: items.length,
              total: totals.grandTotal,
              note:
                "The number above is a preview. The server assigns the final number when you confirm. It can be changed later from the saved invoice.",
            }}
            isSubmitting={isSubmitting}
            onCancel={() => setWantConfirm(false)}
            onConfirm={confirmCreate}
          >
            <DocumentImmutabilityWarning kind="invoice" stacked />
          </DocumentCreateConfirmation>
        )}
        {wantsSample && (
          <DocumentExperienceModal kind="invoice" onClose={closeSample} />
        )}
        <DocumentSubmitLoading kind="invoice" visible={isSubmitting} />
      </div>
    </div>
  );
};
