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

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
