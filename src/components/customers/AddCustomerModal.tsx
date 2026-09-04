"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Customer, GSTRegistrationStatus } from "@/types";
import { INDIAN_STATES } from "@/lib/india";
import { X, UserPlus, Check, Edit3 } from "lucide-react";

interface AddCustomerModalProps {
  customer?: Customer | null;
  onClose?: () => void;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  customer,
  onClose,
}) => {
  const { addCustomer, updateCustomer, setOpenModal, customers } = useApp();
  const isEdit = !!customer;

  const [name, setName] = useState<string>(customer?.name || "");
  const [gstStatus, setGstStatus] = useState<GSTRegistrationStatus>(
    customer?.gstStatus || "registered"
  );
  const [gstin, setGstin] = useState<string>(customer?.gstin || "");
  const [contactName, setContactName] = useState<string>(
    customer?.primaryContact.name || ""
  );
  const [contactDesignation, setContactDesignation] = useState<string>(
    customer?.primaryContact.designation || ""
  );
  const [phone, setPhone] = useState<string>(customer?.primaryContact.mobile || "");
  const [email, setEmail] = useState<string>(customer?.primaryContact.email || "");
  const [city, setCity] = useState<string>(customer?.billingAddress.city || "");
  const [state, setState] = useState<string>(customer?.billingAddress.state || "");
  const [pincode, setPincode] = useState<string>(customer?.billingAddress.pincode || "");
  const [addressLine1, setAddressLine1] = useState<string>(
    customer?.billingAddress.addressLine1 || ""
  );
  const [paymentTerms, setPaymentTerms] = useState<string>(
    customer?.paymentTerms || "Net 30"
  );
  const [creditLimit, setCreditLimit] = useState<string>(
    customer ? String(customer.creditLimit || 0) : ""
  );

  const close = () => {
    if (onClose) onClose();
    else setOpenModal(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const initials = name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const payload: Omit<Customer, "id"> = {
      code: customer?.code || `CUST-${String(customers.length + 1).padStart(4, "0")}`,
      type: "business",
      name: name.trim(),
      avatarInitials: initials || "CU",
      gstStatus,
      gstin:
        gstStatus !== "unregistered" && gstStatus !== "consumer"
          ? gstin.trim()
          : undefined,
      primaryContact: {
        name: contactName.trim() || name.trim(),
        designation: contactDesignation.trim() || undefined,
        mobile: phone.trim() || "+91 00000 00000",
        email: email.trim() || undefined,
      },
      billingAddress: {
        addressLine1: addressLine1.trim() || "Not provided",
        city: city.trim() || "Coimbatore",
        state: state.trim() || "Tamil Nadu",
        pincode: pincode.trim() || "000000",
        country: "India",
      },
      shippingAddress: {
        addressLine1: addressLine1.trim() || "Not provided",
        city: city.trim() || "Coimbatore",
        state: state.trim() || "Tamil Nadu",
        pincode: pincode.trim() || "000000",
        country: "India",
      },
      sameAsBilling: true,
      stateCode: (() => {
        const st = state.trim() || "Tamil Nadu";
        const found = INDIAN_STATES.find(
          (s) => s.name.toLowerCase() === st.toLowerCase()
        );
        return found ? found.code : undefined;
      })(),
      creditLimit: parseFloat(creditLimit) || 0,
      paymentTerms,
      status: customer?.status || ("Active" as const),
      outstandingBalance: customer?.outstandingBalance ?? 0,
      totalSales: customer?.totalSales ?? 0,
      totalInvoices: customer?.totalInvoices ?? 0,
      createdDate: customer?.createdDate || new Date().toISOString().split("T")[0],
    };

    if (isEdit && customer) {
      updateCustomer({ ...payload, id: customer.id });
    } else {
      addCustomer(payload);
    }
    close();
  };

  const requireGstin = gstStatus !== "unregistered" && gstStatus !== "consumer";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              {isEdit ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">
                {isEdit ? "Edit Customer" : "Add New Customer"}
              </h3>
              <p className="text-xs text-gray-500">
                Register a GSTIN profile, billing address, and credit terms
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Customer / Company Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bright Steel & Hardware Co"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-semibold text-gray-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                GST Status
              </label>
              <select
                value={gstStatus}
                onChange={(e) => setGstStatus(e.target.value as GSTRegistrationStatus)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="registered">Registered</option>
                <option value="composite">Composite</option>
                <option value="unregistered">Unregistered</option>
                <option value="consumer">Consumer</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Immediate">Immediate</option>
              </select>
            </div>

            {requireGstin && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-gray-700 mb-1">
                  GSTIN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27ABCDE1234F1Z5"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold uppercase"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div className="sm:col-span-2">
              <label className="block font-bold text-[#191c1e] uppercase tracking-wider text-[11px]">
                Primary Contact
              </label>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Full name"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Designation
              </label>
              <input
                type="text"
                value={contactDesignation}
                onChange={(e) => setContactDesignation(e.target.value)}
                placeholder="Procurement Manager"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Mobile <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="billing@company.com"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div className="sm:col-span-2">
              <label className="block font-bold text-[#191c1e] uppercase tracking-wider text-[11px]">
                Billing Address
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Street Address
              </label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="123 Industrial Estate Main Road"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                City <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Coimbatore"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Pincode
              </label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="641001"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                State <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="">Select state...</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Credit Limit (₹)
              </label>
              <input
                type="number"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] text-gray-400 pt-2">
                The credit terms and limit set here appear on this customer&apos;s
                invoices and ledger.
              </p>
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
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{isEdit ? "Save Changes" : "Add Customer"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
