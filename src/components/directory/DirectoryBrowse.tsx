"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Store, Phone, MapPin, Briefcase, PhoneOff } from "lucide-react";
import {
  DIRECTORY_BUSINESS_TYPES,
  getPublishedDirectoryBusinesses,
  filterDirectoryBusinesses,
  getDirectoryCategories,
  getDirectoryStates,
  toDirectoryCard,
  telLink,
  directoryEntitlement,
} from "@/lib/directory";
import { INDIAN_STATES } from "@/lib/india";
import { useApp } from "@/context/AppContext";
import { BusinessNetworkGate } from "@/components/directory/BusinessNetworkGate";

export const DirectoryBrowse: React.FC = () => {
  const router = useRouter();
  const { activePlan } = useApp();
  const entitled = directoryEntitlement(activePlan).allowed;
  const [query, setQuery] = useState("");
  const [businessType, setBusinessType] = useState<string>("All");
  const [category, setCategory] = useState<string>("All");
  const [state, setState] = useState<string>("All");

  const all = useMemo(() => getPublishedDirectoryBusinesses(), []);
  const categories = useMemo(() => getDirectoryCategories(all), [all]);
  const states = useMemo(() => getDirectoryStates(all), [all]);

  const filtered = useMemo(
    () =>
      filterDirectoryBusinesses(all, {
        query,
        businessType: businessType as "All",
        category: category === "All" ? undefined : category,
        state: state === "All" ? undefined : state,
      } as Parameters<typeof filterDirectoryBusinesses>[1]),
    [all, query, businessType, category, state]
  );

  const cards = useMemo(() => filtered.map(toDirectoryCard), [filtered]);

  return (
    <BusinessNetworkGate entitled={entitled}>
      <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Business Directory</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Discover and connect with vetted businesses across India. Call directly to get started.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/directory/mine"
            className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-[#93000b] border border-[#ffe0e2] px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
          >
            <Briefcase className="w-4 h-4" />
            <span>List My Business</span>
          </Link>
        </div>
      </div>

      {/* Search + Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs space-y-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by business name, category, city, owner..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Business Type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] rounded-lg outline-none transition-all"
            >
              <option value="All">All Business Types</option>
              {DIRECTORY_BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] rounded-lg outline-none transition-all"
            >
              <option value="All">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] rounded-lg outline-none transition-all"
            >
              <option value="All">All States</option>
              {INDIAN_STATES.filter((s) => states.includes(s.name)).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-500">
        <span className="font-semibold text-[#191c1e]">{cards.length}</span> business
        {cards.length === 1 ? "" : "es"} in directory
      </div>

      {/* Results Grid */}
      {cards.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-12 text-center">
          <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#191c1e]">No businesses found</p>
          <p className="text-xs text-gray-500 mt-1">
            Try adjusting your search or filters, or check back later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-xl border border-[#eceef0] shadow-xs p-5 flex flex-col hover:border-[#93000b]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-rose-100 text-[#93000b] flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <button
                      onClick={() => router.push(`/directory/business/${b.id}`)}
                      className="text-sm font-bold text-[#191c1e] hover:text-[#93000b] transition-colors text-left leading-tight"
                    >
                      {b.companyName}
                    </button>
                    <div className="text-[11px] text-gray-500 mt-0.5">{b.businessType}</div>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-gray-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {b.city}, {b.state}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.categories.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="bg-[#f2f4f6] text-gray-600 text-[10px] px-2 py-0.5 rounded font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>

              <div className="mt-auto pt-4 flex items-center gap-2">
                {b.hasPhone ? (
                  <a
                    href={telLink(b.primaryPhone) ?? undefined}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Now</span>
                  </a>
                ) : (
                  <span className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 px-3 py-2 rounded-lg text-xs font-semibold">
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>No Contact</span>
                  </span>
                )}
                <button
                  onClick={() => router.push(`/directory/business/${b.id}`)}
                  className="px-3 py-2 border border-[#eceef0] hover:bg-[#f7f9fb] rounded-lg text-xs font-semibold text-gray-600 transition-colors"
                >
                  View Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </BusinessNetworkGate>
  );
};