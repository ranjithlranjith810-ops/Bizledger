"use client";

import React, { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { EMPTY_COMPANY_PROFILE, INITIAL_COMPANY_PROFILE } from "@/data/mockData";
import { normalizeInvoicePrefix, fySlug } from "@/lib/invoice";
import { validateCompanyProfileForm } from "@/lib/validation";
import { INDIAN_STATES } from "@/lib/india";
import { saveBusinessSignature, deleteBusinessSignature } from "@/lib/signature";
import { SignatureCanvasModal } from "@/components/settings/SignatureCanvasModal";
import {
  Building2,
  UploadCloud,
  Save,
  MapPin,
  ShieldCheck,
  Landmark,
  RefreshCcw,
  Trash2,
  LoaderCircle,
  LogOut,
  Signature,
  Hash,
  PenLine,
} from "lucide-react";

export const CompanyProfileView: React.FC = () => {
  const { companyProfile, updateCompanyProfile, resetBusinessData, resetEntireSetup, loadDemoData, getActiveFinancialYear } = useApp();
  const { account, logout } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState({ ...companyProfile });
  // Single source of truth for the save form. Both the top and the bottom Save
  // buttons submit through the SAME <form> element so there is one handler, one
  // validation pass, one loading state and one success message (no double write).
  const formRef = useRef<HTMLFormElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(companyProfile.logoUrl);
  const [signaturePreview, setSignaturePreview] = useState<string | undefined>(companyProfile.digitalSignatureUrl);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmFullReset, setConfirmFullReset] = useState(false);
  const [signatureCanvasOpen, setSignatureCanvasOpen] = useState(false);
  const [confirmRemoveSignature, setConfirmRemoveSignature] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const prefixValidation = useMemo(
    () => normalizeInvoicePrefix(formData.invoicePrefix),
    [formData.invoicePrefix]
  );
  const activeFyForPreview = getActiveFinancialYear();

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        setFormData((prev) => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignaturePreview(reader.result as string);
        setFormData((prev) => ({ ...prev, digitalSignatureUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Draw-to-create, replace and remove for the business signature.
  // Persisted immediately via the account-scoped signature service so it
  // reflects on invoices even before the page's "Save Changes" is pressed.
  const handleSignatureSaved = (dataUrl: string) => {
    if (account) saveBusinessSignature(account.id, dataUrl);
    setSignaturePreview(dataUrl);
    setFormData((prev) => ({ ...prev, digitalSignatureUrl: dataUrl }));
  };

  const handleRemoveSignature = () => {
    if (account) deleteBusinessSignature(account.id);
    setSignaturePreview(undefined);
    setFormData((prev) => ({
      ...prev,
      digitalSignatureUrl: undefined,
    }));
    setConfirmRemoveSignature(false);
  };

  const stateOptionValue = (() => {
    const direct = INDIAN_STATES.find(
      (s) => `${s.name} (${s.code})` === formData.state
    );
    if (direct) return `${direct.name} (${direct.code})`;
    const bare = INDIAN_STATES.find((s) => s.name === formData.state);
    if (bare) return `${bare.name} (${bare.code})`;
    return "";
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCompanyProfileForm({
      name: formData.companyName,
      gstin: formData.gstin,
      pan: formData.pan,
      email: formData.email,
      phone: formData.mobile,
      state: stateOptionValue,
      city: formData.city,
      streetAddress: formData.streetAddress,
      pincode: formData.pincode,
      invoicePrefix: formData.invoicePrefix,
    });
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    updateCompanyProfile(formData);
  };

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Company Profile & Invoicing Setup</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure legal business details, GSTIN, registered billing address, and bank settlement accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => formRef.current?.requestSubmit()}
          className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <Save className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>

      {/* Form (Stitch Design #3) */}
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 text-xs">
        {Object.keys(validationErrors).length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            <div className="font-semibold">Please correct the following to save your profile:</div>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {Object.entries(validationErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
        {/* 1. Brand Logo & Entity Name */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
            <Building2 className="w-4 h-4 text-[#93000b]" />
            <span>1. Organization Identity & Brand Logo</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-6 pb-2">
            {/* Logo Preview / Upload */}
            <div className="relative group shrink-0">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Company Logo"
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-200 shadow-xs"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-rose-50 text-[#93000b] border-2 border-dashed border-rose-200 flex flex-col items-center justify-center font-bold text-lg">
                  BL
                </div>
              )}
              <label className="absolute inset-0 bg-black/50 text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-[10px] font-semibold">
                <UploadCloud className="w-5 h-5 mb-1" />
                Change Logo
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-sm text-gray-900">{formData.companyName}</h4>
              <p className="text-gray-500 text-xs">
                This logo and brand identity will appear automatically on all generated GST tax invoices, vouchers, and PDF statements.
              </p>
              <label className="inline-block mt-2 text-xs font-semibold text-[#93000b] hover:underline cursor-pointer">
                Upload New Image (.PNG / .JPG up to 5MB)
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Company Legal Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-semibold text-gray-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Business Structure
              </label>
              <select
                value={formData.businessType}
                onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium"
              >
                <option value="Private Limited Company">Private Limited Company (Pvt Ltd)</option>
                <option value="Sole Proprietorship">Sole Proprietorship</option>
                <option value="Partnership Firm">Partnership Firm</option>
                <option value="Limited Liability Partnership (LLP)">Limited Liability Partnership (LLP)</option>
                <option value="Public Limited Company">Public Limited Company</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Owner / Authorized Signatory
              </label>
              <input
                type="text"
                value={formData.ownerName}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium"
              />
            </div>
          </div>
        </div>

        {/* 1b. Invoice Configuration & Digital Signature */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
            <Signature className="w-4 h-4 text-[#93000b]" />
            <span>Invoice Configuration & Digital Signature</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Invoice Number Prefix <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.invoicePrefix}
                onChange={(e) =>
                  setFormData({ ...formData, invoicePrefix: e.target.value })
                }
                placeholder="e.g. INV or MI"
                className={`w-full py-2 px-3 bg-[#f7f9fb] border focus:bg-white rounded-lg outline-none font-mono font-bold uppercase ${
                  prefixValidation.valid
                    ? "border-[#eceef0] focus:border-[#93000b]"
                    : "border-rose-300 focus:border-rose-500"
                }`}
              />
              {prefixValidation.valid ? (
                <p className="text-[11px] text-emerald-600 mt-1">
                  Valid — invoices will be numbered{" "}
                  <span className="font-mono font-bold">
                    {normalizeInvoicePrefix(formData.invoicePrefix || "INV").prefix}
                    /
                    {fySlug(activeFyForPreview?.name || "")}/
                    {String(Number(formData.invoiceStartingNumber) || 1).padStart(3, "0")}
                  </span>
                </p>
              ) : (
                <p className="text-[11px] text-rose-600 mt-1">
                  Prefix must contain only letters (A-Z). No numbers, dashes or spaces.
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Starting Invoice Number
              </label>
              <input
                type="number"
                min="1"
                value={formData.invoiceStartingNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    invoiceStartingNumber: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Current Financial Year
              </label>
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-gray-400" />
                <div className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] rounded-lg font-medium text-gray-700">
                  {activeFyForPreview?.name || "No financial year set"}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-1 border-t border-[#eceef0]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="relative group shrink-0">
                {signaturePreview ? (
                  <img
                    src={signaturePreview}
                    alt="Saved Signature"
                    className="h-20 rounded-xl object-contain border border-gray-200 bg-white p-2"
                  />
                ) : (
                  <div className="h-20 w-44 rounded-xl bg-rose-50 text-[#93000b] border-2 border-dashed border-rose-200 flex items-center justify-center text-xs font-semibold">
                    No signature added yet
                  </div>
                )}
              </div>
              <div className="space-y-1.5 flex-1">
                <h4 className="font-bold text-sm text-gray-900">
                  Digital Signature (Authorized Signatory)
                </h4>
                <p className="text-gray-500 text-xs">
                  Create your authorized signature once and automatically use it
                  on your invoices. It is printed below the authorized signatory
                  line on every GST tax invoice and PDF.
                </p>

                {signaturePreview ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSignatureCanvasOpen(true)}
                      className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      Replace Signature
                    </button>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#eceef0] text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer">
                      <UploadCloud className="w-3.5 h-3.5" />
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSignatureUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveSignature(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-[#fef2f2] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Signature
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSignatureCanvasOpen(true)}
                      className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      <PenLine className="w-4 h-4" />
                      Draw Your Signature
                    </button>
                    <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#eceef0] text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer">
                      <UploadCloud className="w-4 h-4" />
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSignatureUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Contact & Address Info (Stitch Design #3) */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-[#93000b]" />
            <span>2. Contact Details & Principal Place of Business</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Official Phone / Mobile <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Accounts Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Official Website
              </label>
              <input
                type="text"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block font-semibold text-gray-700 mb-1">
                Street Address (Building / Estate / Road) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.streetAddress}
                onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                City / District <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                State & State Code <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={stateOptionValue}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium"
              >
                <option value="">Select state...</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={`${s.name} (${s.code})`}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                PIN Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* 3. Tax & Registration Credentials (Stitch Design #3) */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-[#93000b]" />
            <span>3. Tax Registrations (GSTIN & PAN)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Goods & Services Tax (GSTIN) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                placeholder="33AAAAA0000A1Z5"
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono font-bold uppercase text-gray-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Permanent Account No (PAN) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                placeholder="ABCDE1234F"
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono font-bold uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                MSME / Udyam Registration No.
              </label>
              <input
                type="text"
                value={formData.udyamNo}
                onChange={(e) => setFormData({ ...formData, udyamNo: e.target.value })}
                placeholder="UDYAM-TN-03-0012345"
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* 4. Bank Account Details for Invoices */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
            <Landmark className="w-4 h-4 text-[#93000b]" />
            <span>4. Bank Details & UPI (Printed on Customer Invoices)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Current Account Number
              </label>
              <input
                type="text"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                IFSC Code
              </label>
              <input
                type="text"
                value={formData.ifscCode}
                onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono font-bold uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Business UPI ID / QR
              </label>
              <input
                type="text"
                value={formData.upiId}
                onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                placeholder="bizledger@hdfcbank"
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Payment Terms (printed on invoice)
            </label>
            <input
              type="text"
              value={formData.paymentTerms}
              onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
              placeholder="Immediate (NEFT/RTGS/CHEQUE)"
              className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Leave empty to use the default: “Immediate (NEFT/RTGS/CHEQUE)”.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Standard Invoice Footer Terms & Conditions
            </label>
            <textarea
              rows={3}
              value={formData.invoiceTerms}
              onChange={(e) => setFormData({ ...formData, invoiceTerms: e.target.value })}
              placeholder={"1. Goods once sold...\n2. Replacement only for manufacturing defects...\n3. Payment before dispatch...\n4. Interest @18% p.a. on overdue...\n5. Subject to Tamil Nadu jurisdiction."}
              className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none resize-none font-mono text-[11px]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              One clause per line. Leave empty to use the default 5-clause Terms
              &amp; Conditions; set to “” and clear below to omit the block.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Custom GST / Support Info (informational, printed on invoice)
            </label>
            <textarea
              rows={2}
              value={formData.gstSupportInfo}
              onChange={(e) => setFormData({ ...formData, gstSupportInfo: e.target.value })}
              placeholder="e.g. GST payments as per GSTIN; support available Mon–Sat 9am–6pm at support@bizledger.io"
              className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none resize-none font-mono text-[11px]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Displayed only when filled in. Informational — never affects GST
              calculations.
            </p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            className="bg-[#93000b] hover:bg-[#770008] text-white py-3 px-8 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Profile & Invoicing Settings</span>
          </button>
        </div>
      </form>

      {/* Load Demo Data */}
      <div className="bg-[#f0fdf4] p-5 rounded-xl border border-[#bbf7d0] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#dcfce7] text-[#166534] flex items-center justify-center shrink-0">
              <LoaderCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
                <RefreshCcw className="w-4 h-4 text-[#15803d]" />
                <span>Load Demo Data</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-lg">
                Populate your account with the sample BizLedger demo dataset
                (customers, products, invoices, expenses, vehicles, team and
                plan) so you can explore the platform with realistic numbers.
                This overwrites the current data in your account.
              </p>
            </div>
          </div>

          {confirmLoadDemo ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-[#166534]">
                Load demo data?
              </span>
              <button
                onClick={() => {
                  loadDemoData();
                  setFormData({ ...INITIAL_COMPANY_PROFILE });
                  setConfirmLoadDemo(false);
                }}
                className="bg-[#15803d] hover:bg-[#166534] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Confirm Load
              </button>
              <button
                onClick={() => setConfirmLoadDemo(false)}
                className="px-3 py-2 rounded-lg border border-[#bbf7d0] text-xs font-semibold text-[#166534] hover:bg-[#dcfce7] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLoadDemo(true)}
              className="bg-[#15803d] hover:bg-[#166534] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Load Demo Data
            </button>
          )}
        </div>
      </div>

      {/* Reset Business Data */}
      <div className="bg-white p-5 rounded-xl border border-red-100 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
                <RefreshCcw className="w-4 h-4 text-[#93000b]" />
                <span>Reset Business Data</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-lg">
                Clears ALL business <span className="font-semibold">records</span>{" "}
                (customers, products, invoices, expenses, vehicles, team and
                notifications) back to a fresh, zero-value ledger. Your business
                setup — company profile, financial years, invoice configuration
                and plan — is preserved. Your account and sign-in are kept.
              </p>
            </div>
          </div>

          {confirmReset ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-[#93000b]">
                Clear all data?
              </span>
              <button
                onClick={() => {
                  resetBusinessData();
                  setFormData({ ...companyProfile });
                  setConfirmReset(false);
                }}
                className="bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 rounded-lg border border-[#eceef0] text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="border border-red-200 text-[#93000b] hover:bg-[#fef2f2] px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Business Data
            </button>
          )}
        </div>
      </div>

      {/* Reset Entire Business Setup */}
      <div className="bg-[#fef2f2] p-5 rounded-xl border border-[#fecaca] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#fee2e2] text-[#93000b] flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
                <Trash2 className="w-4 h-4 text-[#93000b]" />
                <span>Reset Entire Business Setup</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-lg">
                Wipes the <span className="font-semibold">entire setup</span> back
                to a brand-new account: company profile, financial years, invoice
                configuration, records AND subscription/plan. You will be guided
                through the onboarding wizard again on next navigation.
              </p>
            </div>
          </div>

          {confirmFullReset ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-[#93000b]">
                Reset everything?
              </span>
              <button
                onClick={() => {
                  resetEntireSetup();
                  setFormData({ ...EMPTY_COMPANY_PROFILE });
                  setConfirmFullReset(false);
                  router.replace("/onboarding");
                }}
                className="bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Full Reset
              </button>
              <button
                onClick={() => setConfirmFullReset(false)}
                className="px-3 py-2 rounded-lg border border-[#fecaca] text-xs font-semibold text-[#93000b] hover:bg-[#ffe4e6] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmFullReset(true)}
              className="bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Entire Business Setup
            </button>
          )}
        </div>
      </div>

      {/* Log out */}
      <div className="bg-white p-5 rounded-xl border border-outline-variant/50 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <div className="w-10 h-10 rounded-xl bg-surface-container-low text-secondary flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
                <LogOut className="w-4 h-4 text-secondary" />
                <span>Log out</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-lg">
                Currently signed in as{" "}
                <span className="font-semibold text-on-surface">
                  {account?.email || "you"}
                </span>
                . Logging out returns you to the landing page. Your business
                data stays saved in this browser for when you log back in.
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="border border-outline-variant/50 text-error hover:bg-error/10 px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </div>
      </div>

      {/* Draw Signature Modal */}
      {signatureCanvasOpen && (
        <SignatureCanvasModal
          key="signature-canvas"
          isOpen={signatureCanvasOpen}
          onClose={() => setSignatureCanvasOpen(false)}
          onSave={handleSignatureSaved}
        />
      )}

      {/* Remove Signature Confirmation */}
      {confirmRemoveSignature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between">
              <h3 className="text-base font-semibold text-on-surface">
                Remove saved signature?
              </h3>
              <button
                onClick={() => setConfirmRemoveSignature(false)}
                className="p-1 rounded-md text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-on-surface-variant leading-relaxed">
                This will remove the signature from future invoices. Existing
                invoices will not be changed.
              </p>
            </div>
            <div className="px-6 py-3 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmRemoveSignature(false)}
                className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveSignature}
                className="px-4 py-2 rounded-lg bg-[#93000b] hover:bg-[#770008] text-white text-xs font-bold shadow-xs transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
