"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ONBOARDING_STEPS } from "@/lib/constants";
import { validatePan, validateGstin } from "@/lib/validation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";

const STEP_LABELS = ONBOARDING_STEPS;

// Normalise a date string (ISO or yyyy-mm-dd) to a short "dd MMM yyyy" label.
function fmtDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Preview of the first generated invoice number, e.g. prefix "INV-2026-" -> "INV-2026-0001".
function formatInvoiceNumber(prefix: string, startingNumber: number): string {
  const p = prefix && prefix.trim() !== "" ? prefix.trim() : "INV";
  const suffix = p.endsWith("-") || p.endsWith("/") || p.endsWith(" ") ? "" : "-";
  return `${p}${suffix}${String(startingNumber).padStart(4, "0")}`;
}

export const OnboardingWizard: React.FC<{ step: number }> = ({ step }) => {
  const router = useRouter();
  const {
    companyProfile,
    updateCompanyProfile,
    financialYears,
    activeFinancialYearId,
    setActiveFinancialYear,
    setOnboardingStep,
    completeOnboarding,
  } = useApp();

  const stepIndex = Math.min(6, Math.max(1, step || 1));

  // Local form state seeded once from the current company profile.
  const [form, setForm] = useState({
    companyName: companyProfile.companyName || "",
    businessType: companyProfile.businessType || "",
    ownerName: companyProfile.ownerName || "",
    mobile: companyProfile.mobile || "",
    email: companyProfile.email || "",
    website: companyProfile.website || "",
    gstRegistered: companyProfile.gstRegistered || "unregistered",
    gstin: companyProfile.gstin || "",
    pan: companyProfile.pan || "",
    addressLine1: companyProfile.addressLine1 || companyProfile.streetAddress || "",
    addressLine2: companyProfile.addressLine2 || "",
    city: companyProfile.city || "",
    state: companyProfile.state || "",
    pincode: companyProfile.pincode || "",
    country: companyProfile.country || "India",
    invoicePrefix: companyProfile.invoicePrefix || "INV",
    invoiceStartingNumber: companyProfile.invoiceStartingNumber || 1,
    invoiceTerms: companyProfile.invoiceTerms || "",
  });

  const activeFy =
    financialYears.find((fy) => fy.id === activeFinancialYearId) || financialYears[0];
  const progress = Math.round((stepIndex / 6) * 100);

  // Shared GSTIN/PAN validation (same rules as Settings -> Company Profile via
  // src/lib/validation.ts). Onboarding must not use different rules than Settings.
  const [taxErrors, setTaxErrors] = useState<Record<string, string>>({});

  const validateTaxStep = (): boolean => {
    const gstinErr = validateGstin().validate(form.gstin);
    const panErr = validatePan().validate(form.pan);
    const errors: Record<string, string> = {};
    if (gstinErr) errors.gstin = gstinErr;
    if (panErr) errors.pan = panErr;
    setTaxErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    const next = stepIndex + 1;
    setOnboardingStep(next);
    router.push(`/onboarding/${next <= 6 ? STEP_LABELS[next - 1].href.split("/").pop() : ""}`);
  };

  const goBack = () => {
    if (stepIndex <= 1) {
      // An account that has NOT finished onboarding has no dashboard to return
      // to — send the user to the app home instead of a fake dashboard.
      router.push("/");
      return;
    }
    const prev = stepIndex - 1;
    setOnboardingStep(prev);
    router.push(STEP_LABELS[prev - 1].href);
  };

  const saveBusiness = () => {
    updateCompanyProfile({
      companyName: form.companyName,
      businessType: form.businessType,
      ownerName: form.ownerName,
      mobile: form.mobile,
      email: form.email,
      website: form.website,
    });
  };

  const saveTax = () => {
    updateCompanyProfile({
      gstRegistered: form.gstRegistered,
      gstin: form.gstin.trim().toUpperCase(),
      pan: form.pan.trim().toUpperCase(),
    });
  };

  const saveAddress = () => {
    updateCompanyProfile({
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
      country: form.country,
    });
  };

  const saveInvoice = () => {
    updateCompanyProfile({
      invoicePrefix: form.invoicePrefix,
      invoiceStartingNumber: Number(form.invoiceStartingNumber) || 1,
      invoiceTerms: form.invoiceTerms,
    });
  };

  const saveFy = () => {
    if (activeFy) setActiveFinancialYear(activeFy.id);
  };

  const currentStep = STEP_LABELS[stepIndex - 1];

  const step1Valid = form.companyName.trim() !== "";
  const step4Valid = Number(form.invoiceStartingNumber) > 0;

  return (
    <div className="min-h-screen bg-[#f7f9fb]">
      {/* Top bar */}
      <div className="bg-[#1b1c1d] text-white">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BizLedgerLogo size="compact" className="ring-1 ring-white/10" />
            <span className="font-bold tracking-tight text-white">BizLedger</span>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
            Welcome — let&apos;s set up your business
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-1 bg-[#93000b] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Stepper */}
        <div className="mb-8 hidden md:flex items-center gap-2 overflow-x-auto pb-2">
          {STEP_LABELS.map((s, i) => {
            const num = i + 1;
            const isDone = num < stepIndex;
            const isCurrent = num === stepIndex;
            return (
              <div key={s.href} className="flex items-center gap-2 shrink-0">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    isDone
                      ? "bg-[#93000b] text-white"
                      : isCurrent
                        ? "bg-[#93000b] text-white ring-4 ring-[#93000b]/20"
                        : "bg-[#eceef0] text-gray-500"
                  }`}
                >
                  {isDone ? "✓" : num}
                </div>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    isCurrent ? "text-[#191c1e]" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
                {num < 6 && <span className="w-4 h-px bg-[#eceef0] mx-1" />}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#eceef0] bg-white shadow-sm">
          <div className="border-b border-[#eceef0] px-6 py-5">
            <h1 className="text-xl font-bold text-[#191c1e] tracking-tight">
              Step {stepIndex} of 6 · {currentStep.label}
            </h1>
            <p className="text-xs text-gray-500 mt-1 max-w-lg">
              {stepIndex === 1 && "Tell us about your business so we can personalise your ledger."}
              {stepIndex === 2 && "Record your tax identifiers — GST status, GSTIN and PAN."}
              {stepIndex === 3 && "Enter your registered billing / invoice address."}
              {stepIndex === 4 && "Set your invoice prefix and numbering so invoices generate automatically."}
              {stepIndex === 5 && "Choose the accounting period (financial year) your books use."}
              {stepIndex === 6 && "Review everything and finish — you can change all of this later in Settings."}
            </p>
          </div>

          <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* -------- STEP 1: Business Details -------- */}
            {stepIndex === 1 && (
              <React.Fragment>
                <div className="sm:col-span-2">
                  <Input
                    label="Business name"
                    required
                    icon="storefront"
                    placeholder="e.g. Ramesh Furniture Works"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Select
                    label="Business type"
                    options={[
                      { value: "", label: "Select business type..." },
                      { value: "Proprietorship", label: "Sole Proprietorship" },
                      { value: "Partnership", label: "Partnership" },
                      { value: "Private Limited Company", label: "Private Limited Company" },
                      { value: "LLP", label: "Limited Liability Partnership (LLP)" },
                      { value: "One Person Company", label: "One Person Company (OPC)" },
                      { value: "Other", label: "Other" },
                    ]}
                    value={form.businessType}
                    onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                  />
                </div>
                <Input
                  label="Owner / contact person"
                  icon="person"
                  placeholder="e.g. Ramesh Kumar"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
                <Input
                  label="Mobile number"
                  icon="call"
                  placeholder="+91 98765 43210"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
                <Input
                  label="Email address"
                  icon="mail"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  label="Website (optional)"
                  icon="language"
                  placeholder="https://..."
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </React.Fragment>
            )}

            {/* -------- STEP 2: Tax & GST -------- */}
            {stepIndex === 2 && (
              <React.Fragment>
                <div className="sm:col-span-2">
                  <Select
                    label="GST registration status"
                    options={[
                      { value: "registered", label: "GST Registered" },
                      { value: "composite", label: "Composite Scheme (GST)" },
                      { value: "unregistered", label: "Not GST Registered" },
                      { value: "consumer", label: "Individual / Consumer" },
                    ]}
                    value={form.gstRegistered}
                    onChange={(e) =>
                      setForm({ ...form, gstRegistered: e.target.value as typeof form.gstRegistered })
                    }
                    helperText="Your GST status controls whether GSTIN is required on invoices."
                  />
                </div>
                <Input
                  label="GSTIN"
                  required
                  icon="receipt_long"
                  placeholder="e.g. 33AAAAA0000A1Z5"
                  value={form.gstin}
                  error={taxErrors.gstin}
                  onChange={(e) =>
                    setForm({ ...form, gstin: e.target.value.trim().toUpperCase() })
                  }
                />
                <Input
                  label="PAN"
                  required
                  icon="badge"
                  placeholder="e.g. ABCDE1234F"
                  value={form.pan}
                  error={taxErrors.pan}
                  onChange={(e) =>
                    setForm({ ...form, pan: e.target.value.trim().toUpperCase() })
                  }
                />
              </React.Fragment>
            )}

            {/* -------- STEP 3: Address -------- */}
            {stepIndex === 3 && (
              <React.Fragment>
                <div className="sm:col-span-2">
                  <Input
                    label="Address line 1"
                    required
                    icon="map"
                    placeholder="House no, street, area"
                    value={form.addressLine1}
                    onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Address line 2 (optional)"
                    icon="map"
                    placeholder="Landmark, locality"
                    value={form.addressLine2}
                    onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                  />
                </div>
                <Input
                  label="City"
                  required
                  icon="location_city"
                  placeholder="e.g. Coimbatore"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
                <Input
                  label="State"
                  icon="location_on"
                  placeholder="e.g. Tamil Nadu"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
                <Input
                  label="PIN code"
                  icon="pin_drop"
                  placeholder="e.g. 641004"
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                />
                <Input
                  label="Country"
                  icon="public"
                  placeholder="e.g. India"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </React.Fragment>
            )}

            {/* -------- STEP 4: Invoice Setup -------- */}
            {stepIndex === 4 && (
              <React.Fragment>
                <div className="sm:col-span-2">
                  <Input
                    label="Invoice number prefix"
                    icon="tag"
                    placeholder="e.g. INV-2026-"
                    value={form.invoicePrefix}
                    onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                    helperText="Added before the auto-incrementing number on every invoice."
                  />
                </div>
                <Input
                  label="Starting number"
                  type="number"
                  icon="numbers"
                  min={1}
                  value={String(form.invoiceStartingNumber)}
                  onChange={(e) =>
                    setForm({ ...form, invoiceStartingNumber: Number(e.target.value) || 1 })
                  }
                />
                <div className="sm:col-span-2 flex items-start gap-2 rounded-lg bg-[#f7f9fb] border border-[#eceef0] px-3 py-2.5">
                  <span className="material-symbols-outlined text-[#93000b] text-[18px]">preview</span>
                  <div>
                    <p className="text-[11px] font-semibold text-[#191c1e]">Preview</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {formatInvoiceNumber(form.invoicePrefix, Number(form.invoiceStartingNumber) || 1)}
                    </p>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">
                    Default invoice Terms & Conditions
                  </label>
                  <textarea
                    value={form.invoiceTerms}
                    onChange={(e) => setForm({ ...form, invoiceTerms: e.target.value })}
                    rows={3}
                    placeholder="Payment due within 15 days, interest @18% p.a. on overdue..."
                    className="w-full px-3 py-2 text-xs border border-[#eceef0] bg-[#f7f9fb] focus:border-[#93000b] focus:bg-white rounded-lg outline-none resize-none"
                  />
                </div>
              </React.Fragment>
            )}

            {/* -------- STEP 5: Financial Year -------- */}
            {stepIndex === 5 && (
              <React.Fragment>
                <div className="sm:col-span-2">
                  <Select
                    label="Active financial year"
                    options={financialYears.map((fy) => ({
                      value: fy.id,
                      label: `${fy.name} (${fmtDate(fy.startDate)} – ${fmtDate(fy.endDate)})`,
                    }))}
                    value={activeFy?.id ?? ""}
                    onChange={(e) => {
                      const fy = financialYears.find((f) => f.id === e.target.value);
                      if (fy) setActiveFinancialYear(fy.id);
                    }}
                    helperText="This is the accounting period your books and reports use. You can manage financial years anytime in Settings → Financial Year."
                  />
                </div>
                {activeFy && (
                  <div className="sm:col-span-2 rounded-lg bg-[#f7f9fb] border border-[#eceef0] px-3 py-2.5 text-xs text-gray-500">
                    <span className="font-semibold text-[#191c1e]">{activeFy.name}</span> runs from{" "}
                    {fmtDate(activeFy.startDate)} to {fmtDate(activeFy.endDate)}.
                  </div>
                )}
              </React.Fragment>
            )}

            {/* -------- STEP 6: Review -------- */}
            {stepIndex === 6 && (
              <div className="sm:col-span-2 space-y-5">
                <ReviewBlock title="Business Details">
                  <ReviewRow label="Business name" value={companyProfile.companyName} />
                  <ReviewRow label="Business type" value={companyProfile.businessType} />
                  <ReviewRow label="Owner / contact" value={companyProfile.ownerName} />
                  <ReviewRow label="Mobile" value={companyProfile.mobile} />
                  <ReviewRow label="Email" value={companyProfile.email} />
                </ReviewBlock>
                <ReviewBlock title="Tax & GST">
                  <ReviewRow label="GST status" value={gstLabel(companyProfile.gstRegistered)} />
                  <ReviewRow label="GSTIN" value={companyProfile.gstin} />
                  <ReviewRow label="PAN" value={companyProfile.pan} />
                </ReviewBlock>
                <ReviewBlock title="Address">
                  <ReviewRow
                    label="Address"
                    value={[companyProfile.addressLine1, companyProfile.addressLine2]
                      .filter(Boolean)
                      .join(", ")}
                  />
                  <ReviewRow
                    label="City / State"
                    value={[companyProfile.city, companyProfile.state].filter(Boolean).join(", ")}
                  />
                  <ReviewRow
                    label="PIN / Country"
                    value={[companyProfile.pincode, companyProfile.country].filter(Boolean).join(", ")}
                  />
                </ReviewBlock>
                <ReviewBlock title="Invoice Setup">
                  <ReviewRow
                    label="Next invoice number"
                    value={formatInvoiceNumber(
                      companyProfile.invoicePrefix || "INV",
                      companyProfile.invoiceStartingNumber || 1
                    )}
                  />
                </ReviewBlock>
                <ReviewBlock title="Financial Year">
                  <ReviewRow
                    label="Active financial year"
                    value={
                      activeFy
                        ? `${activeFy.name} (${fmtDate(activeFy.startDate)} – ${fmtDate(activeFy.endDate)})`
                        : "—"
                    }
                  />
                </ReviewBlock>
                <p className="text-[11px] text-gray-500 border-t border-[#eceef0] pt-3">
                  This is a fresh account with zero transactions. After finishing you will land on your
                  dashboard and can add data, import demo data, or subscribe to a plan at any time.
                </p>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="border-t border-[#eceef0] px-6 py-4 flex items-center justify-between">
            <button
              onClick={goBack}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:bg-[#f7f9fb] px-4 py-2 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              {stepIndex === 1 ? "Home" : "Back"}
            </button>

            {stepIndex < 6 ? (
              <button
                onClick={() => {
                  if (stepIndex === 1) {
                    if (!step1Valid) return;
                    saveBusiness();
                  } else if (stepIndex === 2) {
                    if (!validateTaxStep()) return;
                    saveTax();
                  } else if (stepIndex === 3) {
                    saveAddress();
                  } else if (stepIndex === 4) {
                    if (!step4Valid) return;
                    saveInvoice();
                  } else if (stepIndex === 5) {
                    saveFy();
                  }
                  goNext();
                }}
                disabled={stepIndex === 1 && !step1Valid}
                className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-40"
              >
                Continue
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  completeOnboarding();
                  router.replace("/dashboard");
                }}
                className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-6 py-2.5 rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
                Finish &amp; Open Dashboard
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-gray-400">
          You can edit any of this later in Settings · Your data is saved locally as you go, so you
          can close this page and resume where you left off.
        </p>
      </div>
    </div>
  );
};

function gstLabel(status: string): string {
  switch (status) {
    case "registered":
      return "GST Registered";
    case "composite":
      return "Composite Scheme (GST)";
    case "unregistered":
      return "Not GST Registered";
    case "consumer":
      return "Individual / Consumer";
    default:
      return "—";
  }
}

const ReviewBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border border-[#eceef0] overflow-hidden">
    <div className="bg-[#f7f9fb] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#191c1e] border-b border-[#eceef0]">
      {title}
    </div>
    <div className="divide-y divide-[#f1f3f5]">{children}</div>
  </div>
);

const ReviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 px-3 py-2">
    <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
    <span className="text-[11px] font-semibold text-[#191c1e] text-right">
      {value || "—"}
    </span>
  </div>
);
