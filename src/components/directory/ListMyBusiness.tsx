"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Clock,
  Ban,
  XCircle,
  CircleOff,
  ChevronLeft,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import {
  DIRECTORY_BUSINESS_TYPES,
  DIRECTORY_CATEGORIES,
  getMyDirectoryListing,
  submitDirectoryListing,
  unlistMyBusiness,
  saveDirectoryListing,
  directoryEntitlement,
  gstStatusFromGstin,
} from "@/lib/directory";
import type { DirectoryDraft } from "@/lib/directory";
import type { DirectoryBusiness } from "@/types";
import { INDIAN_STATES } from "@/lib/india";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { BusinessNetworkGate } from "@/components/directory/BusinessNetworkGate";
import { validateBusinessListingForm } from "@/lib/validation";

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  "Published": { label: "Live in Directory", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <BadgeCheck className="w-3.5 h-3.5" /> },
  "Pending Review": { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="w-3.5 h-3.5" /> },
  "Suspended": { label: "Suspended", cls: "bg-red-50 text-red-700 border-red-200", icon: <Ban className="w-3.5 h-3.5" /> },
  "Rejected": { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> },
  "Not Listed": { label: "Not Listed", cls: "bg-gray-100 text-gray-600 border-gray-200", icon: <CircleOff className="w-3.5 h-3.5" /> },
};

const emptyDraft: DirectoryDraft = {
  companyName: "",
  businessType: "Dealer",
  categories: [],
  description: "",
  streetAddress: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  ownerName: "",
  primaryPhone: "",
  alternatePhone: "",
  email: "",
  website: "",
  gstin: "",
};

const categoryToggled = (categories: string[], c: string) =>
  categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c];

export const ListMyBusiness: React.FC = () => {
  const { account } = useAuth();
  const { activePlan } = useApp();
  const router = useRouter();

  const accountId = account?.id ?? "";
  const [existing, setExisting] = useState<DirectoryBusiness | null>(() =>
    getMyDirectoryListing(accountId)
  );
  const [draft, setDraft] = useState<DirectoryDraft>(() => {
    const e = getMyDirectoryListing(accountId);
    return e
      ? {
          companyName: e.companyName,
          businessType: e.businessType,
          categories: e.categories,
          description: e.description,
          streetAddress: e.streetAddress,
          city: e.city,
          state: e.state,
          pincode: e.pincode,
          landmark: e.landmark ?? "",
          ownerName: e.ownerName,
          primaryPhone: e.primaryPhone,
          alternatePhone: e.alternatePhone ?? "",
          email: e.email ?? "",
          website: e.website ?? "",
          gstin: e.gstin ?? "",
        }
      : emptyDraft;
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlist, setConfirmUnlist] = useState(false);

  const entitlement = useMemo(() => directoryEntitlement(activePlan), [activePlan]);
  const status = existing?.status ?? "Not Listed";
  const statusMeta = STATUS_STYLES[status];

  const set = <K extends keyof DirectoryDraft>(k: K, v: DirectoryDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const validate = (): string | null => {
    if (draft.categories.length === 0) return "Select at least one category.";
    const fieldErrs = validateBusinessListingForm({
      companyName: draft.companyName,
      streetAddress: draft.streetAddress,
      city: draft.city,
      state: draft.state,
      pincode: draft.pincode,
      ownerName: draft.ownerName,
      primaryPhone: draft.primaryPhone,
      description: draft.description || "",
    });
    const first = Object.keys(fieldErrs)[0];
    if (first) return fieldErrs[first];
    if (draft.website && !/^https?:\/\//.test(draft.website.trim()) && !draft.website.includes("."))
      return "Enter a valid website URL.";
    return null;
  };

  const handleSave = () => {
    if (!entitlement.allowed) {
      setError("You need an active paid plan (Business or Enterprise) to list your business.");
      return;
    }
    const v = validate();
    if (v) return setError(v);
    setError(null);
    try {
      saveDirectoryListing(accountId, draft, existing, entitlement);
      setExisting(getMyDirectoryListing(accountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your listing.");
    }
  };

  const handleSubmit = () => {
    if (!entitlement.allowed) {
      setError("You need an active paid plan (Business or Enterprise) to publish a listing.");
      return;
    }
    const v = validate();
    if (v) return setError(v);
    setError(null);
    try {
      submitDirectoryListing(accountId, draft, entitlement);
      setExisting(getMyDirectoryListing(accountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit your listing.");
    }
  };

  const handleUnlist = () => {
    unlistMyBusiness(accountId);
    setExisting(getMyDirectoryListing(accountId));
    setConfirmUnlist(false);
  };

  return (
    <BusinessNetworkGate entitled={entitlement.allowed}>
      <div className="space-y-6">
      <button
        onClick={() => router.push("/directory")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#93000b] transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Directory
      </button>

      {/* Header + status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">List My Business</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Publish your business in the BizLedger directory so prospective buyers & vendors can call you.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusMeta.cls}`}
        >
          {statusMeta.icon}
          {statusMeta.label}
        </span>
      </div>

      {!entitlement.allowed && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold">Listing requires a paid plan</div>
              <div className="mt-0.5 text-amber-800/80">
                The Business Network is included with the Business and Enterprise plans.
                Upgrade to publish your business listing.
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push("/pricing")}
            className="shrink-0 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
          >
            View Plans &amp; Upgrade
          </button>
        </div>
      )}

      {existing && status === "Rejected" && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-xs">
            <div className="font-semibold">Listing was rejected by a moderator</div>
            <div className="mt-0.5 text-red-700/80">
              Review the details below, fix any issues, and resubmit for another review.
            </div>
          </div>
        </div>
      )}

      {existing && status === "Suspended" && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          <Ban className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-xs">
            <div className="font-semibold">Listing is suspended</div>
            <div className="mt-0.5 text-red-700/80">
              Update and resubmit your listing to request reactivation.
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-6 space-y-5">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-xs">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="Business / Company Name"
              value={draft.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="e.g. Shree Vallabh Steel Traders"
              required
            />
          </div>

          <div>
            <Select
              label="Business Type"
              value={draft.businessType}
              onChange={(e) => set("businessType", e.target.value as DirectoryDraft["businessType"])}
              options={DIRECTORY_BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
              required
            />
          </div>

          <div>
            <Input
              label="Contact Person Name"
              value={draft.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1.5">
            Categories <span className="text-error ml-0.5">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {DIRECTORY_CATEGORIES.map((c) => {
              const active = draft.categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("categories", categoryToggled(draft.categories, c))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    active
                      ? "bg-[#93000b] text-white border-[#93000b]"
                      : "bg-white text-gray-600 border-[#eceef0] hover:bg-[#f7f9fb]"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Input
            label="Description"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Short summary of what your business offers"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="Street Address"
              value={draft.streetAddress}
              onChange={(e) => set("streetAddress", e.target.value)}
              placeholder="Shop / unit / plot number, street, locality"
            />
          </div>
          <Input
            label="Landmark (optional)"
            value={draft.landmark}
            onChange={(e) => set("landmark", e.target.value)}
            placeholder="e.g. Near Odhav Circle"
          />
          <Input
            label="City"
            value={draft.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="City name"
            required
          />
          <div>
            <Select
              label="State"
              value={draft.state}
              onChange={(e) => set("state", e.target.value)}
              options={INDIAN_STATES.map((s) => ({ value: s.name, label: s.name }))}
              required
            />
          </div>
          <Input
            label="PIN Code"
            value={draft.pincode}
            onChange={(e) => set("pincode", e.target.value)}
            placeholder="6-digit"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Primary Phone"
            value={draft.primaryPhone}
            onChange={(e) => set("primaryPhone", e.target.value)}
            placeholder="10-digit mobile"
            required
          />
          <Input
            label="Alternate Phone (optional)"
            value={draft.alternatePhone}
            onChange={(e) => set("alternatePhone", e.target.value)}
            placeholder="10-digit mobile / landline"
          />
          <Input
            label="Email (optional)"
            type="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@business.com"
          />
          <Input
            label="Website (optional)"
            value={draft.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://yourbusiness.com"
          />
          <Input
            label="GSTIN (optional)"
            value={draft.gstin}
            onChange={(e) => set("gstin", e.target.value)}
            placeholder="15-character GSTIN"
          />
        </div>

        <p className="text-[11px] text-gray-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">info</span>
          GST status will be shown as &quot;GSTIN Provided&quot;. Verification happens in a backend step.
        </p>

        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#eceef0]">
          <Button variant="primary" icon="save" onClick={handleSave} disabled={!entitlement.allowed}>
            Save Draft
          </Button>
          <Button variant="secondary" icon="send" onClick={handleSubmit} disabled={!entitlement.allowed}>
            {existing && (status === "Published" || status === "Pending Review")
              ? "Resubmit for Review"
              : "Submit for Review"}
          </Button>
          {existing && (
            <Button
              variant="danger"
              icon="close"
              onClick={() => setConfirmUnlist(true)}
              className="ml-auto"
            >
              Unlist My Business
            </Button>
          )}
        </div>

        <p className="text-[10px] text-gray-400">
          {entitlement.allowed
            ? gstStatusFromGstin(draft.gstin)
            : "You need an active subscription to list your business."}
        </p>
      </div>

      {confirmUnlist && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <CircleOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#191c1e]">Unlist my business?</h3>
                <p className="text-xs text-gray-500">
                  Your listing will be hidden from the directory. Your drafted details are kept.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmUnlist(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleUnlist}>
                Yes, unlist
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </BusinessNetworkGate>
  );
};