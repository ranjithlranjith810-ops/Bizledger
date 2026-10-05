// Phase 8A/8B/8F — Platform-Administrator AUDIT service (admin backend surface).
//
// A dedicated, immutable audit trail for platform-admin actions. Separated from
// the moderation/admin services so every future Administrator mutation funnels
// through ONE write path and one read API.
//
// IMMUTABILITY: rows are only ever INSERTed. The application/API has no
// update/delete path for `platform_admin_log`, and the DB relation is
// `onDelete: Restrict`, so the trail survives admin-row removal. Do NOT add an
// update/delete service or endpoint.
//
// ACTOR IDENTITY IS NEVER TRUSTED FROM THE CALLER: `writePlatformAdminLog`
// resolves the authenticated Better Auth user + PlatformAdmin row server-side
// from the session at every call (requirePlatformAdminRole). A client-supplied
// actorAdminId would be ignored even if a mutation service passed one.
//
// DENIALS (J-1). Because the gate above runs BEFORE any log write, a failed
// authorization attempt could never reach this function. Denials are recorded by
// `recordPlatformAdminDenial` (admin-denial-audit.ts), invoked from the gate in
// admin-auth.ts itself, so the one authoritative authorization decision is
// preserved and every admin endpoint is covered by a single hook. Success rows
// are written here; denial rows are written there; both are append-only.
//
// AUTHORIZATION:
//   - anonymous                      -> 401 (requireUser inside the gate)
//   - signed-in non-admin            -> 403 (ForbiddenError)
//   - SUPPORT_ADMIN / SUPER_ADMIN    -> allowed. The tier required for the
//     ACTION itself (e.g. SUPER_ADMIN for plan changes) is enforced by the
//     mutation service BEFORE it calls writePlatformAdminLog; this service
//     enforces the floor that every log writer must be a real PlatformAdmin.
//
// PHASE 8F — transaction-safe by design. Future mutation services are expected
// to run the whole authoritative sequence inside ONE interactive transaction:
//   1. authenticate (requireUser)
//   2. authorize the action (requirePlatformAdminRole(<actionTier>))
//   3. read the authoritative BEFORE state
//   4. mutate
//   5. read the AFTER state
//   6. writePlatformAdminLog({ ..., tx })  <- same transaction
//   7. commit
// Passing `tx` writes the audit row inside the caller's transaction, so the
// log entry commits/rolls back with the mutation.

import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AdminRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdminRole } from "@/lib/admin/admin-auth";
import { ValidationError } from "@/lib/business/api-error";
import { ADMIN_LIST_MAX_ROWS } from "@/lib/admin/admin-list-bounds";

// J-1: the DENIAL counterpart to writePlatformAdminLog lives in its own module
// (it cannot live here without an import cycle, since admin-auth imports it and
// this file imports admin-auth). Re-exported so the audit layer stays the single
// discoverable home for every platform_admin_log write path.
export {
  recordPlatformAdminDenial,
  GATE_DENIAL_ACTION,
  GATE_DENIAL_TARGET_TYPE,
  DENIED_SUFFIX,
} from "@/lib/admin/admin-denial-audit";
export type {
  PlatformAdminDenialInput,
  PlatformAdminDenialKind,
} from "@/lib/admin/admin-denial-audit";

export const MAX_TARGET_TYPE_LENGTH = 64;
export const MAX_TARGET_ID_LENGTH = 128;
export const MAX_REASON_LENGTH = 500;

// Stable machine-readable action convention: UPPER_SNAKE, starting with a
// letter. Future mutation actions (PLAN_CREATED, PLAN_UPDATED, BUSINESS_SUSPEND,
// ...) all conform. New actions are additive; nothing here pins the wiring of a
// specific mutation (Phase 8F keeps this service structure-only).
const ACTION_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

// Defensive sanitizer for before/after snapshots: values that look like
// credentials are stripped BEFORE they reach the DB (and again on read, as
// defense in depth). Never store passwords/tokens/secrets in the audit trail.
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|cookie|apikey|private.?key|credential|digest/i;

const MAX_SANITIZE_DEPTH = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Recursively strips credential-like keys from a snapshot. Unknown values
 * (functions/symbols) are dropped; cycles are bounded by MAX_SANITIZE_DEPTH.
 */
export function sanitizeSnapshot<T extends Prisma.InputJsonValue | null | undefined>(
  value: T,
  depth = 0,
): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (depth >= MAX_SANITIZE_DEPTH) return null;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSnapshot(item as Prisma.InputJsonValue, depth + 1));
  }
  if (isPlainObject(value)) {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      out[key] = sanitizeSnapshot(child as Prisma.InputJsonValue, depth + 1) as Prisma.InputJsonValue;
    }
    return out;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return value as Prisma.InputJsonValue;
  }
  return null;
}

function validateInput(input: PlatformAdminLogInput): void {
  if (typeof input.action !== "string" || !ACTION_PATTERN.test(input.action)) {
    throw new ValidationError(
      "action must be a non-empty uppercase snake_case string (2-64 chars)",
    );
  }
  if (typeof input.targetType !== "string" || input.targetType.trim().length === 0) {
    throw new ValidationError("targetType is required");
  }
  if (input.targetType.length > MAX_TARGET_TYPE_LENGTH) {
    throw new ValidationError(
      `targetType must be ${MAX_TARGET_TYPE_LENGTH} characters or fewer`,
    );
  }
  if (typeof input.targetId !== "string" || input.targetId.trim().length === 0) {
    throw new ValidationError("targetId is required");
  }
  if (input.targetId.length > MAX_TARGET_ID_LENGTH) {
    throw new ValidationError(`targetId must be ${MAX_TARGET_ID_LENGTH} characters or fewer`);
  }
  if (input.reason !== undefined && input.reason !== null) {
    if (typeof input.reason !== "string") {
      throw new ValidationError("reason must be a string or null");
    }
    if (input.reason.length > MAX_REASON_LENGTH) {
      throw new ValidationError(`reason must be ${MAX_REASON_LENGTH} characters or fewer`);
    }
  }
}

export interface PlatformAdminLogInput {
  /** Machine-readable action, e.g. PLAN_UPDATED (UPPER_SNAKE, 2-64 chars). */
  action: string;
  /** Target entity kind, e.g. PLANNED_PLAN / business / user. */
  targetType: string;
  /** Target entity row id. */
  targetId: string;
  /** Optional human-readable reason/note supplied by the performing admin. */
  reason?: string | null;
  /** Authoritative BEFORE state (JSON). Credential-like keys are stripped. */
  before?: Prisma.InputJsonValue | null;
  /** Authoritative AFTER state (JSON). Credential-like keys are stripped. */
  after?: Prisma.InputJsonValue | null;
}

export interface WritePlatformAdminLogOptions {
  /**
   * Interactive transaction to write the row inside (Phase 8F — audit commit
   * matches the mutation commit). Defaults to the top-level prisma client.
   */
  tx?: Prisma.TransactionClient;
  /** Floor tier a writer must hold. Default SUPPORT_ADMIN (any PlatformAdmin). */
  minRole?: AdminRole;
}

export interface PlatformAdminLogRow {
  id: string;
  actorAdminId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  createdAt: Date;
}

/**
 * Write ONE immutable audit row. Inserts only — never updates/deletes.
 * Identity is resolved server-side from the session (a passed actorAdminId is
 * never accepted). Primed for Phase 8F callers to pass their interactive
 * transaction so BEFORE + mutation + AFTER + log commit atomically.
 */
export async function writePlatformAdminLog(
  input: PlatformAdminLogInput,
  options?: WritePlatformAdminLogOptions,
): Promise<PlatformAdminLogRow> {
  const txClient = options?.tx ?? prisma;
  const minRole = options?.minRole ?? "SUPPORT_ADMIN";

  validateInput(input);

  const before = sanitizeSnapshot(input.before);
  const after = sanitizeSnapshot(input.after);

  const { admin } = await requirePlatformAdminRole(minRole);

  const row = await txClient.platformAdminLog.create({
    data: {
      actorAdminId: admin.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason?.trim() ? input.reason.trim() : null,
      // Nullable Json columns: absent snapshots are stored as SQL NULL (omit
      // the key) instead of JSON null.
      ...(before === null ? {} : { before }),
      ...(after === null ? {} : { after }),
    },
  });

  return {
    id: row.id,
    actorAdminId: row.actorAdminId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt,
  };
}

/**
 * Safe, wire-ready DTO for the Admin audit view. Actor identity (PlatformAdmin
 * id + the linked Better Auth user email/name) is included; before/after
 * snapshots are re-sanitized server-side so a read path can never leak a
 * stray credential even if a snapshot predicate changed.
 */
export interface AdminAuditLogDto {
  id: string;
  actor: { id: string; email: string; name: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/**
 * GET /api/admin/audit — every audit row, newest first (createdAt DESC, id
 * DESC for deterministic order), with the acting admin's identity. SUPPORT_ADMIN
 * and SUPER_ADMIN may read; anonymous -> 401; signed-in non-admin -> 403; roles
 * are resolved from the server session, never the browser. Strictly READ-ONLY.
 */
export async function listAdminAuditLogs(): Promise<AdminAuditLogDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

      const rows = await prisma.platformAdminLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ADMIN_LIST_MAX_ROWS,
        include: {
      actorPlatformAdmin: {
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    actor: row.actorPlatformAdmin
      ? {
          id: row.actorPlatformAdmin.id,
          email: row.actorPlatformAdmin.user.email,
          name: row.actorPlatformAdmin.user.name,
        }
      : null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    before: sanitizeSnapshot(row.before),
    after: sanitizeSnapshot(row.after),
    createdAt: row.createdAt.toISOString(),
  }));
}