// Platform-Administrator AUTHORIZATION gate, shared by every admin mutation
// service ("admin-auth" — platform-admin gates, not the browser session form).
//
// Split out of directory-admin-service so the directory moderation service can
// write audit rows (admin-audit-service) WITHOUT a circular import: every admin
// service imports the role gate from HERE, and admin-audit-service imports it
// from HERE too. directory-admin-service re-exports both gates to keep its
// historical import surface intact ("@/lib/directory/directory-admin-service").
//
// Contract (unchanged, just relocated):
//   - anonymous                          -> 401 (requireUser inside the gate)
//   - signed-in non-admin                -> 403 (ForbiddenError)
//   - suspended platform admin           -> 403 (ForbiddenError)
//   - PlatformAdmin below the tier asked for -> 403 (insufficient privileges)
// The actor identity and role are resolved from the Better Auth session at
// EVERY call — never from the request body, headers or localStorage.

import "server-only";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/business/tenant";
import { ForbiddenError } from "@/lib/business/business-service";
import {
  GATE_DENIAL_ACTION,
  recordPlatformAdminDenial,
} from "@/lib/admin/admin-denial-audit";
import type { AdminRole } from "@/generated/prisma/client";

/**
 * Admin tier ordering: SUPPORT_ADMIN is the restricted assistant tier (reserved
 * for future support-style duties), SUPER_ADMIN is the full-power tier.
 */
const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  SUPPORT_ADMIN: 0,
  SUPER_ADMIN: 1,
};

/**
 * Denial-audit shim (J-1). `recordPlatformAdminDenial` is already written to
 * swallow its own failures, but the gate must not depend on that staying true:
 * an audit problem must never be able to replace the authorization outcome the
 * caller expects. This wrapper guarantees the original ForbiddenError below
 * always propagates — the request is still denied (fail closed), and a broken
 * audit table degrades to "no evidence" rather than a misleading 500.
 */
async function auditDenial(
  input: Parameters<typeof recordPlatformAdminDenial>[0],
): Promise<void> {
  try {
    await recordPlatformAdminDenial(input);
  } catch {
    // Intentionally ignored. Losing evidence must never grant or deny differently.
  }
}

/**
 * Authorization gate for platform-level moderation. Resolves the session and
 * requires a PlatformAdmin record for the signed-in user carrying at least
 * `minRole` (SUPPORT_ADMIN < SUPER_ADMIN). 401 if not signed in; 403 if signed
 * in but not a platform admin, if the administrator account is SUSPENDED, or if
 * the admin is below the required tier.
 *
 * SECURITY INVARIANT: a suspended platform administrator holds NO authority, at
 * any tier. This function is the single gate every admin service funnels
 * through, so the rule cannot be sidestepped by calling a service directly or by
 * reaching an admin route that does not re-check the tier.
 *
 * SUSPENSION IS READ LIVE, NOT FROM THE SESSION. `requireUser` re-reads the
 * User row from the database on every call (Better Auth may serve a cached
 * session snapshot), so suspending an administrator revokes their authority on
 * their very next privileged request — no logout, cookie expiry or session
 * revocation required.
 */
export async function requirePlatformAdminRole(minRole: AdminRole) {
  // `ignoreSuspension` is deliberate and narrow: the generic customer-facing
  // SuspendedUserError must not pre-empt the administrator-specific denial
  // below, and we need the freshly-read user row to make that decision here.
  // It does NOT skip the check — the suspension test is the next statement after
  // the admin row is resolved.
  const { user } = await requireUser({ ignoreSuspension: true });
  const admin = await prisma.platformAdmin.findUnique({ where: { userId: user.id } });
  if (!admin) throw new ForbiddenError("Administrator access required");
  // Checked before the tier comparison so a suspended administrator is refused
  // for the real reason, whatever tier the endpoint asked for.
  //
  // DENIAL AUDIT (J-1). Both denials below append an immutable evidence row
  // before throwing. `admin.id` is the server-resolved PlatformAdmin row, so the
  // trail records a real actor — never a client-supplied identity. The writer
  // cannot throw and cannot grant authority: it only INSERTs into the audit
  // table, and the ForbiddenError below still propagates either way. `await`ed
  // so the evidence is durable before the 403 reaches the client.
  //
  // The `!admin` case above is deliberately NOT audited: `platform_admin_log.
  // actorAdminId` is NOT NULL with an FK to PlatformAdmin, so a signed-in
  // non-admin has no representable actor and inventing one would forge evidence.
  if (user.status === "SUSPENDED") {
    await auditDenial({
      actorAdminId: admin.id,
      denialKind: "ADMIN_SUSPENDED",
      action: GATE_DENIAL_ACTION,
      detail: "Administrator account is suspended",
    });
    throw new ForbiddenError("Administrator account is suspended");
  }
  if (ADMIN_ROLE_RANK[admin.role] < ADMIN_ROLE_RANK[minRole]) {
    await auditDenial({
      actorAdminId: admin.id,
      denialKind: "INSUFFICIENT_ROLE",
      action: GATE_DENIAL_ACTION,
      requiredRole: minRole,
      detail: "Insufficient administrator privileges",
    });
    throw new ForbiddenError("Insufficient administrator privileges");
  }
  return { user, admin };
}

/**
 * Full-power admin gate (the current moderation behavior). Equivalent to
 * requirePlatformAdminRole("SUPER_ADMIN").
 */
export async function requirePlatformAdmin() {
  return requirePlatformAdminRole("SUPER_ADMIN");
}
