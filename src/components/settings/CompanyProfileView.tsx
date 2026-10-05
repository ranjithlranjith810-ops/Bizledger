"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { normalizeInvoicePrefix, fySlug } from "@/lib/invoice";
import { validateCompanyProfileForm, normalizeBusinessText } from "@/lib/validation";
import { INDIAN_STATES } from "@/lib/india";
import { saveBusinessSignature, deleteBusinessSignature } from "@/lib/signature";
import { bakeLogoOrientation } from "@/lib/image-orientation";
import { SignatureCanvasModal } from "@/components/settings/SignatureCanvasModal";
import { Icon } from "../ui/Icon";
import {
  Building2,
  UploadCloud,
  Save,
  MapPin,
  ShieldCheck,
  Landmark,
  Trash2,
  LogOut,
  Signature,
  Hash,
  PenLine,
} from "lucide-react";

export const CompanyProfileView: React.FC = () => {
  const { companyProfile, updateCompanyProfile, getActiveFinancialYear } = useApp();
  const { account, logout } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState({ ...companyProfile });
  // The server profile hydrates asynchronously AFTER this view mounts (the
  // AppContext GET /api/businesses/[id] call). formData must not stay frozen on
  // the empty pre-hydration snapshot: that made the Address field appear empty
  // on first load, and a Save made from that state echoed the blank address back
  // to the server, silently erasing a previously stored address. Adopt the
  // authoritative profile as soon as it arrives, but never once the user has
  // started editing (their in-progress input wins).
  const dirtyRef = useRef(false);
  const lastSyncedRef = useRef(companyProfile);
  // Mount-time preview values: adoption only replaces the preview when it still
  // matches what this mount initialized with, so an in-session logo/signature
  // change (even one that never touched any form input) is never clobbered.
  const mountLogoRef = useRef(companyProfile.logoUrl);
  const mountSigRef = useRef(companyProfile.digitalSignatureUrl);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(companyProfile.logoUrl);
  const [signaturePreview, setSignaturePreview] = useState<string | undefined>(companyProfile.digitalSignatureUrl);
  useEffect(() => {
    if (dirtyRef.current) return;
    if (companyProfile === lastSyncedRef.current) return;
    setFormData({ ...companyProfile });
    // The logo/signature previews have the same mount-time init race as the
    // form: they are snapshot from the pre-hydration profile. Adopt the stored
    // URLs alongside the rest of the profile so a persisted logo/signature is
    // shown again right after a refresh.
    setLogoPreview((prev) => (prev === mountLogoRef.current ? companyProfile.logoUrl ?? prev : prev));
    setSignaturePreview((prev) => (prev === mountSigRef.current ? companyProfile.digitalSignatureUrl ?? prev : prev));
    lastSyncedRef.current = companyProfile;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyProfile]);
  // Single save path: the one Save Changes button submits through the <form>
  // element (one handler, one validation pass, one loading state, one toast).
  const formRef = useRef<HTMLFormElement>(null);
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
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const raw = reader.result as string;
      void bakeLogoOrientation(raw).then((normalized) => {
        setLogoPreview(normalized);
        setFormData((prev) => ({ ...prev, logoUrl: normalized }));
      });
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = () => {
    setLogoPreview(undefined);
    setFormData((prev) => ({ ...prev, logoUrl: "" }));
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

    // Business/display text that is printed on invoices (company name, address,
    // bank, terms) is stored in UPPERCASE. Registrations, contacts and account
    // identifiers keep their natural case.
    // The legacy split-address mirror fields (addressLine1/addressLine2) are
    // NOT managed by this form and must stay out of the payload: AppContext's
    // updateCompanyProfile mirrors streetAddress from those two whenever either
    // key is present, so echoing the stored "" (they are empty for tenants that
    // only ever used the Street Address field) silently CLOBBERED a freshly
    // edited street back to blank. Exclude them so a settings save only ever
    // affects the fields this view owns.
    const {
      addressLine1: _legacyAddressLine1,
      addressLine2: _legacyAddressLine2,
      ...formEditableFields
    } = formData;
    const normalized = {
      ...formEditableFields,
      companyName: normalizeBusinessText(formData.companyName),
      ownerName: formData.ownerName
        ? normalizeBusinessText(formData.ownerName)
        : formData.ownerName,
      streetAddress: normalizeBusinessText(formData.streetAddress),
      city: normalizeBusinessText(formData.city),
      bankName: formData.bankName
        ? normalizeBusinessText(formData.bankName)
        : formData.bankName,
      paymentTerms: formData.paymentTerms
        ? normalizeBusinessText(formData.paymentTerms)
        : formData.paymentTerms,
      invoiceTerms: formData.invoiceTerms
        ? normalizeBusinessText(formData.invoiceTerms)
        : formData.invoiceTerms,
      invoicePrefix: formData.invoicePrefix.trim().toUpperCase(),
    };

    const errors = validateCompanyProfileForm({
      name: normalized.companyName,
      gstin: normalized.gstin,
      gstRegistered: normalized.gstRegistered ?? "unregistered",
      pan: normalized.pan,
      email: normalized.email,
      phone: normalized.mobile,
      state: stateOptionValue,
      city: normalized.city,
      streetAddress: normalized.streetAddress,
      pincode: normalized.pincode,
      invoicePrefix: normalized.invoicePrefix,
    });
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    updateCompanyProfile(normalized);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
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
      <form ref={formRef} onSubmit={handleSubmit} onInput={() => { dirtyRef.current = true; }} className="space-y-6 text-xs">
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
                  className="max-h-24 max-w-36 rounded-2xl object-contain border-2 border-gray-200 shadow-xs bg-white p-2"
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
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleClearLogo}
                  className="mt-2 ml-3 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Logo
                </button>
              )}
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
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value.toUpperCase() })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-semibold text-gray-900 uppercase"
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
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value.toUpperCase() })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium uppercase"
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
                onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value.toUpperCase() })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none uppercase"
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
                onChange={(e) => setFormData({ ...formData, city: e.target.value.toUpperCase() })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none uppercase"
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
                placeholder="ABCPE1234F"
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-mono font-bold uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                MSME / Udyam Registration No.
              </label>
              <input
                type="text"
                value={formData.udyamNo ?? ""}
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
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value.toUpperCase() })}
                className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium uppercase"
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
              value={formData.paymentTerms ?? ""}
              onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value.toUpperCase() })}
              placeholder="Immediate (NEFT/RTGS/CHEQUE)"
              className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none font-medium uppercase"
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
              onChange={(e) => setFormData({ ...formData, invoiceTerms: e.target.value.toUpperCase() })}
              placeholder={"1. Goods once sold...\n2. Replacement only for manufacturing defects...\n3. Payment before dispatch...\n4. Interest @18% p.a. on overdue...\n5. Subject to Tamil Nadu jurisdiction."}
              className="w-full py-2 px-3 bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none resize-none font-mono text-[11px] uppercase"
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
              value={formData.gstSupportInfo ?? ""}
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
      </form>

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
                data stays saved to your account for when you log back in.
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
                <Icon name="close" className="text-[20px]" />
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
