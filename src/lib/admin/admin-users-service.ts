// Phase 9B — Platform-Administrator USER management service (admin backend
// surface).
//
// BOUNDARY: 
//   - Reads (list/detail/activity): SUPPORT_ADMIN and SUPER_ADMIN. Only the
//     safe operational surface is returned — never passwords, tokens, sessions
//     or Account rows, and never full BusinessMember permission JSON.
//   - Mutations (suspend/reactivate): SUPER_ADMIN only. A user's Better Auth
//     `status` is flipped ACTIVE <-> SUSPENDED and the change is recorded in
//     the immutable PlatformAdminLog audit trail (same transaction).
//
// SUSPENSION ENFORCEMENT: the platform does NOT delete or invalidate Better
// Auth sessions. Instead `requireUser()` (the single server-side gate shared by
// every protected customer API) rejects a user whose status is SUSPENDED with a
// 403 while their session is still valid, re-reading the User row from the
// database on every call so suspension is never stale.
//
// SUSPENDING A PLATFORM ADMIN REVOKES THEIR AUTHORITY. `requirePlatformAdminRole`
// deliberately reads with `ignoreSuspension` so it can return an
// administrator-specific denial, but it then refuses any SUSPENDED
// administrator itself ("Administrator account is suspended"). Because that gate
// is the single authorization boundary every admin service funnels through,
// suspending a SUPER_ADMIN immediately removes their ability to list, read or
// mutate anything — including plans, users and other administrators — without
// waiting for their session to expire.
//
// AUTHORIZATION (server-side, resolved from the session at every call):
//   - anonymous                        -> 401 (requireUser inside the gate)
//   - signed-in non-admin              -> 403 (ForbiddenError)
//   - SUPPORT_ADMIN / SUPER_ADMIN      -> 200 reads
//   - SUPER_ADMIN only                 -> suspend/reactivate mutations
// Every call resolves the role from the Better Auth session + platform_admin
// table — a browser-supplied role is never trusted.
//
// ACTIVITY-ONLY METADATA: derived strictly from existing immutable/safe rows
// (PlatformAdminLog entries targeting the user, membership join times, the
// user's OWNER business creations, and Better Auth session sign-in timestamps).
// No fabricated events, and credits only `updatedAt`/`createdAt` timestamps for
// sessions — never tokens or other session data.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { UserStatus } from "@/generated/prisma/client";
import {
  ResourceNotFoundError,
  ValidationError,
  ConflictError,
} from "@/lib/business/api-error";
import { requirePlatformAdminRole } from "@/lib/directory/directory-admin-service";
import {
  writePlatformAdminLog,
  MAX_REASON_LENGTH,
} from "@/lib/admin/admin-audit-service";
import { evaluateSuspendGuard } from "@/lib/admin/admin-suspension-guard";
import { recordPlatformAdminDenial } from "@/lib/admin/admin-denial-audit";

/**
 * Transaction-scoped PostgreSQL advisory lock that serializes every super-admin
 * lockout check. Without it two SUPER_ADMINs can each suspend the other at the
 * same moment: both pass the authorization gate while still active, and under
 * READ COMMITTED neither sees the other's uncommitted suspension. `xact` scope
 * means Postgres releases it automatically on commit or rollback, including on
 * error paths, so a failed attempt cannot leak the lock. A plain int is used (not
 * a bigint literal) because this package targets ES2017.
 */
const SUPER_ADMIN_GUARD_LOCK_KEY = 918273645000001;

const LIST_LIMIT = 50;
const ACTIVITY_DEFAULT_LIMIT = 20;
const ACTIVITY_MAX_LIMIT = 50;

const ISO = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** Safe, operational user row for the Admin list. No accounts/sessions, no
 * secrets — identity fields, status, safe aggregate counts and last activity. */
export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  /** Distinct businesses the user OWNS (OWNER role). */
  businessCount: number;
  /** Total memberships across businesses. */
  membershipCount: number;
  /** Latest safe activity timestamp (membership lastActive or session last use). */
  lastActivityAt: string | null;
}

/**
 * GET /api/admin/users?q=... — every user, newest first (createdAt DESC, id
 * ASC for deterministic order). SUPPORT_ADMIN and SUPER_ADMIN may read;
 * anonymous -> 401; signed-in non-admin -> 403. Server-side search across
 * name, email and user id. Read-only. Bounded to LIST_LIMIT rows.
 */
export async function listAdminUsers(searchInput?: unknown): Promise<AdminUserDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  const q = typeof searchInput === "string" ? searchInput.trim().slice(0, 200) : "";

  const where =
    q.length === 0
      ? {}
      : {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { id: { startsWith: q } },
          ],
        };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: LIST_LIMIT,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { memberships: true } },
    },
  });

  const ids = users.map((u) => u.id);

  const [ownedCounts, membershipActivity, sessionActivity] = await Promise.all([
    prisma.businessMember.groupBy({
      by: ["userId"],
      _count: true,
      where: { userId: { in: ids }, role: "OWNER" },
    }),
    prisma.businessMember.groupBy({
      by: ["userId"],
      _max: { lastActiveAt: true },
      where: { userId: { in: ids } },
    }),
    prisma.session.groupBy({
      by: ["userId"],
      _max: { updatedAt: true },
      where: { userId: { in: ids } },
    }),
  ]);

  const ownedByUser = new Map<string, number>();
  for (const row of ownedCounts) ownedByUser.set(row.userId, row._count);

  const lastByUser = new Map<string, number>();
  for (const row of membershipActivity) {
    if (row._max.lastActiveAt) lastByUser.set(row.userId, row._max.lastActiveAt.getTime());
  }
  for (const row of sessionActivity) {
    if (!row._max.updatedAt) continue;
    const t = row._max.updatedAt.getTime();
    const cur = lastByUser.get(row.userId);
    if (cur === undefined || t > cur) lastByUser.set(row.userId, t);
  }

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    businessCount: ownedByUser.get(u.id) ?? 0,
    membershipCount: u._count.memberships,
    lastActivityAt: lastByUser.has(u.id) ? new Date(lastByUser.get(u.id)!).toISOString() : null,
  }));
}

/** Safe membership metadata — business name + role + status, never other
 * members' rows, never the permission JSON. */
export interface AdminUserMembershipDto {
  id: string;
  businessId: string;
  businessName: string;
  businessStatus: string;
  role: string;
  status: string;
  lastActiveAt: string | null;
  createdAt: string;
}

/** One derived activity row for a user. */
export interface AdminUserActivityDto {
  id: string;
  type: "audit" | "auth" | "membership" | "business";
  label: string;
  description: string;
  occurredAt: string;
}

/** User detail — identity/profile fields, safe counts, memberships, activity. */
export interface AdminUserDetailDto {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  platformAdminRole: string | null;
  platformAdminSince: string | null;
  businessCount: number;
  membershipCount: number;
  lastActivityAt: string | null;
  memberships: AdminUserMembershipDto[];
  recentActivity: AdminUserActivityDto[];
}

function toActivityId(prefix: string, rowId: string): string {
  return `${prefix}:${rowId}`;
}

/**
 * GET /api/admin/users/[id]/activity?limit=... — recent safe activity for one
 * user, derived from immutable/safe rows only (never fabricated). Sources:
 *   1. PlatformAdminLog rows that targeted this user (audit actions).
 *   2. Better Auth session sign-ins (createdAt — timestamps only, no tokens).
 *   3. Membership join events ("added to business X as role").
 *   4. Business creations where the user is the OWNER member.
 * Newest first, bounded by limit (clamped 1..ACTIVITY_MAX_LIMIT). Unknown user
 * id -> 404.
 */
export async function getAdminUserActivity(
  userIdInput: string,
  limitInput?: unknown,
): Promise<AdminUserActivityDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  if (!userIdInput) throw new ResourceNotFoundError("User not found");

  const user = await prisma.user.findUnique({
    where: { id: userIdInput },
    select: { id: true },
  });
  if (!user) throw new ResourceNotFoundError("User not found");

  const rawLimit = Number(limitInput);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), ACTIVITY_MAX_LIMIT)
      : ACTIVITY_DEFAULT_LIMIT;

  const [auditRows, sessions, memberships] = await Promise.all([
    prisma.platformAdminLog.findMany({
      where: { targetType: "user", targetId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, action: true, reason: true, createdAt: true },
    }),
    prisma.session.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, createdAt: true },
    }),
    prisma.businessMember.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        role: true,
        createdAt: true,
        business: { select: { id: true, name: true, status: true, createdAt: true } },
      },
    }),
  ]);

  const entries: AdminUserActivityDto[] = [];
  for (const row of auditRows) {
    entries.push({
      id: toActivityId("audit", row.id),
      type: "audit",
      label: `Audit: ${row.action}`,
      description: row.reason ? `Reason: ${row.reason}` : "Administrator action recorded",
      occurredAt: row.createdAt.toISOString(),
    });
  }
  for (const s of sessions) {
    entries.push({
      id: toActivityId("auth", s.id),
      type: "auth",
      label: "Signed in",
      description: "Authenticated with the platform via Better Auth",
      occurredAt: s.createdAt.toISOString(),
    });
  }
  for (const m of memberships) {
    entries.push({
      id: toActivityId("membership", m.id),
      type: "membership",
      label: `Added to "${m.business.name}"`,
      description: `Role: ${m.role}`,
      occurredAt: m.createdAt.toISOString(),
    });
    if (m.role === "OWNER") {
      entries.push({
        id: toActivityId("business", m.id),
        type: "business",
        label: `Created business "${m.business.name}"`,
        description: "Registered and owns this business",
        occurredAt: m.business.createdAt.toISOString(),
      });
    }
  }

  entries.sort((a, b) =>
    a.occurredAt > b.occurredAt
      ? -1
      : a.occurredAt < b.occurredAt
        ? 1
        : a.id < b.id
          ? -1
          : 1,
  );

  return entries.slice(0, limit);
}

/**
 * GET /api/admin/users/[id] — one user with safe detail (identity, counts,
 * memberships, recent activity, and the user's PlatformAdmin tier if any).
 * Unknown user id -> 404. Reads only; SUPPORT_ADMIN and SUPER_ADMIN may read.
 */
export async function getAdminUserDetail(idInput: string): Promise<AdminUserDetailDto> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  if (!idInput) throw new ResourceNotFoundError("User not found");

  const user = await prisma.user.findUnique({
    where: { id: idInput },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      platformAdmin: { select: { id: true, role: true, createdAt: true } },
      _count: { select: { memberships: true } },
      memberships: {
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 50,
        select: {
          id: true,
          businessId: true,
          role: true,
          status: true,
          lastActiveAt: true,
          createdAt: true,
          business: { select: { id: true, name: true, status: true } },
        },
      },
    },
  });
  if (!user) throw new ResourceNotFoundError("User not found");

  const [ownedCounts, sessionLast, recentActivity] = await Promise.all([
    prisma.businessMember.count({
      where: { userId: user.id, role: "OWNER" },
    }),
    prisma.session.findFirst({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { updatedAt: true },
    }),
    getAdminUserActivity(user.id, 10),
  ]);

  let lastActivityAt: number | null = sessionLast ? sessionLast.updatedAt.getTime() : null;
  for (const m of user.memberships) {
    if (m.lastActiveAt) {
      const t = m.lastActiveAt.getTime();
      if (lastActivityAt === null || t > lastActivityAt) lastActivityAt = t;
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    platformAdminRole: user.platformAdmin ? user.platformAdmin.role : null,
    platformAdminSince: user.platformAdmin ? user.platformAdmin.createdAt.toISOString() : null,
    businessCount: ownedCounts,
    membershipCount: user._count.memberships,
    lastActivityAt: lastActivityAt === null ? null : new Date(lastActivityAt).toISOString(),
    memberships: user.memberships.map((m) => ({
      id: m.id,
      businessId: m.businessId,
      businessName: m.business.name,
      businessStatus: m.business.status,
      role: m.role,
      status: m.status,
      lastActiveAt: ISO(m.lastActiveAt),
      createdAt: m.createdAt.toISOString(),
    })),
    recentActivity,
  };
}

/* -------------------------------------------------------------------------- */
/*  Phase 9B — User Suspend / Reactivate (SUPER_ADMIN only)                    */
/* -------------------------------------------------------------------------- */

export interface AdminUserStatusChangeDto {
  user: { id: string; name: string; status: string };
  audit: { id: string; action: string; targetType: string; targetId: string; reason: string | null; createdAt: string };
}

function parseReason(reasonInput: unknown, verb: string): string {
  if (typeof reasonInput !== "string" || reasonInput.trim().length === 0) {
    throw new ValidationError(`${verb} requires a reason`);
  }
  const trimmed = reasonInput.trim();
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new ValidationError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`);
  }
  return trimmed;
}

async function transitionUserStatus(
  idInput: string,
  reasonInput: unknown,
  action: "USER_SUSPEND" | "USER_REACTIVATE",
  fromStatus: "ACTIVE" | "SUSPENDED",
  toStatus: "ACTIVE" | "SUSPENDED",
  verb: string,
): Promise<AdminUserStatusChangeDto> {
  // The actor identity is retained for the self-suspension check and the J-1
  // denial audit below. It was previously discarded here, which is what made
  // self-suspension possible.
  const { user: actor, admin: actorAdmin } = await requirePlatformAdminRole("SUPER_ADMIN");

  const reason = parseReason(reasonInput, verb);
  if (!idInput) throw new ResourceNotFoundError("User not found");

  const user = await prisma.user.findUnique({
    where: { id: idInput },
    select: { id: true, name: true, status: true, updatedAt: true },
  });
  if (!user) throw new ResourceNotFoundError("User not found");

  if (user.status !== fromStatus) {
    throw new ConflictError(
      action === "USER_SUSPEND"
        ? "User is already suspended or not active"
        : "User is already active",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialize lockout checks. The transaction that loses this race blocks here,
    // then re-reads state below and observes the winner's committed suspension -
    // which is what makes the zero-super-admin invariant actually hold.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_GUARD_LOCK_KEY}::bigint)`;

    // Authoritative re-read INSIDE the transaction. The read above is only a
    // fail-fast pre-check; relying on it for the guard would reintroduce the race.
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, status: true, updatedAt: true },
    });
    if (!current) throw new ResourceNotFoundError("User not found");

    if (current.status !== fromStatus) {
      throw new ConflictError(
        action === "USER_SUSPEND"
          ? "User is already suspended or not active"
          : "User is already active",
      );
    }

    if (toStatus === "SUSPENDED") {
      const targetAdmin = await tx.platformAdmin.findUnique({
        where: { userId: current.id },
        select: { role: true },
      });

      // Counted inside the transaction and scoped to ACTIVE accounts, so a
      // super admin who was suspended by the winning transaction is excluded.
      const otherActiveSuperAdmins = await tx.platformAdmin.count({
        where: {
          role: "SUPER_ADMIN",
          userId: { not: current.id },
          user: { status: "ACTIVE" },
        },
      });

      const guard = evaluateSuspendGuard({
        actorId: actor.id,
        targetId: current.id,
        targetAdminRole: targetAdmin?.role ?? null,
        otherActiveSuperAdmins,
      });
      if (!guard.allowed) {
        // J-1 denial audit. Written on the TOP-LEVEL client, deliberately NOT on
        // `tx`: the guard throws, which rolls this transaction back, so coupling
        // the evidence to it would erase exactly the record we need to keep.
        // The writer never throws, so this cannot alter the 409 below.
        await recordPlatformAdminDenial({
          actorAdminId: actorAdmin.id,
          denialKind: "SECURITY_GUARD",
          action,
          targetType: "user",
          targetId: current.id,
          detail: guard.message,
        });
        throw new ConflictError(guard.message);
      }
    }

    const updated = await tx.user.update({
      where: { id: current.id },
      data: { status: toStatus },
      select: { id: true, name: true, status: true, updatedAt: true },
    });

    const audit = await writePlatformAdminLog(
      {
        action,
        targetType: "user",
        targetId: updated.id,
        reason,
        before: { status: current.status, updatedAt: current.updatedAt.toISOString() },
        after: { status: updated.status, updatedAt: updated.updatedAt.toISOString() },
      },
      { tx, minRole: "SUPER_ADMIN" },
    );

    return {
      user: { id: updated.id, name: updated.name, status: updated.status },
      audit: { id: audit.id, action: audit.action, targetType: audit.targetType, targetId: audit.targetId, reason: audit.reason, createdAt: audit.createdAt.toISOString() },
    };
  });

  return result;
}

/**
 * POST /api/admin/users/[id]/suspend — SUPER_ADMIN only. Flips user.status from
 * ACTIVE to SUSPENDED. The audit row is written inside the same DB transaction
 * as the user update; on audit failure the user change rolls back. Idempotent:
 * already SUSPENDED -> safe 409. Suspension takes effect via requireUser() on
 * every subsequent protected call while the session stays valid, and — because
 * requirePlatformAdminRole consults the same live User.status — it also revokes
 * the target's Admin Console authority immediately if they are an administrator.
 *
 * Lockout protection: refuses to suspend the caller's own account, and refuses to
 * remove the last remaining ACTIVE super admin. Both refusals are 409, matching
 * the existing "already suspended" state conflict. The checks are re-evaluated
 * inside the transaction under an advisory lock so that two super admins
 * suspending each other concurrently cannot both commit and strand the platform.
 * See admin-suspension-guard.ts for why neither rule alone is sufficient.
 */
export async function suspendAdminUser(
  id: string,
  reason: unknown,
): Promise<AdminUserStatusChangeDto> {
  return transitionUserStatus(id, reason, "USER_SUSPEND", "ACTIVE", "SUSPENDED", "Suspending");
}

/**
 * POST /api/admin/users/[id]/reactivate — SUPER_ADMIN only. Flips user.status
 * from SUSPENDED to ACTIVE. Same atomic audit contract as suspend. Idempotent:
 * already ACTIVE -> safe 409.
 */
export async function reactivateAdminUser(
  id: string,
  reason: unknown,
): Promise<AdminUserStatusChangeDto> {
  return transitionUserStatus(id, reason, "USER_REACTIVATE", "SUSPENDED", "ACTIVE", "Reactivating");
}