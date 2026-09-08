"use client";

import { http } from "@/lib/api-client";
import type { TeamMember, TeamRole, ModulePermissions } from "@/types";

export type TeamRoleWire = "OWNER" | "ADMIN" | "MANAGER" | "STAFF";

// Frontend display labels -> canonical DB roles (and back).
export const ROLE_TO_DB: Record<TeamRole, TeamRoleWire> = {
  Owner: "OWNER",
  Manager: "MANAGER",
  Accountant: "ADMIN",
  Staff: "STAFF",
};
export const DB_TO_ROLE: Record<TeamRoleWire, TeamRole> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ADMIN: "Accountant",
  STAFF: "Staff",
};

export interface TeamInviteInput {
  name: string;
  email: string;
  role: TeamRoleWire;
  designation?: string;
  phone?: string;
  permissions?: Partial<ModulePermissions>;
}

export interface TeamMemberBackendJson {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  phone: string | null;
  designation: string | null;
  role: string;
  status: string;
  permissions: ModulePermissions;
  lastActive: string | null;
  joinedDate: string;
}

/** Frontend TeamMember -> invite payload. */
export function toBackendInput(
  member: Pick<TeamMember, "name" | "email" | "role"> & {
    phone?: string;
    designation?: string;
    permissions?: Partial<ModulePermissions>;
  },
): TeamInviteInput {
  return {
    name: member.name,
    email: member.email,
    role: ROLE_TO_DB[member.role] ?? "STAFF",
    designation: member.designation || undefined,
    phone: member.phone || undefined,
    permissions: member.permissions || undefined,
  };
}

/** Backend member json -> frontend TeamMember. */
export function fromBackendMember(m: TeamMemberBackendJson): TeamMember {
  const role = DB_TO_ROLE[(m.role as TeamRoleWire) ?? "STAFF"] ?? "Staff";
  const statusMap: Record<string, TeamMember["status"]> = {
    ACTIVE: "Active",
    INVITED: "Pending Invitation",
    SUSPENDED: "Inactive",
    Active: "Active",
    "Pending Invitation": "Pending Invitation",
    Suspended: "Inactive",
    Inactive: "Inactive",
  };
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone ?? "",
    designation: m.designation ?? "",
    avatar: m.avatar ?? undefined,
    role,
    status: statusMap[m.status] ?? "Inactive",
    permissions: m.permissions,
    lastActive: m.lastActive ?? "Never (Invitation sent)",
    joinedDate: m.joinedDate,
  };
}

export const teamApi = {
  list: (businessId: string) =>
    http.get<{ members: TeamMemberBackendJson[] }>("/api/team", { businessId }),
  invite: (businessId: string, input: TeamInviteInput) =>
    http.post<{ member: TeamMemberBackendJson }>("/api/team/invite", input, { businessId }),
  remove: (businessId: string, memberId: string) =>
    http.del<{ id: string }>(`/api/team/${memberId}`, { businessId }),
};