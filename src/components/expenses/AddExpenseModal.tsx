"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ExpenseCategory } from "@/types";
import {
  X,
  Receipt,
  UploadCloud,
  FileText,
  CreditCard,
  Check,
  Tag,
} from "lucide-react";

export const AddExpenseModal: React.FC = () => {
  const { addExpense, setOpenModal, vehicles } = useApp();

  const [category, setCategory] = useState<ExpenseCategory>("Raw Material");
  const [amount, setAmount] = useState<string>("45000");
  const [date, setDate] = useState<string>(() =>
    new Date().toISOString().split("T")[0]
  );
  const [title, setTitle] = useState<string>(
    "Steel Pipes & Fixtures Bulk Purchase"
  );
  const [vendor, setVendor] = useState<string>("Apex Steel & Alloys Ltd");
  const [expenseType] = useState<"Direct" | "Indirect">("Direct");
  const [paymentMethod, setPaymentMethod] = useState<string>("Bank Transfer");
  const [paidFromAccount, setPaidFromAccount] = useState<string>(
    "HDFC Current A/C (..5678)"
  );
  const [referenceNumber, setReferenceNumber] = useState<string>(
    "HDFC9842104882"
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [notes, setNotes] = useState<string>(
    "Q3 batch of high-tensile 2-inch seamless pipes for production line A."
  );
  const [receiptName, setReceiptName] = useState<string>(
    "ApexSteel_Inv_8921.pdf"
  );
  const [receiptSize, setReceiptSize] = useState<string>("1.4 MB");
  const [receiptUrl, setReceiptUrl] = useState<string>(
    "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80"
  );

  const numAmount = parseFloat(amount) || 0;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptName(file.name);
      setReceiptSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || numAmount <= 0) return;

    const matchedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

    addExpense({
      expenseNumber: `EXP-${Math.floor(100 + Math.random() * 900)}`,
      title,
      category,
      amount: numAmount,
      date,
      paymentMethod,
      paidFromAccount,
      referenceNumber,
      vendor: vendor || "Direct Counter Purchase",
      expenseType,
      status: "Paid",
      notes,
      receiptUrl,
      receiptName,
      receiptSize,
      vehicleId: selectedVehicleId || undefined,
      vehicleRegistration: matchedVehicle?.registrationNumber,
      createdBy: "Sarah Jenkins",
      approvedBy: "David Lee",
    });

    setOpenModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">
                Add New Expense
              </h3>
              <p className="text-xs text-gray-500">
                Record payments, supplier purchases, and upload receipts
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpenModal(null)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Main Inputs (2 Columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 1: Expense Details */}
            <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#191c1e] uppercase tracking-wider">
                <Tag className="w-4 h-4 text-[#93000b]" />
                <span>1. Expense Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Expense Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as ExpenseCategory)
                    }
                    className="w-full text-xs bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium text-gray-800"
                  >
                    <option value="Raw Material">Raw Material</option>
                    <option value="Fuel">Fuel (Diesel / Petrol)</option>
                    <option value="Maintenance">
                      Vehicle &amp; Machine Maintenance
                    </option>
                    <option value="Utilities">
                      Utilities (Electricity / Water / Net)
                    </option>
                    <option value="Labour & Wages">Labour &amp; Wages</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Rent">Rent &amp; Lease</option>
                    <option value="Marketing">Marketing &amp; Ads</option>
                    <option value="Travel">Travel &amp; Lodging</option>
                    <option value="Other">Other Expenses</option>
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold text-[#191c1e]"
                    />
                  </div>
                </div>

                {/* Expense Title */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Expense Description / Title{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Raw Material Purchase - Steel Pipes"
                    className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-medium"
                  />
                </div>

                {/* Vendor / Payee */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Vendor / Payee Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. Apex Steel & Alloys Ltd"
                    className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Expense Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                  />
                </div>

                {/* Optional Vehicle Tag */}
                {(category === "Fuel" || category === "Maintenance") && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Link to Fleet Vehicle (Optional)
                    </label>
                    <select
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      className="w-full text-xs bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
                    >
                      <option value="">-- No Vehicle Linked --</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.registrationNumber} - {v.makeModel} (
                          {v.driverName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Payment Details */}
            <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#191c1e] uppercase tracking-wider">
                <CreditCard className="w-4 h-4 text-[#93000b]" />
                <span>2. Payment &amp; Settlement</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Mode */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
                  >
                    <option value="Bank Transfer">
                      Bank Transfer (NEFT / RTGS / IMPS)
                    </option>
                    <option value="UPI">UPI / QR Code</option>
                    <option value="Cash">Cash (Petty Cash Safe)</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Credit Card">Corporate Credit Card</option>
                  </select>
                </div>

                {/* Account */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Paid From Account
                  </label>
                  <select
                    value={paidFromAccount}
                    onChange={(e) => setPaidFromAccount(e.target.value)}
                    className="w-full text-xs bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
                  >
                    <option value="HDFC Current A/C (..5678)">
                      HDFC Current A/C (..5678)
                    </option>
                    <option value="ICICI Petty Cash (..1092)">
                      ICICI Petty Cash (..1092)
                    </option>
                    <option value="Driver Petty Cash">
                      Driver Petty Cash Drawer
                    </option>
                    <option value="HDFC Corporate Card (..9012)">
                      HDFC Corporate Card (..9012)
                    </option>
                  </select>
                </div>

                {/* Reference No */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Transaction / Reference / Cheque No.
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. HDFC9842104882 or UPI/62349102834"
                    className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Receipt Upload & Notes */}
            <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#191c1e] uppercase tracking-wider">
                <UploadCloud className="w-4 h-4 text-[#93000b]" />
                <span>3. Receipt &amp; Attachments</span>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-gray-300 hover:border-[#93000b] bg-white rounded-xl p-4 text-center cursor-pointer transition-colors relative">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-gray-700">
                  Drop receipt or bill here, or{" "}
                  <span className="text-[#93000b]">browse files</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Supports PDF, JPG, PNG up to 10MB
                </p>
              </div>

              {receiptName && (
                <div className="bg-white p-2.5 rounded-lg border border-[#eceef0] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#93000b]" />
                    <div>
                      <span className="font-semibold text-gray-800">
                        {receiptName}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-2">
                        ({receiptSize})
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Ready to attach
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Internal Notes &amp; Remarks
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add item batch notes, project code, or justification..."
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Live Expense Summary Card (Stitch Design #6) */}
          <div className="space-y-4">
            <div className="bg-white border border-[#eceef0] rounded-xl p-5 shadow-sm sticky top-0">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Expense Summary Preview
              </h4>

              <div className="space-y-3 pb-4 border-b border-gray-100">
                <div>
                  <span className="text-[11px] text-gray-500">Category</span>
                  <div className="text-xs font-bold text-[#93000b]">
                    {category}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500">
                    Title / Purpose
                  </span>
                  <div className="text-xs font-semibold text-gray-800 line-clamp-2">
                    {title || "Untitled Expense"}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500">
                    Vendor / Payee
                  </span>
                  <div className="text-xs font-medium text-gray-700">
                    {vendor || "—"}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500">
                    Settlement Mode
                  </span>
                  <div className="text-xs font-medium text-gray-700">
                    {paymentMethod} • {paidFromAccount}
                  </div>
                </div>
              </div>

              {/* Amount Display */}
              <div className="py-4 border-b border-gray-100">
                <span className="text-xs text-gray-500">
                  Total Payable Amount
                </span>
                <div className="text-2xl font-bold font-mono text-[#191c1e]">
                  ₹{numAmount.toLocaleString("en-IN")}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>GST Input Credit Eligible</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-4 space-y-2">
                <button
                  type="submit"
                  className="w-full bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Record &amp; Save Expense</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenModal(null)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};