// Server-side Team service layer (multi-tenant).
//
// The Team module REUSES BusinessMember (roles OWNER/ADMIN/MANAGER/STAFF) —
// there is deliberately NO duplicate TeamMember table. A membership is
// business-scoped and tenant-isolated exactly like every other Phase 2-3E
// module: every operation resolves the authenticated user's own membership in
// the requested `businessId` before touching data.
//
// Role display mapping to the frontend TeamRole labels
// (src/types: 'Owner' | 'Manager' | 'Accountant' | 'Staff'): the UI calls the
// DB ADMIN tier "Accountant". Wire format accepts/returns the CANONICAL DB role
// values; the DTO maps to the display labels for the (not-yet-wired) frontend.
//
// Owner protection: the LAST active owner of a business can never be removed —
// "remove/suspend/change sole owner" is rejected. Ownership TRANSFER is out of
// scope for Phase 3F (documented for 3G).
//
// Email invite delivery is DEFERRED (no email provider). Inviting a brand-new
// email creates a placeholder User (emailVerified=false) + an INVITED
// membership; the acceptance/join flow is a Phase 3G concern.
//
// Privacy: the list DTO exposes only id/name/email/image of the underlying
// User — NEVER password hashes, Account/Verification rows, or sessions.

import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import {
  getBusinessForMember,
  requireBusinessRole,
  ForbiddenError,
} from "@/lib/business/business-service";
import type { BusinessMemberRole as RoleEnum } from "@/generated/prisma/client";
import {
  ValidationError,
  ResourceNotFoundError,
  DuplicateResourceError,
} from "@/lib/business/api-error";
import type { Prisma } from "@/generated/prisma/client";

const MEMBER_ROLES = ["OWNER", "ADMIN", "MANAGER", "STAFF"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Owner",
  ADMIN: "Accountant",
  MANAGER: "Manager",
  STAFF: "Staff",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INVITED: "Pending Invitation",
  SUSPENDED: "Suspended",
};

// Fixed-shape module permission allowlist (server-side mirror of the frontend
// ModulePermissions type). Unknown modules/actions are rejected — the stored
// `permissions` JSONB is never an arbitrary blob.
const PERMISSION_KEYMAP: Record<string, string[]> = {
  invoices: ["view", "create", "edit", "delete"],
  expenses: ["view", "create", "approve", "delete"],
  vehicles: ["view", "manage", "logExpenses"],
  customers: ["view", "manage"],
  reports: ["view", "export"],
  settings: ["view", "edit"],
};

function roleDefaultPermissions(role: MemberRole): Record<string, Record<string, boolean>> {
  if (role === "OWNER") {
    return {
      invoices: { view: true, create: true, edit: true, delete: true },
      expenses: { view: true, create: true, approve: true, delete: true },
      vehicles: { view: true, manage: true, logExpenses: true },
      customers: { view: true, manage: true },
      reports: { view: true, export: true },
      settings: { view: true, edit: true },
    };
  }
  if (role === "MANAGER") {
    return {
      invoices: { view: true, create: true, edit: true, delete: false },
      expenses: { view: true, create: true, approve: true, delete: false },
      vehicles: { view: true, manage: true, logExpenses: true },
      customers: { view: true, manage: true },
      reports: { view: true, export: true },
      settings: { view: true, edit: false },
    };
  }
  if (role === "ADMIN") {
    // Frontend "Accountant" preset — same as Manager except fleet manage is off.
    return {
      invoices: { view: true, create: true, edit: true, delete: false },
      expenses: { view: true, create: true, approve: true, delete: false },
      vehicles: { view: true, manage: false, logExpenses: true },
      customers: { view: true, manage: true },
      reports: { view: true, export: true },
      settings: { view: true, edit: false },
    };
  }
  return {
    invoices: { view: true, create: true, edit: false, delete: false },
    expenses: { view: true, create: true, approve: false, delete: false },
    vehicles: { view: true, manage: false, logExpenses: true },
    customers: { view: true, manage: false },
    reports: { view: false, export: false },
    settings: { view: false, edit: false },
  };
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function assertPlainObject(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ValidationError("permissions must be an object");
  }
  return v as Record<string, unknown>;
}

/** Validate an optional permissions override against the fixed key allowlist. */
function normalizePermissions(role: MemberRole, raw: unknown): Record<string, Record<string, boolean>> {
  const out = roleDefaultPermissions(role);
  if (raw === undefined || raw === null) return out;

  const input = assertPlainObject(raw);
  for (const [module, allowedActions] of Object.entries(PERMISSION_KEYMAP)) {
    const value = input[module];
    if (value === undefined) continue;
    const moduleValue = assertPlainObject(value);
    const allowed = new Set(allowedActions);
    for (const key of Object.keys(moduleValue)) {
      if (!allowed.has(key)) {
        throw new ValidationError(`Unknown permission '${module}.${key}'`);
      }
      if (typeof moduleValue[key] !== "boolean") {
        throw new ValidationError(`Permission '${module}.${key}' must be a boolean`);
      }
      out[module][key] = Boolean(moduleValue[key]);
    }
  }
  for (const key of Object.keys(input)) {
    if (!(key in PERMISSION_KEYMAP)) {
      throw new ValidationError(`Unknown permission module '${key}'`);
    }
  }
  return out;
}

function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

function validateId(id: unknown): string {
  const v = str(id);
  if (!v) throw new ValidationError("Missing resource id");
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

function normalizeInviteInput(raw: Record<string, unknown>) {
  const name = str(raw.name);
  if (!name) throw new ValidationError("Member name is required");
  if (name.length > 100) throw new ValidationError("Member name is too long");
  if (name.toLowerCase().includes("<script") || /<\w+[^>]*>/.test(name)) {
    throw new ValidationError("Member name contains content that is not permitted");
  }

  const email = str(raw.email)?.toLowerCase();
  if (!email) throw new ValidationError("Email is required");
  if (email.length > 254) throw new ValidationError("Email is too long");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Enter a valid email address");
  }

  const role = str(raw.role) as MemberRole | undefined;
  if (!role) throw new ValidationError("Role is required");
  if (!(MEMBER_ROLES as readonly string[]).includes(role)) {
    throw new ValidationError("Invalid role");
  }

  const designation = str(raw.designation);
  if (designation !== undefined && designation.length > 100) {
    throw new ValidationError("Designation is too long");
  }

  const phone = str(raw.phone);
  if (phone !== undefined) {
    const compact = phone.replace(/\s+/g, "");
    if (!/^(?:\+91|91)?[6-9][0-9]{9}$/.test(compact)) {
      throw new ValidationError("Phone must be a valid 10-digit Indian mobile number");
    }
  }

  const permissions = normalizePermissions(role, raw.permissions);

  return {
    name,
    email,
    role,
    designation,
    phone,
    permissions: permissions as unknown as Prisma.InputJsonValue,
  };
}

function toTeamMemberJson(m: {
  id: string;
  userId: string;
  role: RoleEnum;
  status: string;
  designation: string | null;
  phone: string | null;
  permissions: Prisma.JsonValue | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string; email: string; image: string | null };
}) {
  let permissions: Record<string, Record<string, boolean>> | null = null;
  if (m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions)) {
    try {
      permissions = normalizePermissions(m.role, m.permissions);
    } catch {
      permissions = null;
    }
  }
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    avatar: m.user.image,
    phone: m.phone,
    designation: m.designation,
    role: ROLE_LABELS[m.role],
    status: STATUS_LABELS[m.status] ?? m.status,
    permissions: permissions ?? roleDefaultPermissions(m.role),
    lastActive: m.lastActiveAt ? m.lastActiveAt.toISOString() : null,
    joinedDate: m.createdAt.toISOString().slice(0, 10),
  };
}

function assertActiveMember(ctx: { membership: { status: string } }) {
  if (ctx.membership.status !== "ACTIVE") {
    throw new ForbiddenError("Membership is not active");
  }
}

/**
 * GET /api/team — list every membership of the caller's business. Visible to
 * any ACTIVE member of that business (read-only); mutations are role-gated.
 * The DTO never exposes sensitive User columns.
 */
export async function listTeam(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await getBusinessForMember(businessId);
  assertActiveMember(ctx);

  const rows = await prisma.businessMember.findMany({
    where: { businessId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map(toTeamMemberJson);
}

/**
 * POST /api/team/invite — create an INVITED membership for the target email.
 * Requires OWNER or ADMIN of the business. Idempotency: an existing membership
 * of this user in this business is a 409 (no duplicate seats).
 */
export async function inviteTeamMember(businessIdInput: unknown, raw: Record<string, unknown>) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await requireBusinessRole(businessId, ["OWNER", "ADMIN"]);
  assertActiveMember(ctx);

  const data = normalizeInviteInput(raw);

  const created = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: data.email } });
    if (!user) {
      // Placeholder User for a not-yet-registered invitee. Acceptance/join is a
      // Phase 3G concern; email delivery deferred (no provider).
      user = await tx.user.create({
        data: {
          id: randomUUID(),
          name: data.name,
          email: data.email,
          emailVerified: false,
        },
      });
    }

    const existing = await tx.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
    });
    if (existing) {
      throw new DuplicateResourceError("This user is already a team member of this business");
    }

    return tx.businessMember.create({
      data: {
        userId: user.id,
        businessId,
        role: data.role,
        status: "INVITED",
        designation: data.designation,
        phone: data.phone,
        permissions: data.permissions,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  });

  return toTeamMemberJson(created);
}

/**
 * DELETE /api/team/[memberId] — revoke a membership. Requires OWNER or ADMIN.
 * An OWNER member may only be removed by an OWNER, and the LAST owner of a
 * business can never be removed (sole-owner protection).
 */
export async function revokeTeamMember(businessIdInput: unknown, memberIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const actor = await requireBusinessRole(businessId, ["OWNER", "ADMIN"]);
  assertActiveMember(actor);
  const memberId = validateId(memberIdInput);

  const target = await prisma.businessMember.findFirst({
    where: { id: memberId, businessId },
  });
  if (!target) throw new ResourceNotFoundError("Team member not found");

  if (target.role === "OWNER" && actor.membership.role !== "OWNER") {
    throw new ForbiddenError("Only an owner can remove another owner");
  }

  // Sole-owner protection applies only when the TARGET is an active owner
  // (a pending/suspended owner can always be withdrawn — they are not acting
  // owners of the business).
  if (target.role === "OWNER" && target.status === "ACTIVE") {
    const activeOwnerCount = await prisma.businessMember.count({
      where: { businessId, role: "OWNER", status: "ACTIVE" },
    });
    if (activeOwnerCount <= 1) {
      throw new ValidationError("Cannot remove the sole owner of the business");
    }
  }

  await prisma.businessMember.delete({ where: { id: memberId } });
  return { id: memberId };
}