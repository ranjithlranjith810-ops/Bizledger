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
 * Atomically creates a Business, its OWNER/ACTIVE BusinessMember, and an
 * optional default Branch for the authenticated user. Uses a single Prisma
 * transaction so partial creation is impossible.
 *
 * The creator is always stored as the OWNER with ACTIVE membership, and the
 * business is created ACTIVE. A main branch is created when a branch code is
 * provided (default "MAIN").
 */
export async function createBusiness(input: CreateBusinessInput) {
  const { user } = await requireUser();

  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.business.create({
      data: {
        name: input.name,
        legalName: input.legalName,
        email: input.email,
        phone: input.phone,
        gstin: input.gstin,
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

export type BusinessRole = "OWNER" | "ADMIN" | "MANAGER" | "STAFF";

/**
 * Resolves a business for a specific authenticated user BY MEMBERSHIP ONLY.
 *
 * The `businessId` is a *requested target*; the user is looked up from their
 * own session, then their membership in the requested business is verified.
 * Throws BusinessNotFoundError if the user is not a member (or the business
 * does not exist) — never leaks whether the business exists or belongs to
 * another tenant.
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

  return {
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

export class BusinessNotFoundError extends Error {
  constructor() {
    super("Business not found or access denied");
    this.name = "BusinessNotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
