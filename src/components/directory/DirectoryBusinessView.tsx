"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Store,
  Phone,
  PhoneOff,
  MapPin,
  BadgeCheck,
  Globe,
  Mail,
  UserRound,
  Hash,
  ShieldCheck,
} from "lucide-react";
import { getDirectoryBusiness, telLink, directoryEntitlement } from "@/lib/directory";
import { useApp } from "@/context/AppContext";
import { BusinessNetworkGate } from "@/components/directory/BusinessNetworkGate";

export const DirectoryBusinessView: React.FC = () => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { activePlan } = useApp();
  const entitled = directoryEntitlement(activePlan).allowed;

  const business = params?.id ? getDirectoryBusiness(params.id) : null;

  if (!business) {
    return (
      <BusinessNetworkGate entitled={entitled}>
        <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-12 text-center">
        <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#191c1e]">Listing not found</p>
        <p className="text-xs text-gray-500 mt-1">
          This business is no longer listed or is undergoing review.
        </p>
        <button
          onClick={() => router.push("/directory")}
          className="mt-4 inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </button>
      </div>
      </BusinessNetworkGate>
    );
  }

  const callHref = telLink(business.primaryPhone);

  return (
    <BusinessNetworkGate entitled={entitled}>
    <div className="space-y-6">
      <button
        onClick={() => router.push("/directory")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#93000b] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Directory
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-[#93000b] flex items-center justify-center shrink-0">
              <Store className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
                {business.companyName}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="bg-[#93000b]/10 text-[#93000b] text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                  {business.businessType}
                </span>
                {business.categories.map((c) => (
                  <span
                    key={c}
                    className="bg-[#f2f4f6] text-gray-600 text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {callHref ? (
            <a
              href={callHref}
              className="inline-flex items-center justify-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
            >
              <Phone className="w-4 h-4" />
              Call Now
            </a>
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 px-5 py-2.5 rounded-lg text-sm font-semibold shrink-0">
              <PhoneOff className="w-4 h-4" />
              No Contact Available
            </span>
          )}
        </div>

        <p className="mt-4 text-sm text-gray-600 leading-relaxed max-w-3xl">{business.description}</p>
      </div>

      {/* Contact + details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-[#191c1e]">About This Business</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-gray-500 text-[11px]">Address</div>
                <div className="font-semibold text-gray-800">
                  {business.streetAddress}
                  {business.landmark ? `, ${business.landmark}` : ""}
                </div>
                <div className="text-gray-500">{business.city}, {business.state} - {business.pincode}</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <UserRound className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-gray-500 text-[11px]">Contact Person</div>
                <div className="font-semibold text-gray-800">{business.ownerName}</div>
              </div>
            </div>

            {business.primaryPhone && (
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-gray-500 text-[11px]">Primary Phone</div>
                  <a
                    href={callHref ?? undefined}
                    className="font-semibold text-[#93000b] hover:underline"
                  >
                    {business.primaryPhone}
                  </a>
                </div>
              </div>
            )}

            {business.alternatePhone && (
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-gray-500 text-[11px]">Alternate Phone</div>
                  <div className="font-semibold text-gray-800">{business.alternatePhone}</div>
                </div>
              </div>
            )}

            {business.email && (
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-gray-500 text-[11px]">Email</div>
                  <a
                    href={`mailto:${business.email}`}
                    className="font-semibold text-gray-800 hover:text-[#93000b]"
                  >
                    {business.email}
                  </a>
                </div>
              </div>
            )}

            {business.website && (
              <div className="flex items-start gap-2">
                <Globe className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-gray-500 text-[11px]">Website</div>
                  <a
                    href={business.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-gray-800 hover:text-[#93000b]"
                  >
                    {business.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              </div>
            )}

            {business.gstin && (
              <div className="flex items-start gap-2">
                <Hash className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-gray-500 text-[11px]">GSTIN</div>
                  <div className="font-mono font-semibold text-gray-800">{business.gstin}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* GST + transparency card */}
        <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#191c1e]">Verification</h3>

          {business.gstStatus === "GST Verified" ? (
            <div className="flex items-start gap-2.5">
              <BadgeCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-emerald-700">GST Verified</div>
                <div className="text-[11px] text-gray-500">
                  GSTIN cross-checked by BizLedger.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-gray-800">GSTIN Provided</div>
                <div className="text-[11px] text-gray-500">
                  Owner-supplied GSTIN. Not independently verified.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </BusinessNetworkGate>
  );
};