// Server-side Business Directory service layer.
//
// The directory is the app's SINGLE public, cross-tenant surface. A
// BusinessDirectoryProfile is OPT-IN per business (isListed=false by default)
// and only holds intentionally public fields — the private Business record,
// members, financials and timestamps are never exposed.
//
// PUBLIC boundary: only status=PUBLISHED && isListed=true profiles are served
// by the public GET endpoints. Every other lifecycle state resolves to a 404
// for visitors (identical to a nonexistent id) so a caller can never probe
// whether a listing is "pending" or "rejected".
//
// Private /mine endpoints require the authenticated user's OWN membership in
// the requested business (getBusinessForMember) — cross-tenant business ids
// are a 404. Publication is NOT reachable from the public API in Phase 3F:
// submit transitions a listing to PENDING_REVIEW, and moderation (the admin
// app's approve/reject/suspend flow) is a Phase 3G concern.
//
// Status values are stored as the space-free DB enum; the DTOs map to the
// frontend labels ("Pending Review", "Not Listed", ...).

import { prisma } from "@/lib/prisma";
import {
  getBusinessForMember,
  requireBusinessRole,
} from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  DuplicateResourceError,
} from "@/lib/business/api-error";
import { INDIAN_STATES } from "@/lib/india";
import { getLimitFor } from "@/lib/plans";
import {
  EntitlementDeniedError,
  resolveEffectivePlan,
} from "@/lib/billing/entitlements-server";
import type { DirectoryStatus as StatusEnum } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export const DIRECTORY_BUSINESS_TYPES = [
  "Manufacturer",
  "Dealer",
  "Wholesaler",
  "Distributor",
  "Retailer",
  "Supplier",
] as const;

export const DIRECTORY_CATEGORIES = [
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
] as const;

const STATUS_LABELS: Record<StatusEnum, string> = {
  NOT_LISTED: "Not Listed",
  PENDING_REVIEW: "Pending Review",
  PUBLISHED: "Published",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
};

// F4: the roles allowed to WRITE a directory listing (save / submit / unlist).
// Publishing and un-publishing a public business profile is a
// direction/management action, so STAFF is deliberately excluded even though the
// STAFF permission baseline is "view + create". STAFF retains read access via
// `getMyDirectoryProfile`, which is intentionally ungated.
//
// `as const` alone is compile-time only, so the tuple is also frozen: an
// authorization allowlist must not be widenable at runtime. `requireBusinessRole`
// takes a mutable array, hence the spread at each call site.
//
// Pinned by `src/__tests__/directory-production-safety.test.ts`.
export const DIRECTORY_WRITE_ROLES = Object.freeze(
  ["OWNER", "ADMIN", "MANAGER"] as const
);

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function invalid(list: readonly string[], value: string, label: string) {
  if (!(list as readonly string[]).includes(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
}

function stateCodeFromName(stateName: string): string | undefined {
  return INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === stateName.toLowerCase(),
  )?.code;
}

function validateState(v: string): string {
  const exact = INDIAN_STATES.find((s) => s.name === v);
  if (exact) return exact.name;
  const withCode = INDIAN_STATES.find((s) => `${s.name} (${s.code})` === v);
  if (withCode) return withCode.name;
  throw new ValidationError('State must be selected from the official Indian states list (e.g. "Tamil Nadu")');
}

function validateName(value: string, label: string, max: number): string {
  if (!value) throw new ValidationError(`${label} is required`);
  if (value.length > max) throw new ValidationError(`${label} is too long`);
  if (value.toLowerCase().includes("<script") || /<\w+[^>]*>/.test(value)) {
    throw new ValidationError(`${label} contains content that is not permitted`);
  }
  return value;
}

function validatePhone(value: string, label: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!/^(?:\+91|91)?[6-9][0-9]{9}$/.test(compact)) {
    throw new ValidationError(`${label} must be a valid 10-digit Indian mobile number`);
  }
  return value;
}

function normalizeQuery(v: unknown): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

/** Validate and normalize a full listing profile payload (draft -> save). */
function normalizeDirectoryInput(raw: Record<string, unknown>) {
  const companyName = validateName(str(raw.companyName) ?? "", "Business name", 120);

  const businessType = str(raw.businessType);
  if (!businessType) throw new ValidationError("Business type is required");
  invalid(DIRECTORY_BUSINESS_TYPES, businessType, "business type");

  const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : [];
  const categories = [...new Set(
    categoriesRaw.map((c) => str(c)).filter((c): c is string => !!c),
  )];
  if (categories.length === 0) throw new ValidationError("Select at least one category");
  for (const c of categories) invalid(DIRECTORY_CATEGORIES, c, "category");

  const streetAddress = validateName(str(raw.streetAddress) ?? "", "Street address", 300);
  const city = str(raw.city) ?? "";
  if (!city) throw new ValidationError("City is required");
  if (!/^[A-Za-z][A-Za-z .'-]{1,60}$/.test(city)) {
    throw new ValidationError("City may contain only letters, spaces, dots, apostrophes and hyphens");
  }

  const stateInput = str(raw.state);
  if (!stateInput) throw new ValidationError("State is required");
  const state = validateState(stateInput);
  const stateCode = stateCodeFromName(state) ?? undefined;

  const pincode = str(raw.pincode) ?? "";
  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    throw new ValidationError("PIN code must be a 6-digit number");
  }

  const ownerName = validateName(str(raw.ownerName) ?? "", "Owner name", 100);

  const primaryPhone = str(raw.primaryPhone);
  if (!primaryPhone) throw new ValidationError("Phone is required");
  validatePhone(primaryPhone, "Phone");

  const optional = (v: unknown, max: number): string | undefined => {
    const s = str(v);
    if (s === undefined) return undefined;
    if (s.length > max) throw new ValidationError(`Value is too long`);
    return s;
  };

  const description = optional(raw.description, 1000);
  const landmark = optional(raw.landmark, 200);

  const alternatePhone = optional(raw.alternatePhone, 20);
  if (alternatePhone !== undefined) validatePhone(alternatePhone, "Alternate phone");

  const email = optional(raw.email, 254);
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Enter a valid email address");
  }

  const website = optional(raw.website, 300);
  if (website !== undefined) {
    if (!/^https?:\/\//.test(website) && !website.includes(".")) {
      throw new ValidationError("Enter a valid website URL");
    }
  }

  const gstinRaw = optional(raw.gstin, 15)?.toUpperCase();
  if (gstinRaw !== undefined) {
    if (!/^[0-9A-Z]{15}$/.test(gstinRaw) || !/^\d{2}[0-9A-Z]{13}$/.test(gstinRaw)) {
      throw new ValidationError("GSTIN must contain exactly 15 characters (alphanumeric)");
    }
    const stateCodePrefix = gstinRaw.slice(0, 2);
    const known = INDIAN_STATES.map((s) => s.code);
    if (!known.includes(stateCodePrefix) && stateCodePrefix !== "97" && stateCodePrefix !== "99") {
      throw new ValidationError("GSTIN must begin with a valid 2-digit state code");
    }
  }

  return {
    companyName,
    businessType,
    categories,
    description,
    streetAddress,
    city,
    state,
    stateCode,
    pincode,
    landmark,
    ownerName,
    primaryPhone,
    alternatePhone,
    email,
    website,
    gstin: gstinRaw,
  };
}

function gstStatus(profile: { gstin: string | null; gstVerified: boolean }) {
  if (!profile.gstin) return "Not Provided";
  return profile.gstVerified ? "GST Verified" : "GSTIN Provided";
}

function toPublicCard(p: {
  id: string;
  companyName: string;
  businessType: string;
  categories: string[];
  city: string | null;
  state: string | null;
  primaryPhone: string | null;
  website: string | null;
}) {
  return {
    id: p.id,
    companyName: p.companyName,
    businessType: p.businessType,
    categories: p.categories,
    city: p.city,
    state: p.state,
    primaryPhone: p.primaryPhone,
    website: p.website,
    hasPhone: !!p.primaryPhone?.trim(),
  };
}

type ProfileRow = {
  id: string;
  businessId: string;
  status: StatusEnum;
  isListed: boolean;
  companyName: string;
  businessType: string;
  categories: string[];
  description: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  landmark: string | null;
  ownerName: string;
  primaryPhone: string | null;
  alternatePhone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  gstVerified: boolean;
};

function toPublicDetail(p: ProfileRow) {
  return {
    id: p.id,
    companyName: p.companyName,
    businessType: p.businessType,
    categories: p.categories,
    description: p.description,
    streetAddress: p.streetAddress,
    landmark: p.landmark,
    city: p.city,
    state: p.state,
    stateCode: p.stateCode,
    pincode: p.pincode,
    ownerName: p.ownerName,
    primaryPhone: p.primaryPhone,
    alternatePhone: p.alternatePhone,
    email: p.email,
    website: p.website,
    gstin: p.gstin,
    gstStatus: gstStatus(p),
  };
}

export function toMineJson(p: ProfileRow & { createdAt: Date }) {
  return {
    ...toPublicDetail(p),
    businessId: p.businessId,
    status: STATUS_LABELS[p.status],
    isListed: p.isListed,
    createdAt: p.createdAt.toISOString(),
  };
}

function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

/**
 * GET /api/directory — PUBLIC, unauthenticated. Lists only PUBLISHED &
 * isListed listings. Search is case-insensitive, partial-match and
 * whitespace-tolerant (plain Prisma string filtering — no external engine).
 */
export async function listDirectory(opts: {
  q?: string;
  businessType?: string;
  category?: string;
  state?: string;
}) {
  const where: Prisma.BusinessDirectoryProfileWhereInput = {
    status: "PUBLISHED",
    isListed: true,
    // F1: a listing belongs to the tenant `Business` record. Public visibility
    // additionally requires the business itself to be ACTIVE — a suspended
    // business (even with a lingering PUBLISHED listing) must never appear in
    // the public directory. This relation filter is the server-side gate; the
    // suspend transaction also flips the listing (defense in depth).
    business: { status: "ACTIVE" },
  };

  const businessType = str(opts?.businessType);
  if (businessType && businessType !== "All") {
    invalid(DIRECTORY_BUSINESS_TYPES, businessType, "business type");
    where.businessType = businessType;
  }

  const category = str(opts?.category);
  if (category && category !== "All") {
    invalid(DIRECTORY_CATEGORIES, category, "category");
    where.categories = { has: category };
  }

  const state = str(opts?.state);
  if (state && state !== "All") {
    validateState(state);
    where.state = state;
  }

  const q = normalizeQuery(opts?.q);
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { state: { contains: q, mode: "insensitive" } },
      { ownerName: { contains: q, mode: "insensitive" } },
      { businessType: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.businessDirectoryProfile.findMany({
    where,
    orderBy: [{ companyName: "asc" }, { id: "asc" }],
  });

  return rows.map(toPublicCard);
}

/**
 * GET /api/directory/[profileId] — PUBLIC detail. Only a PUBLISHED listing is
 * served; every other state (and any unknown id) is a 404. The public profile
 * id is used (NOT the businessId) so the business record stays private.
 */
export async function getDirectoryProfile(profileIdInput: unknown) {
  const id = str(profileIdInput);
  if (!id) throw new ValidationError("Missing listing id");

  const profile = await prisma.businessDirectoryProfile.findUnique({
    where: { id },
    // F1: only an ACTIVE business's listing may be served publicly.
    include: { business: { select: { status: true } } },
  });
  if (
    !profile ||
    profile.status !== "PUBLISHED" ||
    !profile.isListed ||
    profile.business.status !== "ACTIVE"
  ) {
    throw new ResourceNotFoundError("Listing not found");
  }
  return toPublicDetail(profile);
}

function resolveBusiness(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  return getBusinessForMember(businessId).then(() => businessId);
}

/**
 * GET /api/directory/mine?businessId=... — private: the caller's own business
 * profile (any lifecycle state), or null when no listing exists yet.
 */
export async function getMyDirectoryProfile(businessIdInput: unknown) {
  const businessId = await resolveBusiness(businessIdInput);
  const profile = await prisma.businessDirectoryProfile.findUnique({
    where: { businessId },
  });
  return profile ? toMineJson(profile) : null;
}

/**
 * PUT /api/directory/mine?businessId=... — save/update the listing. Upserts
 * the profile (one-per-business). Existing lifecycle status/isListed are
 * PRESERVED on updates — saving a draft never un-lists a published business.
 */
export async function saveMyDirectoryProfile(businessIdInput: unknown, raw: Record<string, unknown>) {
    // F4: directory issuance is a direction/management action reserved for
    // OWNER/ADMIN/MANAGER. STAFF may view the draft (GET) but cannot edit,
    // submit or unlist it — that keeps listing control out of read-only roles.
    const businessId = await requireBusinessRole(
      validateBusinessId(businessIdInput),
      [...DIRECTORY_WRITE_ROLES]
    ).then((ctx) => ctx.business.id);
    const data = normalizeDirectoryInput(raw);

  const input = {
    businessId,
    ...data,
  } as Omit<Prisma.BusinessDirectoryProfileUncheckedCreateInput, "id">;

  try {
    const profile = await prisma.businessDirectoryProfile.upsert({
      where: { businessId },
      create: { ...input, status: "NOT_LISTED", isListed: false },
      update: {
        companyName: data.companyName,
        businessType: data.businessType,
        categories: data.categories,
        description: data.description,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        stateCode: data.stateCode,
        pincode: data.pincode,
        landmark: data.landmark,
        ownerName: data.ownerName,
        primaryPhone: data.primaryPhone,
        alternatePhone: data.alternatePhone,
        email: data.email,
        website: data.website,
        gstin: data.gstin,
      },
    });
    return toMineJson(profile);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new DuplicateResourceError("A directory profile already exists for this business");
    }
    throw error;
  }
}

/**
 * POST /api/directory/mine/submit?businessId=... — submit the listing for
 * moderation (PENDING_REVIEW) and take it off the public directory.
 *
 * F3: a listing that goes live consumes a plan allowance. Submitting is denied
 * when the effective plan allows ZERO directory listings and the profile is not
 * already live (Free plan → 403 ENTITLEMENT_LIMIT). Resubmitting an existing
 * live/ever-listed profile is allowed on any plan that grants >=1 listing
 * (Business/Enterprise) — the single-profile uniqueness constraint is the hard
 * upper bound, so a business can never hold more listings than it is granted.
 */
export async function submitMyDirectoryProfile(businessIdInput: unknown) {
    // F4: submit (take live / request moderation) is a direction-management
    // action reserved for OWNER/ADMIN/MANAGER (STAFF -> 403).
    const businessId = await requireBusinessRole(
      validateBusinessId(businessIdInput),
      [...DIRECTORY_WRITE_ROLES]
    ).then((ctx) => ctx.business.id);

    return prisma.$transaction(async (tx) => {
    const existing = await tx.businessDirectoryProfile.findUnique({
      where: { businessId },
    });
    if (!existing) throw new ResourceNotFoundError("No listing to submit");

    const { plan } = await resolveEffectivePlan(tx, businessId);
    const limit = getLimitFor(plan, "directoryListing");
    const cap = typeof limit === "number" ? limit : null;
    if (
      cap === 0 &&
      existing.status !== "PENDING_REVIEW" &&
      existing.status !== "PUBLISHED"
    ) {
      throw new EntitlementDeniedError("directoryListing", 0, 0);
    }

    const profile = await tx.businessDirectoryProfile.update({
      where: { businessId },
      data: { status: "PENDING_REVIEW", isListed: false },
    });
    return toMineJson(profile);
  });
}

/**
 * POST /api/directory/mine/unlist?businessId=... — remove the business from
 * the public directory (NOT_LISTED, isListed=false). Draft details are kept.
 */
export async function unlistMyDirectoryProfile(businessIdInput: unknown) {
    // F4: unlist (take off the public directory) is a direction-management
    // action reserved for OWNER/ADMIN/MANAGER (STAFF -> 403).
    const businessId = await requireBusinessRole(
      validateBusinessId(businessIdInput),
      [...DIRECTORY_WRITE_ROLES]
    ).then((ctx) => ctx.business.id);
    const existing = await prisma.businessDirectoryProfile.findUnique({
    where: { businessId },
  });
  if (!existing) throw new ResourceNotFoundError("No listing to unlist");

  const profile = await prisma.businessDirectoryProfile.update({
    where: { businessId },
    data: { status: "NOT_LISTED", isListed: false },
  });
  return toMineJson(profile);
}