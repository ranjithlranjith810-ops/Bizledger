// Pure policy layer for POST /api/admin/users/[id]/suspend.
//
// Deliberately dependency-free (no `server-only`, no Prisma, no error imports) so
// the lockout policy is unit-testable in isolation. The caller (admin-users-service)
// resolves the actor, the target's platform-admin row and the live super-admin count,
// then maps a refusal onto the same 409 ConflictError already used for the
// "already suspended" state conflict.
//
// WHY BOTH RULES EXIST (neither is implied by the other):
//
//   SELF_SUSPEND           - the accidental case. An administrator who suspends their
//                            own account discovers the mistake only after their session
//                            dies. This is refused unconditionally, even when it would
//                            not actually strand the platform.
//
//   LAST_ACTIVE_SUPER_ADMIN- the structural invariant, and the only rule that holds
//                            under concurrency. Two SUPER_ADMINs who each request to
//                            suspend the *other* both pass the authorization gate while
//                            still active, and both would otherwise commit, leaving
//                            zero active SUPER_ADMINs. Blocking self-suspension alone
//                            does not close that path.
//
// Neither a naive count nor serialization alone is sufficient. Under READ COMMITTED a
// plain count-then-update is a TOCTOU race, and serializing the two transactions does
// not help either unless the count is re-read INSIDE the transaction, so that the
// transaction which loses the race observes the winner's already-committed suspension
// and counts zero remaining active super admins. The caller is responsible for that
// ordering; see transitionUserStatus().

export type SuspendRefusalCode = "SELF_SUSPEND" | "LAST_ACTIVE_SUPER_ADMIN";

export type AdminTier = "SUPER_ADMIN" | "SUPPORT_ADMIN";

export interface SuspendGuardInput {
  /** The authenticated administrator performing the suspension. */
  actorId: string;
  /** The user whose account is being suspended. */
  targetId: string;
  /** The target's platform-admin tier, or null when the target is a customer. */
  targetAdminRole: AdminTier | null;
  /**
   * Number of ACTIVE SUPER_ADMIN platform admins other than the target, read
   * inside the same transaction as the status update.
   */
  otherActiveSuperAdmins: number;
}

export type SuspendGuardResult =
  | { allowed: true }
  | { allowed: false; code: SuspendRefusalCode; message: string };

/**
 * Decides whether a suspension may proceed. Pure: no I/O, no throwing, so the
 * policy is exhaustively testable without a database.
 */
export function evaluateSuspendGuard(input: SuspendGuardInput): SuspendGuardResult {
  if (input.targetId === input.actorId) {
    return {
      allowed: false,
      code: "SELF_SUSPEND",
      message: "You cannot suspend your own administrator account",
    };
  }

  // Only a super admin target can strand the platform; suspending a customer or a
  // SUPPORT_ADMIN can never reduce the number of active super admins.
  if (input.targetAdminRole === "SUPER_ADMIN" && input.otherActiveSuperAdmins === 0) {
    return {
      allowed: false,
      code: "LAST_ACTIVE_SUPER_ADMIN",
      message: "Cannot suspend the last active super administrator",
    };
  }

  return { allowed: true };
}