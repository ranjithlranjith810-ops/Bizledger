"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { TeamRole, ModulePermissions } from "@/types";
import { X, Users, Shield, Check, User, Sliders } from "lucide-react";

const asPermRecord = (p: unknown): Record<string, boolean> =>
  (p as Record<string, boolean>) || {};

export const AddTeamMemberModal: React.FC = () => {
  const { addTeamMember, setOpenModal } = useApp();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [designation, setDesignation] = useState("");
  const [role, setRole] = useState<TeamRole>("Staff");

  const [permissions, setPermissions] = useState<ModulePermissions>({
    invoices: { view: true, create: true, edit: false, delete: false },
    expenses: { view: true, create: true, approve: false, delete: false },
    vehicles: { view: true, manage: false, logExpenses: true },
    customers: { view: true, manage: false },
    reports: { view: false, export: false },
    settings: { view: false, edit: false },
  });

  const handleRoleChange = (newRole: TeamRole) => {
    setRole(newRole);
    if (newRole === "Owner") {
      setPermissions({
        invoices: { view: true, create: true, edit: true, delete: true },
        expenses: { view: true, create: true, approve: true, delete: true },
        vehicles: { view: true, manage: true, logExpenses: true },
        customers: { view: true, manage: true },
        reports: { view: true, export: true },
        settings: { view: true, edit: true },
      });
    } else if (newRole === "Manager") {
      setPermissions({
        invoices: { view: true, create: true, edit: true, delete: false },
        expenses: { view: true, create: true, approve: true, delete: false },
        vehicles: { view: true, manage: true, logExpenses: true },
        customers: { view: true, manage: true },
        reports: { view: true, export: true },
        settings: { view: true, edit: false },
      });
    } else if (newRole === "Accountant") {
      setPermissions({
        invoices: { view: true, create: true, edit: true, delete: false },
        expenses: { view: true, create: true, approve: true, delete: false },
        vehicles: { view: true, manage: false, logExpenses: true },
        customers: { view: true, manage: true },
        reports: { view: true, export: true },
        settings: { view: true, edit: false },
      });
    } else {
      setPermissions({
        invoices: { view: true, create: true, edit: false, delete: false },
        expenses: { view: true, create: true, approve: false, delete: false },
        vehicles: { view: true, manage: false, logExpenses: true },
        customers: { view: true, manage: false },
        reports: { view: false, export: false },
        settings: { view: false, edit: false },
      });
    }
  };

  const togglePermission = (module: keyof ModulePermissions, action: string) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...asPermRecord(prev[module]),
        [action]: !asPermRecord(prev[module])[action],
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    addTeamMember({
      name,
      email,
      phone,
      designation: designation || `${role} Member`,
      role,
      status: "Pending Invitation",
      permissions,
    });

    setOpenModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">Invite Team Member</h3>
              <p className="text-xs text-gray-500">Assign role access, module permissions, and dispatch email invite</p>
            </div>
          </div>
          <button
            onClick={() => setOpenModal(null)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* 1. Personal Details (Stitch Design #10) */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
              <User className="w-4 h-4 text-[#93000b]" />
              <span>1. Personal & Contact Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Anand Kumar"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Email Address (Login ID) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. anand.k@bizledger.io"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98400 12345"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Designation / Department
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Warehouse & Billing Supervisor"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Role Selection (Stitch Design #10) */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
              <Shield className="w-4 h-4 text-[#93000b]" />
              <span>2. Select Primary Role</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: "Staff",
                  title: "Staff / Operator",
                  desc: "Create invoices, log vehicle fuel & submit bills.",
                },
                {
                  id: "Accountant",
                  title: "Accountant",
                  desc: "Manage ledgers, approve expenses, download GST reports.",
                },
                {
                  id: "Manager",
                  title: "Branch Manager",
                  desc: "Full operations, fleet, customers & team management.",
                },
                {
                  id: "Owner",
                  title: "Admin / Owner",
                  desc: "Unrestricted control over billing, taxes & company settings.",
                },
              ].map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleRoleChange(r.id as TeamRole)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    role === r.id
                      ? "bg-white border-[#93000b] shadow-xs ring-1 ring-[#93000b]"
                      : "bg-white border-[#eceef0] hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-gray-900">{r.title}</span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        role === r.id ? "border-[#93000b] bg-[#93000b] text-white" : "border-gray-300"
                      }`}
                    >
                      {role === r.id && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-tight">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Granular Module Permissions Toggle Matrix (Stitch Design #10) */}
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-[#93000b]" />
                <span>3. Granular Module Permissions Matrix</span>
              </div>
              <span className="text-[11px] text-gray-500">Fine-tune individual capabilities</span>
            </div>

            <div className="bg-white rounded-xl border border-[#eceef0] divide-y divide-[#eceef0] overflow-hidden">
              {/* Invoices */}
              <div className="p-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-gray-800">Sales & Invoicing</span>
                  <p className="text-[11px] text-gray-400">Generate GST invoices, apply discounts, and record payments</p>
                </div>
                <div className="flex items-center gap-3">
                  {["view", "create", "edit", "delete"].map((act) => (
                    <label key={act} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={asPermRecord(permissions.invoices)[act]}
                        onChange={() => togglePermission("invoices", act)}
                        className="rounded accent-[#93000b]"
                      />
                      <span className="capitalize text-gray-600 text-[11px]">{act}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Expenses */}
              <div className="p-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-gray-800">Expenses & Purchases</span>
                  <p className="text-[11px] text-gray-400">Raw materials, utility outlays, and voucher approvals</p>
                </div>
                <div className="flex items-center gap-3">
                  {["view", "create", "approve", "delete"].map((act) => (
                    <label key={act} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={asPermRecord(permissions.expenses)[act]}
                        onChange={() => togglePermission("expenses", act)}
                        className="rounded accent-[#93000b]"
                      />
                      <span className="capitalize text-gray-600 text-[11px]">{act}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Vehicles */}
              <div className="p-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-gray-800">Vehicles & Fleet</span>
                  <p className="text-[11px] text-gray-400">Vehicle profiles, maintenance schedules, and fuel logs</p>
                </div>
                <div className="flex items-center gap-3">
                  {["view", "manage", "logExpenses"].map((act) => (
                    <label key={act} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={asPermRecord(permissions.vehicles)[act]}
                        onChange={() => togglePermission("vehicles", act)}
                        className="rounded accent-[#93000b]"
                      />
                      <span className="capitalize text-gray-600 text-[11px]">{act}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Reports */}
              <div className="p-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-gray-800">Financial Reports & GST</span>
                  <p className="text-[11px] text-gray-400">P&L statements, GSTR-1 summaries, and tax exports</p>
                </div>
                <div className="flex items-center gap-3">
                  {["view", "export"].map((act) => (
                    <label key={act} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={asPermRecord(permissions.reports)[act]}
                        onChange={() => togglePermission("reports", act)}
                        className="rounded accent-[#93000b]"
                      />
                      <span className="capitalize text-gray-600 text-[11px]">{act}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Settings */}
              <div className="p-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold text-gray-800">Company Settings & Bank Info</span>
                  <p className="text-[11px] text-gray-400">GSTIN configuration, bank account numbers, and subscription</p>
                </div>
                <div className="flex items-center gap-3">
                  {["view", "edit"].map((act) => (
                    <label key={act} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={asPermRecord(permissions.settings)[act]}
                        onChange={() => togglePermission("settings", act)}
                        className="rounded accent-[#93000b]"
                      />
                      <span className="capitalize text-gray-600 text-[11px]">{act}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 px-5 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Send Invitation Email</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
