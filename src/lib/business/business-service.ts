// Server-side business/multi-tenancy service layer.
//
// SECURITY MODEL (never trust the browser):
//   session.user.id
//        |
//        v
//   BusinessMember
//        |
//        v
//   Business
//
// A caller may *request* a business by id, but the server always resolves the
// authenticated user's own membership and returns/operates only on the business
// the user actually belongs to. A businessId supplied by the client is treated
// only as a requested target and is always checked against the authenticated
// user's membership before any data is returned.

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/business/tenant";
import { Prisma } from "@/generated/prisma/client";
import {
  validateGstin,
  normalizeGstinValue,
  validatePan,
  validateEmail,
  validatePhone,
  validateState,
  validateCity,
  validatePincode,
  validateInvoicePrefix,
} from "@/lib/validation";
import { checkImageDataUrl } from "@/lib/image-data-url";
import { INDIAN_STATES, bareStateName } from "@/lib/india";
import {
  canPerform,
  effectivePermissions,
  type AuthzAction,
  type AuthzModule,
  type AuthzRole,
} from "@/lib/authz/authz-core";

export interface CreateBusinessInput {
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  gstRegistered?: boolean;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  country?: string;
  branchCode?: string;
  branchName?: string;
}

/**
 * GSTIN format failure. Mapped to 400 Bad Request by handleApiError.
 */
export class GstinValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GstinValidationError";
  }
}

/**
 * A business with the same (normalized) GSTIN already exists — the duplicate
 * is NOT created. The message is user-friendly and discloses no private
 * business information. Mapped to 409 Conflict by handleApiError.
 */
export class DuplicateBusinessError extends Error {
  constructor(message = "A business with this GSTIN already exists.") {
    super(message);
    this.name = "DuplicateBusinessError";
  }
}

/**
 * Company-profile field validation failure (PAN, GSTIN, state, email …).
 * Mapped to 400 Bad Request by handleApiError.
 */
export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

/**
 * True when a Prisma unique-constraint violation targets the business GSTIN.
 * This is the race backstop: two simultaneous creates with the same GSTIN — the
 * second hits the DB unique index and must degrade to the safe duplicate
 * response instead of an internal error.
 */
function isGstinUniqueConstraint(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).includes("gstin"));
  return typeof target === "string" && target.includes("gstin");
}

/**
 * Atomically creates a Business, its OWNER/ACTIVE BusinessMember, and an
 * optional default Branch for the authenticated user. Uses a single Prisma
 * transaction so partial creation is impossible.
 *
 * GSTIN protection: a supplied GSTIN is normalized (trim, uppercase, strip
 * accidental spaces/hyphens), format-validated, and checked for an existing
 * business BEFORE any write. The authoritative guard is the database-level
 * unique index on the normalized GSTIN — the pre-check plus a P2002
 * (race) catch make this safe even when two requests arrive simultaneously.
 * Businesses without GST registration pass NULL (multiple NULLs are allowed).
 *
 * The creator is always stored as the OWNER with ACTIVE membership, and the
 * business is created ACTIVE. A main branch is created when a branch code is
 * provided (default "MAIN").
 */
export async function createBusiness(input: CreateBusinessInput) {
  const { user } = await requireUser();

  const normalizedGstin = normalizeGstinValue(input.gstin ?? "") || null;
  if (normalizedGstin) {
    const gstinError = validateGstin().validate(normalizedGstin);
    if (gstinError) throw new GstinValidationError(gstinError);
    // Application-level duplicate guard (best-effort). Only the id is read so
    // no private business data can leak. The DB unique index is the final gate.
    const existing = await prisma.business.findUnique({
      where: { gstin: normalizedGstin },
      select: { id: true },
    });
    if (existing) throw new DuplicateBusinessError();
  }

  const business = await prisma.$transaction(async (tx) => {
    try {
      const created = await tx.business.create({
        data: {
          name: input.name,
          legalName: input.legalName,
          email: input.email,
          phone: input.phone,
          gstin: normalizedGstin,
          gstRegistered: input.gstRegistered ?? false,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          state: input.state,
          stateCode: input.stateCode,
          pincode: input.pincode,
          country: input.country,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
          branches: input.branchCode
            ? {
                create: {
                  name: input.branchName ?? "Main Branch",
                  code: input.branchCode,
                  isDefault: true,
                  isActive: true,
                },
              }
            : undefined,
        },
        include: {
          memberships: true,
          branches: true,
        },
      });

      return created;
    } catch (error) {
      // DB-level race backstop (rule 8). Convert a competing same-GSTIN CREATE
      // into the exact same safe duplicate response as the pre-check.
      if (isGstinUniqueConstraint(error)) throw new DuplicateBusinessError();
      throw error;
    }
  });

  return { business };
}

/**
 * Returns the businesses the authenticated user is an ACTIVE member of,
 * including their membership role. The list is always derived from the
 * user's own memberships (never from a caller-supplied scope).
 */
export async function getMyBusinesses() {
  const { user } = await requireUser();

  const memberships = await prisma.businessMember.findMany({
    where: { userId: user.id },
    include: { business: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    status: m.business.status,
    role: m.role,
    memberStatus: m.status,
    gstin: m.business.gstin,
  }));
}

export type BusinessRole = AuthzRole;

/**
 * Resolves a business for a specific authenticated user BY MEMBERSHIP ONLY.
 *
 * The `businessId` is a *requested target*; the user is looked up from their
 * own session, then their membership in the requested business is verified.
 * Throws BusinessNotFoundError if the user is not a member (or the business
 * does not exist) — never leaks whether the business exists or belongs to
 * another tenant.
 *
 * STATUS GATE (Security Hardening 1 — F1): this is the ONE centralized
 * tenant-status rule. A membership that exists but is not ACTIVE (INVITED /
 * SUSPENDED) or a business that is not ACTIVE (SUSPENDED) is rejected with
 * 403. Every business-scoped service/route resolves scope through this helper,
 * so deactivated/invited members and suspended businesses lose ALL data
 * access — billing/team inline checks remain as defense-in-depth.
 */
export async function getBusinessForMember(businessId: string) {
  const { user } = await requireUser();

  const membership = await prisma.businessMember.findUnique({
    where: { userId_businessId: { userId: user.id, businessId } },
    include: {
      business: {
        include: { branches: true },
      },
    },
  });

  if (!membership) {
    throw new BusinessNotFoundError();
  }

  if (membership.status !== "ACTIVE") {
    throw new ForbiddenError("Membership is not active");
  }
  if (membership.business.status !== "ACTIVE") {
    throw new ForbiddenError("Business is not active");
  }

  return {
    user,
    membership,
    business: membership.business,
    branches: membership.business.branches,
  };
}

/**
 * Role check on top of membership. Resolves the user's membership for the
 * requested business (fail closed on non-member) and asserts the membership
 * role is one of `allowed`. Returns the resolved context on success.
 */
export async function requireBusinessRole(
  businessId: string,
  allowed: BusinessRole[],
) {
  const ctx = await getBusinessForMember(businessId);

  if (!allowed.includes(ctx.membership.role)) {
    throw new ForbiddenError(
      `Role '${ctx.membership.role}' is not authorized for this action`,
    );
  }

  return ctx;
}

/**
 * Server-side authorization gate (Security Hardening 1 — F2).
 *
 * Resolves the member's context (ACTIVE membership + ACTIVE business — F1)
 * and evaluates the member's EFFECTIVE permissions for `(module, action)`:
 *   role baseline (OWNER/ADMIN/MANAGER/STAFF) merged with any per-member
 *   `permissions` override stored on the BusinessMember row.
 *
 * Role and permissions are ALWAYS derived from trusted server state (the
 * membership row); anything the browser sends (role, userId, membershipId,
 * permission flags) is ignored.
 *
 * Throws ForbiddenError (403) when the member lacks the permission.
 */
export async function requireBusinessPermission(
  businessId: string,
  module: AuthzModule,
  action: AuthzAction,
) {
  const ctx = await getBusinessForMember(businessId);
  assertPermission(ctx, module, action);
  return ctx;
}

/**
 * Synchronous permission check against an ALREADY-resolved context (from
 * `getBusinessForMember` / `requireBusinessPermission`). Enables multi-gate
 * operations (e.g. "create expense requires `expenses.create`; WRITING a
 * status of Approved/Rejected additionally requires `expenses.approve`")
 * without re-resolving the membership for each gate.
 */
export function assertPermission(
  ctx: Awaited<ReturnType<typeof getBusinessForMember>>,
  module: AuthzModule,
  action: AuthzAction,
) {
  const effective = effectivePermissions(
    ctx.membership.role as AuthzRole,
    ctx.membership.permissions,
  );

  if (!canPerform(effective, module, action)) {
    throw new ForbiddenError(
      `Role '${ctx.membership.role}' is not authorized for '${module}.${action}'`,
    );
  }
}

export class BusinessNotFoundError extends Error {
  constructor() {
    super("Business not found or access denied");
    this.name = "BusinessNotFoundError";
  }
}

/**
 * Whitelist of CompanyProfile fields that may be persisted. Everything sent by
 * the client is filtered through this list — unknown keys are dropped so no
 * extraneous/forged JSON can be written into the profile blob.
 */
const PROFILE_KEYS = [
  "companyName",
  "businessType",
  "ownerName",
  "mobile",
  "email",
  "website",
  "streetAddress",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "country",
  "gstin",
  "pan",
  "gstRegistered",
  "udyamNo",
  "bankName",
  "accountNumber",
  "ifscCode",
  "upiId",
  "invoiceTerms",
  "paymentTerms",
  "gstSupportInfo",
  "invoicePrefix",
  "invoiceStartingNumber",
  "logoUrl",
  "digitalSignatureUrl",
] as const;

/**
 * The image half of PROFILE_KEYS. Both are stored as inline base64 data URLs
 * (FileReader.readAsDataURL / canvas.toDataURL) and are decoded by the PDF
 * renderers, so they must be bounded as image payloads - NOT by the generic
 * MAX_STRING short-text cap, and never as if they were ordinary URLs.
 */
const PROFILE_IMAGE_KEYS = ["logoUrl", "digitalSignatureUrl"] as const;

type CompanyProfileValue = string | number | boolean | null | undefined;

/** Derive the bare state name ("Tamil Nadu (33)" -> "Tamil Nadu") for the scalar. */
function stateNameFromProfile(state: string | undefined): string | undefined {
  if (!state) return undefined;
  return bareStateName(state) || undefined;
}

/** Derive the 2-digit GST state code from the profile's state field. */
function stateCodeFromProfile(state: string | undefined): string | undefined {
  if (!state) return undefined;
  const bare = bareStateName(state).toLowerCase();
  const match = INDIAN_STATES.find((s) => s.name.toLowerCase() === bare);
  return match ? match.code : undefined;
}

/**
 * Updates the authenticated member's own business from a company-profile
 * payload (PATCH /api/businesses/[id]). Server-authoritative persistence for
 * the company profile (Settings -> Company Profile):
 *
 *  - gated on `settings.edit` permission (403 otherwise);
 *  - the payload is whitelisted via PROFILE_KEYS (unknown keys dropped);
 *  - string fields are trimmed; PAN/GSTIN/invoicePrefix are normalized;
 *  - PAN/GSTIN/state/city/pincode/email/phone are format-validated (400);
 *  - a normalized GSTIN that belongs to a DIFFERENT business is rejected (409);
 *  - the derived scalar columns (name/gstin/gstRegistered/address/state/stateCode/
 *    city/pincode/country) are kept in sync so decade-old consumers of those
 *    scalars (billing, eway-bill config, directory listings) stay consistent;
 *  - the full profile is stored as `companyProfileJson`.
 *
 * No financial/subscription fields are touched.
 */
export async function updateBusinessForMember(
  businessId: string,
  rawProfile: Record<string, unknown>,
) {
  const ctx = await requireBusinessPermission(businessId, "settings", "edit");
  const business = ctx.business;

  // 1. Whitelist + trim string fields.
  const profile: Record<string, CompanyProfileValue> = {};
  for (const key of PROFILE_KEYS) {
    if (rawProfile[key] !== undefined && rawProfile[key] !== null) {
      const value = rawProfile[key];
      profile[key] = typeof value === "string" ? value.trim() : (value as CompanyProfileValue);
    }
  }

  // 2. Normalize code fields.
  const pan = typeof profile.pan === "string" ? profile.pan.trim().toUpperCase() : undefined;
  if (profile.pan !== undefined) profile.pan = pan ?? "";
  const gstin = typeof profile.gstin === "string" ? normalizeGstinValue(profile.gstin) : undefined;
  if (profile.gstin !== undefined) profile.gstin = gstin ?? "";
  const invoicePrefix =
    typeof profile.invoicePrefix === "string" ? profile.invoicePrefix.trim().toUpperCase() : undefined;
  if (profile.invoicePrefix !== undefined) profile.invoicePrefix = invoicePrefix ?? "";

  // 3. Validate the inline image data URLs (logo + digital signature).
  //
  // These are base64 image payloads, not short text, so they are deliberately
  // NOT measured against MAX_STRING. Each must be a png/jpeg base64 data URL -
  // anything else (a plain string, an http(s) URL, a malformed data URL) is
  // rejected here rather than being stored and then silently ignored by the PDF
  // renderers. A blank string still clears the field, as before.
  for (const key of PROFILE_IMAGE_KEYS) {
    if (profile[key] === undefined) continue;
    const { value, error } = checkImageDataUrl(profile[key]);
    if (error) throw new ProfileValidationError(`companyProfile.${key} ${error}`);
    if (value === undefined) delete profile[key];
    else profile[key] = value;
  }

  // 4. Validate (only non-empty values; clearing a field is allowed).
  if (pan) {
    const error = validatePan().validate(pan);
    if (error) throw new ProfileValidationError(error);
  }
  if (gstin) {
    const error = validateGstin().validate(gstin);
    if (error) throw new GstinValidationError(error);
    if (gstin !== business.gstin) {
      const existing = await prisma.business.findUnique({
        where: { gstin },
        select: { id: true },
      });
      // Same normalized GSTIN on a DIFFERENT row = duplicate (409).
      if (existing && existing.id !== business.id) throw new DuplicateBusinessError();
    }
  }
  const email = typeof profile.email === "string" ? profile.email.trim() : "";
  if (email) {
    const error = validateEmail().validate(email);
    if (error) throw new ProfileValidationError(error);
  }
  const phone = typeof profile.mobile === "string" ? profile.mobile.trim() : "";
  if (phone) {
    const error = validatePhone("Phone").validate(phone);
    if (error) throw new ProfileValidationError(error);
  }
  const stateName = typeof profile.state === "string" ? profile.state.trim() : "";
  if (stateName) {
    const error = validateState().validate(stateName);
    if (error) throw new ProfileValidationError(error);
  }
  const city = typeof profile.city === "string" ? profile.city.trim() : "";
  if (city) {
    const error = validateCity().validate(city);
    if (error) throw new ProfileValidationError(error);
  }
  const pincode = typeof profile.pincode === "string" ? profile.pincode.trim() : "";
  if (pincode) {
    const error = validatePincode().validate(pincode);
    if (error) throw new ProfileValidationError(error);
  }
  if (invoicePrefix && validateInvoicePrefix().validate(invoicePrefix)) {
    throw new ProfileValidationError(validateInvoicePrefix().validate(invoicePrefix) as string);
  }

  // 4. Derive scalar columns (keep in sync with the rich blob).
  const companyName = typeof profile.companyName === "string" ? profile.companyName.trim() : "";
  const gstRegistered =
    profile.gstRegistered === "registered" || profile.gstRegistered === "composite";

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      name: companyName || business.name,
      legalName: companyName || business.legalName,
      email: (profile.email as string | undefined) ?? business.email,
      phone: (profile.mobile as string | undefined) ?? business.phone,
      gstin: gstin || null,
      gstRegistered,
      addressLine1:
        (profile.streetAddress as string | undefined) ??
        (profile.addressLine1 as string | undefined) ??
        business.addressLine1,
      city: (profile.city as string | undefined) ?? business.city,
      state: stateNameFromProfile(stateName) ?? business.state,
      stateCode: stateCodeFromProfile(stateName) ?? business.stateCode,
      pincode: (profile.pincode as string | undefined) ?? business.pincode,
      country: (profile.country as string | undefined) ?? business.country,
      companyProfileJson: profile,
    },
  });

  return { business: updated, companyProfile: profile };
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
