// Server-side role → permission core (Security Hardening 1 — F2).
//
// The SINGLE source of truth for role baselines and effective permissions used
// by server-side authorization. The UI mirrors this in `@/lib/permissions.ts`
// but the SERVER is the authority: every business-scoped API/service resolves
// the member's role + stored permissions from the database and calls
// `canPerform` before mutating or reading data.
//
// A member's EFFECTIVE permissions are the role baseline merged with any
// per-member `permissions` override stored on the BusinessMember row (validated
// against the allowlist below — it is never an arbitrary blob).
//
// MEMBER_ROLES is the canonical DB role vocabulary (BusinessMemberRole):
//   OWNER → UI "Owner"        (full access)
//   ADMIN → UI "Accountant"   (accounting preset — no invoice/expense delete,
//                              no fleet management; approve allowed)
//   MANAGER → UI "Manager"    (same as ADMIN plus fleet manage, minus deletes)
//   STAFF → UI "Staff"        (view + create only)

import { ValidationError } from "@/lib/business/api-error";
import { ROLES, canGrantRole, type Role } from "@/lib/authz/role-grants";

/** Canonical DB role vocabulary + the role-grant decision helper, re-exported
 *  from the pure role-grants core so the vocabulary and the grant hierarchy can
 *  never drift apart. */
export type AuthzRole = Role;
export { canGrantRole };

export type AuthzModule =
  | "invoices"
  | "expenses"
  | "vehicles"
  | "customers"
  | "reports"
  | "settings";

export type AuthzAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "manage"
  | "logExpenses"
  | "export";

/** Fixed-shape module permission allowlist (server-side mirror of the
 * frontend `ModulePermissions` type). Unknown modules/actions are rejected —
 * the stored `permissions` JSONB is never an arbitrary blob. */
export const PERMISSION_KEYMAP: Record<AuthzModule, AuthzAction[]> = {
  invoices: ["view", "create", "edit", "delete"],
  expenses: ["view", "create", "approve", "delete"],
  vehicles: ["view", "manage", "logExpenses"],
  customers: ["view", "manage"],
  reports: ["view", "export"],
  settings: ["view", "edit"],
};

export type ModulePermissions = Record<AuthzModule, Record<AuthzAction, boolean>>;

export const MEMBER_ROLES: AuthzRole[] = [...ROLES];

function allFalse(): Record<AuthzAction, boolean> {
  return {
    view: false,
    create: false,
    edit: false,
    delete: false,
    approve: false,
    manage: false,
    logExpenses: false,
    export: false,
  };
}

export function roleDefaultPermissions(role: AuthzRole): ModulePermissions {
  if (role === "OWNER") {
    return {
      invoices: { ...allFalse(), view: true, create: true, edit: true, delete: true },
      expenses: { ...allFalse(), view: true, create: true, approve: true, delete: true },
      vehicles: { ...allFalse(), view: true, manage: true, logExpenses: true },
      customers: { ...allFalse(), view: true, manage: true },
      reports: { ...allFalse(), view: true, export: true },
      settings: { ...allFalse(), view: true, edit: true },
    };
  }
  if (role === "MANAGER") {
    return {
      invoices: { ...allFalse(), view: true, create: true, edit: true, delete: false },
      expenses: { ...allFalse(), view: true, create: true, approve: true, delete: false },
      vehicles: { ...allFalse(), view: true, manage: true, logExpenses: true },
      customers: { ...allFalse(), view: true, manage: true },
      reports: { ...allFalse(), view: true, export: true },
      settings: { ...allFalse(), view: true, edit: false },
    };
  }
  if (role === "ADMIN") {
    // Frontend "Accountant" preset — same as Manager except fleet manage is off.
    return {
      invoices: { ...allFalse(), view: true, create: true, edit: true, delete: false },
      expenses: { ...allFalse(), view: true, create: true, approve: true, delete: false },
      vehicles: { ...allFalse(), view: true, manage: false, logExpenses: true },
      customers: { ...allFalse(), view: true, manage: true },
      reports: { ...allFalse(), view: true, export: true },
      settings: { ...allFalse(), view: true, edit: false },
    };
  }
  return {
    invoices: { ...allFalse(), view: true, create: true, edit: false, delete: false },
    expenses: { ...allFalse(), view: true, create: true, approve: false, delete: false },
    vehicles: { ...allFalse(), view: true, manage: false, logExpenses: true },
    customers: { ...allFalse(), view: true, manage: false },
    reports: { ...allFalse(), view: false, export: false },
    settings: { ...allFalse(), view: false, edit: false },
  };
}

function assertPlainObject(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ValidationError("permissions must be an object");
  }
  return v as Record<string, unknown>;
}

/** Merge a per-member permissions override onto the role baseline, validating
 * every key/action against the allowlist. Throws ValidationError on unknown
 * modules/actions or non-boolean values (mirrors team invite validation). */
export function mergePermissions(
  base: ModulePermissions,
  override: Record<string, unknown>,
): ModulePermissions {
  const out: ModulePermissions = JSON.parse(JSON.stringify(base)) as ModulePermissions;
  for (const [module, allowedActions] of Object.entries(PERMISSION_KEYMAP)) {
    const value = override[module];
    if (value === undefined) continue;
    const moduleValue = assertPlainObject(value);
    const allowed = new Set<AuthzAction>(allowedActions);
    for (const key of Object.keys(moduleValue)) {
      if (!allowed.has(key as AuthzAction)) {
        throw new ValidationError(`Unknown permission '${module}.${key}'`);
      }
      if (typeof moduleValue[key] !== "boolean") {
        throw new ValidationError(`Permission '${module}.${key}' must be a boolean`);
      }
      out[module as AuthzModule][key as AuthzAction] = Boolean(moduleValue[key]);
    }
  }
  for (const key of Object.keys(override)) {
    if (!(key in PERMISSION_KEYMAP)) {
      throw new ValidationError(`Unknown permission module '${key}'`);
    }
  }
  return out;
}

/**
 * Effective permissions for a membership: role baseline merged with the stored
 * per-member override. Tolerant parse — a malformed override (e.g. persisted
 * by an older build) gracefully falls back to the role baseline instead of
 * crashing authorization.
 */
export function effectivePermissions(
  role: AuthzRole,
  stored: unknown,
): ModulePermissions {
  const base = roleDefaultPermissions(role);
  if (stored === undefined || stored === null) return base;
  try {
    const object = assertPlainObject(stored);
    return mergePermissions(base, object);
  } catch {
    return base;
  }
}

/** Boolean decision helper — the single authz check used by guards. */
export function canPerform(
  perms: ModulePermissions,
  module: AuthzModule,
  action: AuthzAction,
): boolean {
  return Boolean(perms[module]?.[action]);
}

export interface PermissionEscalation {
  module: AuthzModule;
  action: AuthzAction;
}

/**
 * Delegation ceiling check for the PERMISSIONS channel of an invite.
 *
 * `canGrantRole` bounds the `role` field; this bounds the parallel
 * `permissions` override. An override may DELEGATE a permission the actor
 * already holds, but may never grant one it does not — otherwise a business
 * ADMIN (`settings.edit = false`, `invoices.delete = false`) could mint a seat
 * that rewrites the company's GSTIN / bank account numbers / subscription, or
 * that lifts a STAFF seat above its documented "view + create only" baseline.
 *
 * Semantics, deliberately asymmetric:
 *   - requested `true`  where the actor lacks it  → an ESCALATION (rejected)
 *   - requested `false`                            → a restriction, never an
 *     escalation, and always permitted (a seat may always be narrowed)
 *
 * The target role's own baseline is NOT part of this check and is left intact
 * by the caller: `canGrantRole` already decides whether the actor may hand out
 * that role at all, and clamping the merged baseline would wrongly strip, for
 * example, `MANAGER`'s `vehicles.manage` when the granting actor is an ADMIN.
 *
 * Unknown modules/actions and non-boolean values are rejected here with the
 * same messages `mergePermissions` uses, so an override is validated by exactly
 * one set of rules whether it is validated here or merged there.
 */
export function findPermissionEscalations(
  override: Record<string, unknown>,
  ceiling: ModulePermissions,
): PermissionEscalation[] {
  // Validate the override container itself first, so a null/array/non-object
  // fails as a ValidationError (like `mergePermissions`) instead of a TypeError.
  const container = assertPlainObject(override);
  const escalations: PermissionEscalation[] = [];
  for (const [module, moduleOverride] of Object.entries(container)) {
    if (!(module in PERMISSION_KEYMAP)) {
      throw new ValidationError(`Unknown permission module '${module}'`);
    }
    const moduleValue = assertPlainObject(moduleOverride);
    const allowed = new Set<AuthzAction>(PERMISSION_KEYMAP[module as AuthzModule]);
    for (const key of Object.keys(moduleValue)) {
      if (!allowed.has(key as AuthzAction)) {
        throw new ValidationError(`Unknown permission '${module}.${key}'`);
      }
      if (typeof moduleValue[key] !== "boolean") {
        throw new ValidationError(`Permission '${module}.${key}' must be a boolean`);
      }
      if (
        moduleValue[key] === true &&
        !canPerform(ceiling, module as AuthzModule, key as AuthzAction)
      ) {
        escalations.push({ module: module as AuthzModule, action: key as AuthzAction });
      }
    }
  }
  return escalations;
}