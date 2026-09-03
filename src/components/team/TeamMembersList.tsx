"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { TeamMember, TeamRole } from "@/types";
import {
  Users,
  Plus,
  Search,
  Mail,
  CheckCircle2,
  Clock,
  Trash2,
  Send,
} from "lucide-react";

export const TeamMembersList: React.FC = () => {
  const { teamMembers, deleteTeamMember, setOpenModal, addNotification } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("All");

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.designation.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === "All" || m.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [teamMembers, searchQuery, roleFilter]);

  const totalCount = teamMembers.length;
  const activeCount = teamMembers.filter((m) => m.status === "Active").length;
  const pendingCount = teamMembers.filter((m) => m.status === "Pending Invitation").length;

  const getRoleBadgeClass = (role: TeamRole) => {
    switch (role) {
      case "Owner":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Manager":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Accountant":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Staff":
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const handleResendInvite = (member: TeamMember) => {
    addNotification({
      type: "success",
      title: "Invitation Resent",
      message: `A fresh login link was dispatched to ${member.email}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Team Members & Access</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your staff, accountants, branch managers, and their granular module permissions.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            id="btn-add-team-member"
            onClick={() => setOpenModal("add-team-member")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (Stitch Design #2) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Team Members</span>
            <div className="w-8 h-8 rounded-lg bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">{totalCount}</span>
            <span className="text-xs text-gray-400">/ 10 seats (Pro Plan)</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            4 remaining seats available
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Active Accounts</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700 font-mono">{activeCount}</span>
            <span className="text-xs text-emerald-600 font-medium">Logged in</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-medium">
            2FA Security enforced
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Pending Invitations</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-700 font-mono">{pendingCount}</span>
            <span className="text-xs text-amber-600">awaiting acceptance</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium">
            Statutory auditor invite
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search member by name, email, or designation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
          {["All", "Owner", "Manager", "Accountant", "Staff"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                roleFilter === r
                  ? "bg-[#93000b] text-white shadow-xs"
                  : "bg-[#f2f4f6] text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Team Table (Stitch Design #2) */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Member Name & Profile</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Permissions Matrix</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-[#f7f9fb] transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-9 h-9 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-rose-100 text-[#93000b] flex items-center justify-center font-bold text-xs">
                          {member.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span>{member.name}</span>
                          {member.role === "Owner" && (
                            <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">
                              Owner
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <span>{member.email}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-medium">
                          {member.designation}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border ${getRoleBadgeClass(
                        member.role
                      )}`}
                    >
                      {member.role}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1 flex-wrap max-w-xs">
                      {member.permissions.invoices.create && (
                        <span className="bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded font-mono">
                          Invoices
                        </span>
                      )}
                      {member.permissions.expenses.approve && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-mono">
                          Approve Exp
                        </span>
                      )}
                      {member.permissions.vehicles.manage && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded font-mono">
                          Fleet
                        </span>
                      )}
                      {member.permissions.reports.export && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-mono">
                          GST Reports
                        </span>
                      )}
                      {member.permissions.settings.edit && (
                        <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-mono">
                          Admin Settings
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {member.status === "Active" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        Pending Invite
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">
                    {member.lastActive}
                  </td>

                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      {member.status === "Pending Invitation" ? (
                        <button
                          onClick={() => handleResendInvite(member)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors border border-amber-200"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Resend Invite</span>
                        </button>
                      ) : (
                        member.role !== "Owner" && (
                          <button
                            onClick={() => deleteTeamMember(member.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Revoke Member Access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
