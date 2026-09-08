"use client";

import { http } from "@/lib/api-client";
import { setMyDirectoryListingCache } from "@/lib/directory";
import type { DirectoryDraft } from "@/lib/directory";
import type {
  DirectoryBusiness,
  DirectoryBusinessType,
  DirectoryGstStatus,
  DirectoryListingStatus,
} from "@/types";

export interface DirectoryBrowseFilters {
  q?: string;
  businessType?: string;
  category?: string;
  state?: string;
}

/** Card shape served by the PUBLIC browse endpoint (no internal fields). */
export interface DirectoryCardJson {
  id: string;
  companyName: string;
  businessType: string;
  categories: string[];
  city: string | null;
  state: string | null;
  primaryPhone: string | null;
  website: string | null;
  hasPhone: boolean;
}

/** Shape served by the PRIVATE /mine endpoints (any lifecycle state). */
export interface DirectoryMineJson {
  id: string;
  businessId: string;
  status: string;
  isListed: boolean;
  companyName: string;
  businessType: string;
  categories: string[];
  description: string | null;
  streetAddress: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  ownerName: string;
  primaryPhone: string | null;
  alternatePhone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  gstStatus: string;
  createdAt: string;
}

/** Shape served by the PUBLIC detail endpoint (published listings only). */
export type DirectoryPublicDetailJson = Omit<
  DirectoryMineJson,
  "businessId" | "status" | "isListed" | "createdAt"
>;

function str(v: string | null | undefined): string {
  return v ?? "";
}

type DetailFields = Pick<
  DirectoryBusiness,
  | "companyName"
  | "businessType"
  | "categories"
  | "description"
  | "streetAddress"
  | "city"
  | "state"
  | "stateCode"
  | "pincode"
  | "landmark"
  | "ownerName"
  | "primaryPhone"
  | "alternatePhone"
  | "email"
  | "website"
  | "gstin"
  | "gstStatus"
>;

function toDetailFields(
  json: Pick<
    DirectoryMineJson,
    | "companyName"
    | "businessType"
    | "categories"
    | "description"
    | "streetAddress"
    | "landmark"
    | "city"
    | "state"
    | "stateCode"
    | "pincode"
    | "ownerName"
    | "primaryPhone"
    | "alternatePhone"
    | "email"
    | "website"
    | "gstin"
    | "gstStatus"
  >
): DetailFields {
  return {
    companyName: json.companyName,
    businessType: json.businessType as DirectoryBusinessType,
    categories: json.categories,
    description: str(json.description),
    streetAddress: str(json.streetAddress),
    city: str(json.city),
    state: str(json.state),
    stateCode: str(json.stateCode) || undefined,
    pincode: str(json.pincode),
    landmark: str(json.landmark) || undefined,
    ownerName: json.ownerName,
    primaryPhone: str(json.primaryPhone),
    alternatePhone: str(json.alternatePhone) || undefined,
    email: str(json.email) || undefined,
    website: str(json.website) || undefined,
    gstin: str(json.gstin) || undefined,
    gstStatus: json.gstStatus as DirectoryGstStatus,
  };
}

/** Backend /mine JSON -> the frontend DirectoryBusiness shape. */
export function fromMineJson(json: DirectoryMineJson): DirectoryBusiness {
  return {
    id: json.id,
    // The backend scopes listings by businessId, so the legacy accountId field
    // is not part of its contract; the frontend never renders it.
    accountId: "",
    status: json.status as DirectoryListingStatus,
    createdAt: json.createdAt,
    updatedAt: json.createdAt,
    ...toDetailFields(json),
  };
}

/** Backend PUBLIC detail JSON -> frontend DirectoryBusiness (marked Published). */
export function fromPublicDetailJson(
  json: DirectoryPublicDetailJson,
): DirectoryBusiness {
  return {
    id: json.id,
    accountId: "",
    status: "Published",
    createdAt: "",
    updatedAt: "",
    ...toDetailFields(json),
  };
}

/**
 * Backend PUBLIC card JSON -> a minimal DirectoryBusiness suitable for the
 * client-side search/filter/facet helpers. Cards intentionally omit internal
 * detail fields, so those are padded with defaults.
 */
export function fromCardJson(card: DirectoryCardJson): DirectoryBusiness {
  return {
    id: card.id,
    accountId: "",
    status: "Published",
    createdAt: "",
    updatedAt: "",
    companyName: card.companyName,
    businessType: card.businessType as DirectoryBusinessType,
    categories: card.categories,
    description: "",
    streetAddress: "",
    city: str(card.city),
    state: str(card.state),
    pincode: "",
    ownerName: "",
    primaryPhone: str(card.primaryPhone),
    website: str(card.website) || undefined,
    gstStatus: "Not Provided",
  };
}

export const directoryApi = {
  /** PUBLIC — browse published listings (unauthenticated GET is supported). */
  browse: (filters: DirectoryBrowseFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.businessType && filters.businessType !== "All") {
      params.set("businessType", filters.businessType);
    }
    if (filters.category && filters.category !== "All") {
      params.set("category", filters.category);
    }
    if (filters.state && filters.state !== "All") {
      params.set("state", filters.state);
    }
    const qs = params.toString();
    return http.get<{ businesses: DirectoryCardJson[] }>(
      qs ? `/api/directory?${qs}` : "/api/directory",
    );
  },
  /** PUBLIC — detail of a single published listing (404 otherwise). */
  getPublic: (id: string) =>
    http.get<{ business: DirectoryPublicDetailJson }>(
      `/api/directory/${encodeURIComponent(id)}`,
    ),
  /** PRIVATE — the caller's own listing for a business (or null); refreshes the usage cache. */
  getMine: async (businessId: string) => {
    const res = await http.get<{ business: DirectoryMineJson | null }>(
      "/api/directory/mine",
      { businessId },
    );
    setMyDirectoryListingCache(businessId, res.business ? fromMineJson(res.business) : null);
    return res;
  },
  /** PRIVATE — save a draft; existing lifecycle status/isListed are preserved. */
  saveMine: async (businessId: string, draft: DirectoryDraft) => {
    const res = await http.put<{ business: DirectoryMineJson }>(
      "/api/directory/mine",
      draft,
      { businessId },
    );
    setMyDirectoryListingCache(businessId, fromMineJson(res.business));
    return res;
  },
  /** PRIVATE — submit the saved draft for moderation (PENDING_REVIEW). */
  submitMine: async (businessId: string) => {
    const res = await http.post<{ business: DirectoryMineJson }>(
      "/api/directory/mine/submit",
      undefined,
      { businessId },
    );
    setMyDirectoryListingCache(businessId, fromMineJson(res.business));
    return res;
  },
  /** PRIVATE — take the listing off the public directory (details kept). */
  unlistMine: async (businessId: string) => {
    const res = await http.post<{ business: DirectoryMineJson }>(
      "/api/directory/mine/unlist",
      undefined,
      { businessId },
    );
    setMyDirectoryListingCache(businessId, fromMineJson(res.business));
    return res;
  },
};