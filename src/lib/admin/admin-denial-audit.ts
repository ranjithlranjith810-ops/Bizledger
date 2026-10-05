// Phase 8F (J-1) — DENIAL audit writer for platform-admin authorization failures.
//
// WHY THIS EXISTS SEPARATELY FROM writePlatformAdminLog
// `writePlatformAdminLog` (admin-audit-service) calls `requirePlatformAdminRole`
// as a PRECONDITION, so by construction it can only ever record a request that was
// already authorized. A denial throws inside that same gate, before any service
// reaches its success-path log call — which is why failed privileged attempts left
// no trail. This module is the deliberately gate-free counterpart used ONLY after a
// denial has already been decided.
//
// SECURITY INVARIANT — this function grants NOTHING.
// It performs a single INSERT into the append-only `platform_admin_log` table. It
// never resolves a session, never reads a client-supplied actor, and never returns
// success/failure to the caller in a way that could gate an operation. Every caller
// still throws its own original error afterwards, so recording a denial can only
// ever add evidence, never permission.
//
// IT LIVES IN ITS OWN MODULE to avoid an import cycle: admin-auth imports this file,
// while admin-audit-service imports admin-auth. (The same reason admin-auth was
// originally split out of directory-admin-service.)
//
// FAIL CLOSED. `recordPlatformAdminDenial` never throws and never rejects. If the
// audit write itself fails (audit table unavailable, FK violation, DB outage) the
// error is swallowed and the caller's original ForbiddenError/ConflictError still
// propagates. "Audit failed -> allow operation" is impossible by construction: this
// function has no return path into the authorization decision.
//
// ACTOR IDENTITY IS NEVER CLIENT-SUPPLIED. `actorAdminId` must be a PlatformAdmin
// row id the server already resolved from the live session. The `platform_admin_log`
// FK is NOT NULL with onDelete: Restrict, so an unauthenticated or non-admin
// attempt has NO representable actor and is deliberately NOT recorded here — see
// the J-1 report for the schema decision that gap requires.
//
// INFORMATION SAFETY. This writer accepts no request body, header, snapshot or
// free-form client text. `detail` is a fixed server-generated string, `action` is
// validated against the same UPPER_SNAKE convention as the success path, and every
// identifier is length-bounded. Nothing credential-shaped can enter the trail.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { AdminRole } from "@/generated/prisma/client";

// Reuse the success path's bounds so denial rows cannot be longer-lived or
// wider than the rows they sit beside.
const MAX_ACTION_LENGTH = 64;
const MAX_TARGET_TYPE_LENGTH = 64;
const MAX_TARGET_ID_LENGTH = 128;
const MAX_REASON_LENGTH = 500;

const ACTION_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export const DENIED_SUFFIX = "_DENIED";

export type PlatformAdminDenialKind =
  /** The session resolved to an administrator whose User.status is SUSPENDED. */
  | "ADMIN_SUSPENDED"
  /** A real PlatformAdmin below the tier the action requires. */
  | "INSUFFICIENT_ROLE"
  /** A valid SUPER_ADMIN refused by a business/security guard (e.g. lockout guard). */
  | "SECURITY_GUARD";

/** Action recorded when the gate denies before any route-level action is known. */
export const GATE_DENIAL_ACTION = "ADMIN_AUTHORIZATION";
export const GATE_DENIAL_TARGET_TYPE = "admin_authorization";

export interface PlatformAdminDenialInput {
  /**
   * PlatformAdmin row id, resolved server-side from the live session. NEVER a
   * client-supplied value and never a User id.
   */
  actorAdminId: string;
  denialKind: PlatformAdminDenialKind;
  /** UPPER_SNAKE action being attempted, e.g. "USER_SUSPEND". */
  action?: string;
  targetType?: string;
  targetId?: string;
  /** Tier the attempt required, when the denial was tier-based. */
  requiredRole?: AdminRole;
  /** Fixed server-side explanation. Must not carry request data. */
  detail?: string;
}

function bounded(value: string | undefined, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Append ONE immutable denial row. Resolves to true when the evidence was
 * persisted, false when it could not be. Never throws — see FAIL CLOSED above.
 */
export async function recordPlatformAdminDenial(
  input: PlatformAdminDenialInput,
): Promise<boolean> {
  try {
    // Identities and ids are server-derived; if either is somehow absent we
    // cannot satisfy the NOT NULL FK, so record nothing rather than invent one.
    const actorAdminId = bounded(input.actorAdminId, MAX_TARGET_ID_LENGTH, "");
    if (!actorAdminId) return false;

    const base = bounded(input.action, MAX_ACTION_LENGTH - DENIED_SUFFIX.length, GATE_DENIAL_ACTION);
    const action = `${base}${DENIED_SUFFIX}`;
    if (!ACTION_PATTERN.test(action)) return false;

    const targetType = bounded(input.targetType, MAX_TARGET_TYPE_LENGTH, GATE_DENIAL_TARGET_TYPE);
    const targetId = bounded(input.targetId, MAX_TARGET_ID_LENGTH, actorAdminId);

    // The denial reason is server-generated text only — never echoed client input.
    const reason = bounded(
      input.detail,
      MAX_REASON_LENGTH,
      `Denied: ${input.denialKind}`,
    );

    const outcome: Record<string, string> = { outcome: "DENIED", denialKind: input.denialKind };
    if (input.requiredRole) outcome.requiredRole = input.requiredRole;

    await prisma.platformAdminLog.create({
      data: {
        actorAdminId,
        action,
        targetType,
        targetId,
        reason,
        before: outcome,
      },
    });
    return true;
  } catch {
    // Deliberately swallowed. Losing the evidence must never change the
    // authorization outcome, and must never surface a 500 in place of the
    // caller's intended 403/409.
    return false;
  }
}