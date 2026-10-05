// Pure role → grant-hierarchy core (no DB, no framework imports).
//
// The role vocabulary and the "who may hand out which role" hierarchy live here,
// dependency-free, so the single decision helper `canGrantRole` can be unit
// tested in isolation (see `src/__tests__/role-grant-escalation.test.ts`) and
// reused by the server-side authorization guards.
//
// Privilege-escalation invariant (mirrors the revoke rule in `team-service`:
// "only an owner can remove another owner"):
//
//   OWNER  → may grant OWNER, ADMIN, MANAGER, STAFF
//   ADMIN  → may grant ADMIN, MANAGER, STAFF  (NEVER OWNER)
//   MANAGER→ may grant MANAGER, STAFF
//   STAFF  → may grant STAFF
//
// A non-owner must never be able to mint a new OWNER membership; only a
// business OWNER can grant the owner role.

/** Canonical DB role vocabulary (BusinessMemberRole). */
export type Role = "OWNER" | "ADMIN" | "MANAGER" | "STAFF";

/** Canonical, ordered role list (the vocabulary every other list derives from). */
export const ROLES: readonly Role[] = ["OWNER", "ADMIN", "MANAGER", "STAFF"];

/**
 * Role-grant hierarchy — the set of roles each actor role may assign to a new
 * membership. Total by construction: every role has an entry, so the decision is
 * always defined and a future role cannot silently be treated as "grants all".
 */
export const GRANTABLE_ROLES: Record<Role, readonly Role[]> = {
  OWNER: ROLES,
  ADMIN: ["ADMIN", "MANAGER", "STAFF"],
  MANAGER: ["MANAGER", "STAFF"],
  STAFF: ["STAFF"],
};

/** Boolean decision helper — may `actor` assign membership role `target`? */
export function canGrantRole(actor: Role, target: Role): boolean {
  return GRANTABLE_ROLES[actor].includes(target);
}
