/**
 * Centralized role → permission contract.
 *
 * Everything enforcing what a signed-in team member may view or do is derived
 * from the ModulePermissions shapes defined in @/types. The Owner (the account
 * holder who authenticated) always holds full access. This module is the single
 * backend-ready source of truth for role based access control — components and
 * route guards should call these helpers instead of embedding role logic.
 *
 * NOTE: The current backend-phase app authenticates a single local operator
 * (the Owner). Team-member permission DATA is stored per member, but no
 * "act as another member" session exists yet, so runtime enforcement here uses
 * the Owner's (full) permissions. The matrix below stays authoritative for the
 * backend phase and is fully unit-testable.
 */

import { ModulePermissions, TeamRole } from "@/types";

export const FULL_PERMISSIONS: ModulePermissions = {
  invoices: { view: true, create: true, edit: true, delete: true },
  expenses: { view: true, create: true, approve: true, delete: true },
  vehicles: { view: true, manage: true, logExpenses: true },
  customers: { view: true, manage: true },
  reports: { view: true, export: true },
  settings: { view: true, edit: true },
};

export const NO_PERMISSIONS: ModulePermissions = {
  invoices: { view: false, create: false, edit: false, delete: false },
  expenses: { view: false, create: false, approve: false, delete: false },
  vehicles: { view: false, manage: false, logExpenses: false },
  customers: { view: false, manage: false },
  reports: { view: false, export: false },
  settings: { view: false, edit: false },
};

/**
 * Default (baseline) permissions granted to each role. These are the minimum
 * rights every member of that role receives out of the box and can be further
 * customised per member.
 */
export const PERMISSIONS_BY_ROLE: Record<TeamRole, ModulePermissions> = {
  Owner: FULL_PERMISSIONS,
  Manager: {
    invoices: { view: true, create: true, edit: true, delete: true },
    expenses: { view: true, create: true, approve: true, delete: true },
    vehicles: { view: true, manage: true, logExpenses: true },
    customers: { view: true, manage: true },
    reports: { view: true, export: true },
    settings: { view: true, edit: true },
  },
  Accountant: {
    invoices: { view: true, create: true, edit: true, delete: false },
    expenses: { view: true, create: true, approve: false, delete: false },
    vehicles: { view: true, manage: false, logExpenses: true },
    customers: { view: true, manage: false },
    reports: { view: true, export: true },
    settings: { view: true, edit: false },
  },
  Staff: {
    invoices: { view: true, create: true, edit: false, delete: false },
    expenses: { view: true, create: true, approve: false, delete: false },
    vehicles: { view: true, manage: false, logExpenses: true },
    customers: { view: true, manage: false },
    reports: { view: false, export: false },
    settings: { view: false, edit: false },
  },
};

/** Baseline permission set for a role (fall-back when a member has no custom set). */
export function getRolePermissions(role: TeamRole): ModulePermissions {
  return PERMISSIONS_BY_ROLE[role] ?? NO_PERMISSIONS;
}

/**
 * Effective permissions for a member, preferring the member's own stored set
 * and falling back to the role baseline when none is provided.
 */
export function effectivePermissions(
  role: TeamRole,
  custom?: Partial<ModulePermissions> | ModulePermissions
): ModulePermissions {
  const base = getRolePermissions(role);
  if (!custom) return base;
  return mergePermissions(base, custom);
}

export function mergePermissions(
  base: ModulePermissions,
  override: Partial<ModulePermissions>
): ModulePermissions {
  return {
    invoices: { ...base.invoices, ...(override.invoices ?? {}) },
    expenses: { ...base.expenses, ...(override.expenses ?? {}) },
    vehicles: { ...base.vehicles, ...(override.vehicles ?? {}) },
    customers: { ...base.customers, ...(override.customers ?? {}) },
    reports: { ...base.reports, ...(override.reports ?? {}) },
    settings: { ...base.settings, ...(override.settings ?? {}) },
  };
}

export type PermissionModule = keyof ModulePermissions;
export type ModuleAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "manage"
  | "logExpenses"
  | "export";

/** Boolean helper used as a guard in components, route logic and handlers. */
export function canPerform(
  perms: ModulePermissions,
  module: PermissionModule,
  action: ModuleAction
): boolean {
  return Boolean(perms[module]?.[action as keyof ModulePermissions[PermissionModule]]);
}

/**
 * Map an app route path to the module + "view" permission that gates it.
 * Routes not listed here are considered universally viewable (e.g. dashboard,
 * pricing, directory) and pass the check by default.
 */
const ROUTE_GATE: Record<string, { module: PermissionModule; action: ModuleAction }> = {
  "/customers": { module: "customers", action: "view" },
  "/products": { module: "invoices", action: "view" },
  "/invoices": { module: "invoices", action: "view" },
  "/quotations": { module: "invoices", action: "view" },
  "/estimates": { module: "invoices", action: "view" },
  "/purchase-orders": { module: "invoices", action: "view" },
  "/expenses": { module: "expenses", action: "view" },
  "/vehicles": { module: "vehicles", action: "view" },
  "/reports": { module: "reports", action: "view" },
  "/settings": { module: "settings", action: "view" },
};

/** Route guard — returns true when the route is visible to the given perms. */
export function canAccessRoute(perms: ModulePermissions, path: string): boolean {
  const seg = "/" + (path.split("/")[1] || "");
  const gate = ROUTE_GATE[seg];
  if (!gate) return true;
  return canPerform(perms, gate.module, gate.action);
}

/** Filter a list of nav {href} entries down to those the perms may access. */
export function filterRoutes(
  perms: ModulePermissions,
  items: { href: string }[]
): { href: string }[] {
  return items.filter((item) => canAccessRoute(perms, item.href));
}

/** The Owner identity in this frontend-only build always has full access. */
export const OWNER_PERMISSIONS: ModulePermissions = FULL_PERMISSIONS;