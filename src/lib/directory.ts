// Business Directory service layer.
//
// The directory is a public, read-only "Discover → View → Call" module. It
// holds OPT-IN listings that are separate from the private CompanyProfile and
// are scoped per business. Visitors can search/filter PUBLISHED businesses and
// call them via a tel: link; the owner manages only their own listing.
//
// Backend-authoritative: reads and writes flow through the HTTP API in
// `src/lib/api/directory.ts`, backed by the `business_directory_profile` table.
// This module keeps the pure helpers (vocabularies, validation-ish utilities,
// filtering, entitlements) plus the read-only seed catalog used ONLY as a demo
// fallback when the backend has no published listings yet. A tiny in-memory
// cache of the caller's own listing powers synchronous plan-usage lookups; it
// is never the source of truth.
import { DirectoryBusiness, DirectoryListingStatus } from "@/types";
import { INDIAN_STATES } from "@/lib/india";

// Derive the numeric GST state code from the canonical state name.
export function stateCodeFromName(stateName?: string): string | undefined {
  if (!stateName) return undefined;
  const match = INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === (stateName || "").trim().toLowerCase()
  );
  return match?.code;
}

// Centralized business-type vocabulary (no free typing).
export const DIRECTORY_BUSINESS_TYPES: DirectoryBusiness["businessType"][] = [
  "Manufacturer",
  "Dealer",
  "Wholesaler",
  "Distributor",
  "Retailer",
  "Supplier",
];

// Centralized categories for listings (not to be confused with product
// categories). Kept in one place for consistency across owner + admin forms.
export const DIRECTORY_CATEGORIES: string[] = [
  "Pipes & Tubes",
  "Structural Steel",
  "Fittings & Flanges",
  "Fasteners",
  "Bearings",
  "Electrical",
  "Plumbing",
  "Packaging",
  "Tools & Hardware",
  "Automotive Parts",
  "Machinery",
  "General Trading",
];

export const DIRECTORY_STATUS_ORDER: DirectoryListingStatus[] = [
  "Published",
  "Pending Review",
  "Suspended",
  "Rejected",
  "Not Listed",
];

export function isDirectoryStatus(value: string): value is DirectoryListingStatus {
  return DIRECTORY_STATUS_ORDER.includes(value as DirectoryListingStatus);
}

// Normalize the GST status: only "GSTIN Provided" (owner-supplied) is set from
// a string; "GST Verified" is reserved for the backend moderation step and
// never guessed by the client.
export function gstStatusFromGstin(gstin?: string): DirectoryBusiness["gstStatus"] {
  const v = (gstin ?? "").trim();
  return v ? "GSTIN Provided" : "Not Provided";
}

// Visitor summary — only intentionally public fields, never bank/tax details.
export interface DirectoryCard {
  id: string;
  companyName: string;
  businessType: DirectoryBusiness["businessType"];
  categories: string[];
  city: string;
  state: string;
  primaryPhone: string;
  website?: string;
  hasPhone: boolean;
}

export function toDirectoryCard(b: DirectoryBusiness): DirectoryCard {
  return {
    id: b.id,
    companyName: b.companyName,
    businessType: b.businessType,
    categories: b.categories,
    city: b.city,
    state: b.state,
    primaryPhone: b.primaryPhone,
    website: b.website,
    hasPhone: !!b.primaryPhone?.trim(),
  };
}

// ---------------------------------------------------------------------------
// Seed catalog (read-only demo fallback)
// ---------------------------------------------------------------------------

// A small read-only set of sample published businesses used ONLY when the
// backend serves zero published listings, so a brand-new account's directory
// is still populated without depending on the admin app.
export function getSeedBusinesses(): DirectoryBusiness[] {
  const now = "2026-01-05T00:00:00.000Z";
  const seed: DirectoryBusiness[] = [
    {
      id: "seed-sv-steel",
      accountId: "seed-a1",
      status: "Published",
      createdAt: now,
      updatedAt: now,
      companyName: "Shree Vallabh Steel Traders",
      businessType: "Dealer",
      categories: ["Structural Steel", "Pipes & Tubes"],
      description:
        "Authorised dealer of structural steel, pipes and tubes for construction and fabrication across Gujarat.",
      streetAddress: "Plot 14, GIDC Industrial Estate, Odhav",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "382415",
      landmark: "Near Odhav Circle",
      ownerName: "Ramesh Patel",
      primaryPhone: "9876543210",
      email: "hello@svsteel.in",
      website: "https://svsteel.in",
      gstin: "24AAAAA0000A1Z5",
      gstStatus: "GSTIN Provided",
      logoUrl: undefined,
    },
    {
      id: "seed-kh-fasteners",
      accountId: "seed-a2",
      status: "Published",
      createdAt: now,
      updatedAt: now,
      companyName: "Kailash Hardware & Fasteners",
      businessType: "Retailer",
      categories: ["Fasteners", "Tools & Hardware"],
      description:
        "Retail and trade supply of fasteners, bolts, nuts and general hardware tools.",
      streetAddress: "Shop 3, Sadar Bazaar, Old Market Road",
      city: "Delhi",
      state: "Delhi",
      pincode: "110006",
      ownerName: "Vikram Malhotra",
      primaryPhone: "9810111222",
      website: "https://kailashfasteners.in",
      gstin: "07AAAAA7777A1Z2",
      gstStatus: "GSTIN Provided",
      logoUrl: undefined,
    },
    {
      id: "seed-cf-bearings",
      accountId: "seed-a3",
      status: "Published",
      createdAt: now,
      updatedAt: now,
      companyName: "Crescent Fluid Power Systems",
      businessType: "Distributor",
      categories: ["Bearings", "Machinery"],
      description:
        "Stockist and distributor of industrial bearings, seals and pneumatic components.",
      streetAddress: "Unit 22, MIDC Bhosari",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411026",
      ownerName: "Asha Kulkarni",
      primaryPhone: "9822011333",
      email: "sales@crescentfp.com",
      website: "https://crescentfp.com",
      gstin: "27AAAAA9999A1Z8",
      gstStatus: "GSTIN Provided",
      logoUrl: undefined,
    },
    {
      id: "seed-sg-plumbing",
      accountId: "seed-a4",
      status: "Published",
      createdAt: now,
      updatedAt: now,
      companyName: "Sri Ganga Plumbing Supplies",
      businessType: "Wholesaler",
      categories: ["Plumbing", "Fittings & Flanges"],
      description:
        "Wholesale distributor of brass and PVC plumbing fittings and flanges.",
      streetAddress: "84, Chintadripet High Road",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600002",
      ownerName: "Murugan Selvam",
      primaryPhone: "9940011222",
      gstin: "33AAAAA1111A1Z4",
      gstStatus: "GSTIN Provided",
      logoUrl: undefined,
    },
    {
      id: "seed-rr-packing",
      accountId: "seed-a5",
      status: "Published",
      createdAt: now,
      updatedAt: now,
      companyName: "Rathore Rigid Packaging",
      businessType: "Manufacturer",
      categories: ["Packaging"],
      description:
        "Manufacturer of corrugated boxes, cartons and rigid packaging solutions.",
      streetAddress: "Shed 7, RIICO Industrial Area, Sitapura",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302022",
      ownerName: "Devendra Rathore",
      primaryPhone: "9829011444",
      website: "https://rathorepackaging.in",
      gstin: "08AAAAA2222A1Z1",
      gstStatus: "GSTIN Provided",
      logoUrl: undefined,
    },
    {
      id: "seed-bha-autoparts",
      accountId: "seed-a6",
      status: "Published",
      createdAt: now,
      updatedAt: now,
      companyName: "Bharat Auto Parts Mart",
      businessType: "Supplier",
      categories: ["Automotive Parts", "Fittings & Flanges"],
      description:
        "Bulk supplier of aftermarket automotive spare parts and fittings for workshops and garages.",
      streetAddress: "58, Grand Trunk Road, Howrah",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "711101",
      ownerName: "Sourav Das",
      primaryPhone: "9830011555",
      gstin: "19AAAAA3333A1Z9",
      gstStatus: "GSTIN Provided",
      logoUrl: undefined,
    },
  ];
  return seed;
}

// Resolve a seed listing by id — returns a PUBLISHED seed or null.
export function getSeedBusiness(id: string): DirectoryBusiness | null {
  return (
    getSeedBusinesses().find((b) => b.id === id && b.status === "Published") ?? null
  );
}

// ---------------------------------------------------------------------------
// Visitor-facing pure helpers (searchable/filterable, PUBLISHED input only)
// ---------------------------------------------------------------------------

export interface DirectoryFilters {
  query?: string;
  businessType?: DirectoryBusiness["businessType"] | "All";
  category?: string;
  state?: string;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function searchDirectoryBusinesses(
  businesses: DirectoryBusiness[],
  query: string
): DirectoryBusiness[] {
  const q = normalizeQuery(query);
  if (!q) return businesses;
  return businesses.filter((b) =>
    [
      b.companyName,
      b.city,
      b.state,
      b.businessType,
      ...b.categories,
      b.ownerName,
      b.primaryPhone,
      b.description,
    ]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q))
  );
}

export function filterDirectoryBusinesses(
  businesses: DirectoryBusiness[],
  filters: DirectoryFilters
): DirectoryBusiness[] {
  let out = searchDirectoryBusinesses(businesses, filters.query ?? "");
  if (filters.businessType && filters.businessType !== "All") {
    out = out.filter((b) => b.businessType === filters.businessType);
  }
  if (filters.category) {
    out = out.filter((b) => b.categories.includes(filters.category!));
  }
  if (filters.state) {
    out = out.filter((b) => b.state === filters.state);
  }
  return out;
}

// Facet lists derived from the published pool (stable ordering).
export function getDirectoryCategories(
  businesses: DirectoryBusiness[]
): string[] {
  const set = new Set<string>();
  businesses.forEach((b) => b.categories.forEach((c) => set.add(c)));
  return DIRECTORY_CATEGORIES.filter((c) => set.has(c));
}

export function getDirectoryStates(businesses: DirectoryBusiness[]): string[] {
  const set = new Set<string>();
  businesses.forEach((b) => set.add(b.state));
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Owner I/O (business-scoped on the backend at /api/directory/mine)
// ---------------------------------------------------------------------------

export interface DirectoryDraft {
  companyName: string;
  businessType: DirectoryBusiness["businessType"];
  categories: string[];
  description: string;
  streetAddress: string;
  city: string;
  state: string;
  stateCode?: string;
  pincode: string;
  landmark?: string;
  ownerName: string;
  primaryPhone: string;
  alternatePhone?: string;
  email?: string;
  website?: string;
  gstin?: string;
}

// In-memory mirror of the caller's own listing, populated by the API layer
// (src/lib/api/directory.ts). Used ONLY for synchronous plan-usage lookups
// (the directoryListings gauge); never as the source of truth.
const mineCache = new Map<string, DirectoryBusiness>();

export function setMyDirectoryListingCache(
  businessId: string,
  listing: DirectoryBusiness | null
): void {
  if (listing) mineCache.set(businessId, listing);
  else mineCache.delete(businessId);
}

export function getMyDirectoryListingCache(businessId: string): DirectoryBusiness | null {
  return mineCache.get(businessId) ?? null;
}

// Compose a tel: link for a listing, only when a phone is present. The number
// is assumed to be a national 10-digit number; an already country-coded (+91)
// input is honored without double-prefixing.
export function telLink(phone: string): string | null {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const hasCountryCode = digits.length >= 12 && digits.startsWith("91");
  return `tel:+${hasCountryCode ? digits : `91${digits}`}`;
}

// Whether the owning account is entitled to a listing under its plan. The plan
// platform always grants each account one listing; this resolves the plan's
// `directoryListings` ceiling so the owner UI and the admin agree on the same
// source of truth. `getActivePlan` is reused from the entitlement engine.
export interface DirectoryEntitlement {
  allowed: boolean;
  limit: number | "Unlimited";
  reason: "ok" | "no-active-plan" | "limit";
}

export function directoryEntitlement(
  plan: { limits: Record<string, number | "Unlimited"> } | null
): DirectoryEntitlement {
  if (!plan) {
    return { allowed: false, limit: 0, reason: "no-active-plan" };
  }
  const limit = plan.limits["directoryListings"] ?? 0;
  if (isUnlimited(limit)) {
    return { allowed: true, limit: "Unlimited", reason: "ok" };
  }
  const owned = limit as number;
  const allowed = owned > 0;
  return {
    allowed,
    limit: owned,
    reason: allowed ? "ok" : "limit",
  };
}

function isUnlimited(value: number | "Unlimited"): value is "Unlimited" {
  return value === "Unlimited";
}