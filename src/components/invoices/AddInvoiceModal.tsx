"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Invoice, InvoiceItem, InvoiceStatus, PricingMode } from "@/types";
import {
  calculateInvoiceTotals,
  calculateLineTotals,
  buildInvoiceNumber,
} from "@/lib/invoice";
import { stateWithCode, INDIAN_STATES } from "@/lib/india";
import { getEWayBillComplianceStatus } from "@/lib/compliance";
import {
  validateName,
  validateGstin,
  validateHsnSAC,
  validatePrice,
  validateQuantity,
  validateGstRate,
  validateVehicleNumber,
} from "@/lib/validation";
import { X, FileText, Plus, Trash2, Check, Truck, ShieldAlert } from "lucide-react";
import { SearchablePicker } from "@/components/invoices/SearchablePicker";

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
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
    updateInvoice,
    setOpenModal,
    companyProfile,
    getActiveFinancialYear,
    invoiceSequence,
    mintDocumentNumber,
    canCreateResource,
  } = useApp();
  const router = useRouter();
  const isEdit = !!invoice;

  const activeFy = getActiveFinancialYear();
  const fyName = activeFy?.name || "";
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
    invoice?.date || new Date().toISOString().split("T")[0]
  );
  const [placeOfSupply, setPlaceOfSupply] = useState<string>(
    invoice?.placeOfSupply || "Tamil Nadu (33)"
  );
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState<string>(
    invoice?.placeOfSupplyCode || ""
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

  // Auto-number for a NEW invoice uses the account-scoped sequence; an edited
  // invoice keeps its existing number.
  const displayedInvoiceNumber = isEdit
    ? invoice?.invoiceNumber || ""
    : buildInvoiceNumber(
        companyProfile.invoicePrefix || "INV",
        fyName,
        invoiceSequence
      );

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
        description: prod.name,
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

  const addCustomLine = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length}`,
        description: "",
        hsnSac: "",
        quantity: 1,
        unit: "Pcs",
        unitPrice: 0,
        gstRate: 18,
      },
    ]);
  };

  const handleItemChange = (
    index: number,
    field: keyof LineDraft,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Live GST-inclusive calculation using the ONE shared function.
  const totals = calculateInvoiceTotals(
    items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      gstRate: it.gstRate,
    })),
    pricingMode
  );

  const compliance = getEWayBillComplianceStatus(totals.grandTotal);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (items.length === 0) return;

    // Field-level validation (UX only; re-enforced server-side later).
    for (const it of items) {
      const hsn = it.hsnSac ? validateHsnSAC(true).validate(it.hsnSac) : null;
      const qty = validateQuantity().validate(String(it.quantity));
      const price = validatePrice().validate(String(it.unitPrice));
      const gst = validateGstRate().validate(String(it.gstRate));
      if (hsn || qty || price || gst) {
        setComplianceError(hsn || qty || price || gst || "");
        return;
      }
    }
    if (vehicleNumber.trim()) {
      const veh = validateVehicleNumber(true).validate(vehicleNumber);
      if (veh) {
        setComplianceError(veh);
        return;
      }
    }
    const contactErr = validateContact(selectedCustomer);
    if (contactErr) {
      setComplianceError(contactErr);
      return;
    }
    setComplianceError(null);

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

    // Auto-populate receiver snapshot from the selected customer.
    const ba = selectedCustomer.billingAddress;
    const customerAddress = [
      ba?.addressLine1,
      ba?.city,
      ba?.state,
      ba?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    // Auto-number for a NEW invoice uses the active FY's per-FY sequence; an
    // edited invoice keeps its existing number. Submitting re-mints (rollover
    // is idempotent) so the number stored is always the reconciled one.
    const finalNumber = isEdit
      ? (invoice?.invoiceNumber ?? displayedInvoiceNumber)
      : mintDocumentNumber(companyProfile.invoicePrefix || "INV", "invoice");

    const base = {
      invoiceNumber: finalNumber,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerGstin: selectedCustomer.gstin,
      customerAddress,
      customerPhone: selectedCustomer.primaryContact?.mobile,
      date,
      dueDate: addDays(date, 15),
      placeOfSupply,
      placeOfSupplyCode,
      vehicle:
        vehicleNumber.trim() || driverName.trim()
          ? {
              vehicleNumber: vehicleNumber.trim() || undefined,
              driverName: driverName.trim() || undefined,
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
      notes: notes ? notes.replace(/<[^>]*>/g, "").trim().slice(0, 1000) || undefined : undefined,
    };

    if (isEdit && invoice) {
      updateInvoice({ ...base, id: invoice.id });
      close();
    } else {
      const created = addInvoice(base);
      if (created) close();
    }
  };

  const close = () => {
    if (onClose) onClose();
    else setOpenModal(null);
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
                {isEdit ? "Edit Tax Invoice" : "Generate GST Tax Invoice"}
              </h3>
              <p className="text-xs text-gray-500">
                Select a customer, add line items, and auto-calculate GST (inclusive of tax)
              </p>
            </div>
          </div>
          <button
            onClick={close}
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
              <label className="block font-semibold text-gray-700 mb-1">
                Invoice Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                readOnly
                value={displayedInvoiceNumber}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] rounded-lg outline-none font-mono font-bold uppercase text-gray-800"
              />
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
                <option value="Paid">Mark as Paid</option>
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

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[#191c1e] uppercase tracking-wider text-xs">
                Line Items &amp; Materials
              </h4>
              <button
                type="button"
                onClick={addCustomLine}
                className="text-xs text-[#93000b] hover:bg-rose-50 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 border border-rose-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {/* ONE main product search area */}
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
                <button
                  type="button"
                  onClick={addCustomLine}
                  className="shrink-0 text-xs text-[#93000b] hover:bg-rose-50 px-3 py-2 rounded-lg font-semibold border border-rose-200 transition-colors"
                >
                  + Custom Item
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="border border-dashed border-[#eceef0] rounded-xl p-6 text-center text-gray-400">
                <FileText className="w-6 h-6 mx-auto mb-1.5 text-gray-300" />
                No items yet. Add a product or a custom line item above.
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
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Auto from vehicle"
                    className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
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
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add delivery note, bank transfer instructions, or lorry receipt number..."
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
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
              disabled={!selectedCustomer || items.length === 0}
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>{isEdit ? "Save Changes" : "Save & Generate Invoice"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
