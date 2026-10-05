// Server-side Business Directory MODERATION service layer (Phase 3H).
//
// This is the authenticated, authorization-gated backend for the directory
// moderation flow. Authorization is REAL and server-side: the caller must be
// signed in (session, via requireUser) AND have a row in the dedicated
// `PlatformAdmin` table (`platform_admin`). The PlatformAdmin identity is
// deliberately separate from the Better Auth `User` (no role column) and is
// resolved from the session at every call — never from the request body.
//
// API security posture:
//   - unauthenticated caller            -> 401 (UnauthorizedError)
//   - signed-in non-admin               -> 403 (ForbiddenError)
//   - nonexistent listing id, or a
//     transition the current status
//     does not permit                   -> 409 (ConflictError)
//   - unknown listing id                -> 404 (ResourceNotFoundError)
//
// NOTE — THE ADMIN MODERATION UI consumes THESE server APIs: every view/mutation
// is authorization-gated HERE (PlatformAdmin auth + role resolved from the
// session, never trusted from the browser), and (Phase 9C-5A) every moderation
// decision writes an immutable platform_admin_log row in the SAME transaction
// as the status transition.

import { prisma } from "@/lib/prisma";
import {
  ResourceNotFoundError,
  ValidationError,
  ConflictError,
} from "@/lib/business/api-error";
import { createNotification } from "@/lib/notification/notification-service";
import { toMineJson } from "@/lib/directory/directory-service";
import { requirePlatformAdmin } from "@/lib/admin/admin-auth";
import { writePlatformAdminLog } from "@/lib/admin/admin-audit-service";
import type { DirectoryStatus } from "@/generated/prisma/client";

// Historical import surface: the other admin services import the role gates
// from this module ("@/lib/directory/directory-admin-service"). Re-export the
// relocated gates so those imports keep working unchanged.
export { requirePlatformAdmin, requirePlatformAdminRole } from "@/lib/admin/admin-auth";

const STR = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

const ADMIN_ACTIONS = ["approve", "reject", "suspend", "restore"] as const;
export type DirectoryAdminAction = (typeof ADMIN_ACTIONS)[number];

const LABEL_TO_STATUS: Record<string, DirectoryStatus> = {
  "Not Listed": "NOT_LISTED",
  "Pending Review": "PENDING_REVIEW",
  Published: "PUBLISHED",
  Suspended: "SUSPENDED",
  Rejected: "REJECTED",
};

const STATUS_TO_LABEL: Record<DirectoryStatus, string> = {
  NOT_LISTED: "Not Listed",
  PENDING_REVIEW: "Pending Review",
  PUBLISHED: "Published",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
};

/**
 * GET /api/directory/admin[?status=...] — the moderation queue. Only platform
 * admins may list the queue; the queue exposes the same intentionally-public
 * profile shape as /mine (state machines differ, but no private business data).
 */
export async function listDirectoryModerationQueue(opts: { status?: string }) {
  await requirePlatformAdmin();

  const where: { status?: DirectoryStatus } = {};
  const statusLabel = STR(opts?.status);
  if (statusLabel && statusLabel !== "All") {
    const status = LABEL_TO_STATUS[statusLabel];
    if (!status) throw new ValidationError("Invalid moderation status filter");
    where.status = status;
  }

  const rows = await prisma.businessDirectoryProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(toMineJson);
}

// Allowed lifecycle transitions (from -> to). Anything else is a 409 conflict;
// approving an already-published listing, suspending a rejected one, etc.
const TRANSITIONS: Record<
  DirectoryAdminAction,
  { from: DirectoryStatus[]; to: DirectoryStatus; isListed: boolean }
> = {
  approve: { from: ["PENDING_REVIEW", "SUSPENDED"], to: "PUBLISHED", isListed: true },
  reject: { from: ["PENDING_REVIEW", "SUSPENDED"], to: "REJECTED", isListed: false },
  suspend: { from: ["PUBLISHED"], to: "SUSPENDED", isListed: false },
  restore: { from: ["SUSPENDED", "REJECTED"], to: "PUBLISHED", isListed: true },
};

// Phase 9C-5A — stable machine-readable audit action names for directory
// moderation (UPPER_SNAKE, conform to the audit-service ACTION_PATTERN).
const DIRECTORY_AUDIT_ACTION: Record<DirectoryAdminAction, string> = {
  approve: "DIRECTORY_APPROVE",
  reject: "DIRECTORY_REJECT",
  suspend: "DIRECTORY_SUSPEND",
  restore: "DIRECTORY_RESTORE",
};

/**
 * POST /api/directory/admin/[id]/approve|reject|suspend|restore — one
 * state-machine step, always gated by requirePlatformAdmin.
 */
export async function moderateDirectoryListing(
  profileIdInput: unknown,
  actionInput: unknown,
) {
  await requirePlatformAdmin();

  const id = STR(profileIdInput);
  if (!id) throw new ValidationError("Missing listing id");
  if (id.length > 64) throw new ValidationError("Invalid listing id");

  const action = STR(actionInput);
  if (!action || !(ADMIN_ACTIONS as readonly string[]).includes(action)) {
    throw new ValidationError("Invalid moderation action");
  }
  const t = TRANSITIONS[action as DirectoryAdminAction];

  const profile = await prisma.businessDirectoryProfile.findUnique({ where: { id } });
  if (!profile) throw new ResourceNotFoundError("Listing not found");

  if (!(t.from as readonly string[]).includes(profile.status)) {
    throw new ConflictError(
      `Cannot ${action} a listing that is "${STATUS_TO_LABEL[profile.status]}"; allowed from ${t.from
        .map((s) => STATUS_TO_LABEL[s])
        .join(" or ")}`,
    );
  }

  // Phase 9C-5A — the status transition and its immutable audit row commit
  // ATOMICALLY. writePlatformAdminLog resolves the acting PlatformAdmin from
  // the server session (never the request), sanitizes the before/after
  // snapshots, and enforces the SUPER_ADMIN floor again before inserting
  // inside this transaction — so an audit failure rolls back the moderation.
  const beforeSnapshot = { status: profile.status, isListed: profile.isListed };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.businessDirectoryProfile.update({
      where: { id },
      data: { status: t.to, isListed: t.isListed },
    });
    await writePlatformAdminLog(
      {
        action: DIRECTORY_AUDIT_ACTION[action as DirectoryAdminAction],
        targetType: "directory",
        targetId: row.id,
        before: beforeSnapshot,
        after: { status: row.status, isListed: row.isListed },
      },
      { tx, minRole: "SUPER_ADMIN" },
    );
    return row;
  });

  // Notify the listing's OWNER (the business's active OWNER membership).
  const owner = await prisma.businessMember.findFirst({
    where: { businessId: profile.businessId, role: "OWNER", status: "ACTIVE" },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  if (owner) {
    const isApproval = t.to === "PUBLISHED";
    await createNotification({
      userId: owner.userId,
      businessId: profile.businessId,
      type: isApproval ? "success" : "warning",
      title: `Directory listing ${isApproval ? "published" : action}d`,
      message: `Your business "${updated.companyName}" is now ${
        STATUS_TO_LABEL[updated.status]
      } in the public directory.`,
      entityType: "directory",
      entityId: updated.id,
    }).catch(() => undefined);
  }

  return toMineJson(updated);
}