"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { matchesSearch } from "@/lib/search";
import { Customer } from "@/types";
import { Search, Plus, Trash2, Pencil } from "lucide-react";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";

export const CustomersListView: React.FC = () => {
  const { customers, setOpenModal, confirmDelete } = useApp();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);

  const filtered = customers.filter((c) =>
    matchesSearch(search, [c.name, c.gstin, c.billingAddress?.city])
  );

  const totalOutstanding = customers.reduce((acc, c) => acc + c.outstandingBalance, 0);
  const totalBilled = customers.reduce((acc, c) => acc + c.totalSales, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Customer Accounts & Ledgers</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Maintain customer GSTIN profiles, billing ledgers, credit terms, and payment histories.
          </p>
        </div>
        <button
          onClick={() => setOpenModal("add-customer")}
          className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-xs font-medium text-gray-500">Total Registered Clients</span>
          <div className="text-2xl font-bold font-mono text-gray-900 mt-1">{customers.length}</div>
          <div className="text-[11px] text-gray-400 mt-1">Active trading accounts</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-xs font-medium text-gray-500">Total Outstanding Receivables</span>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
            ₹{totalOutstanding.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">Across {customers.length} accounts</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-xs font-medium text-gray-500">Cumulative Billed Turnover</span>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            ₹{totalBilled.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">100% GST compliant</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, GSTIN, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Customer Name & Contact</th>
                <th className="py-3 px-4">GSTIN / Tax ID</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Total Billed (₹)</th>
                <th className="py-3 px-4 text-right">Outstanding (₹)</th>
                <th className="py-3 px-4">Credit Terms</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    {customers.length === 0
                      ? "No customers yet — add your first."
                      : "No customers match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f7f9fb] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{c.name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                        <span>{c.primaryContact.mobile}</span>
                        <span>•</span>
                        <span>{c.primaryContact.email}</span>
                      </div>
                    </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-gray-800">{c.gstin || "-"}</td>
                  <td className="py-3.5 px-4 text-gray-600">
                    {c.billingAddress.city}, {c.billingAddress.state}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900">
                    ₹{c.totalSales.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">
                    {c.outstandingBalance > 0 ? (
                      <span className="text-amber-700">₹{c.outstandingBalance.toLocaleString('en-IN')}</span>
                    ) : (
                      <span className="text-emerald-700">₹0.00</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded font-medium">
                      {c.paymentTerms}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(c)}
                        className="p-1.5 text-gray-400 hover:text-[#166534] hover:bg-[#f0fdf4] rounded-lg transition-colors"
                        title="Edit customer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          confirmDelete({ kind: "customer", id: c.id, name: c.name })
                        }
                        className="p-1.5 text-gray-400 hover:text-[#93000b] hover:bg-[#fef2f2] rounded-lg transition-colors"
                        title="Delete customer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <AddCustomerModal customer={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
};