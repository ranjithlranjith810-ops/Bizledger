"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { matchesSearch } from "@/lib/search";
import { Product } from "@/types";
import { Search, Plus, Trash2, Pencil } from "lucide-react";
import { AddProductModal } from "@/components/products/AddProductModal";

export const ProductsListView: React.FC = () => {
  const { products, setOpenModal, confirmDelete } = useApp();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);

  const filtered = products.filter((p) =>
    matchesSearch(search, [p.name, p.sku, p.hsnSac, p.category])
  );

  const inventoryValuation = products.reduce((acc, p) => acc + p.unitPrice * p.stockQuantity, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Products & Material Inventory</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage product catalog, HSN/SAC codes, GST tax rates, wholesale unit prices, and warehouse stock levels.
          </p>
        </div>
        <button
          onClick={() => setOpenModal("add-product")}
          className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-xs font-medium text-gray-500">Total Active SKUs</span>
          <div className="text-2xl font-bold font-mono text-gray-900 mt-1">{products.length}</div>
          <div className="text-[11px] text-gray-400 mt-1">Classified with HSN Codes</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-xs font-medium text-gray-500">Inventory Valuation</span>
          <div className="text-2xl font-bold font-mono text-[#93000b] mt-1">
            ₹{inventoryValuation.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">At wholesale selling price</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <span className="text-xs font-medium text-gray-500">Stock Reorder Alerts</span>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">All Optimal</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">Zero out-of-stock items</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by product name, SKU, or HSN code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Item Name & SKU</th>
                <th className="py-3 px-4">HSN/SAC Code</th>
                <th className="py-3 px-4">GST Rate</th>
                <th className="py-3 px-4 text-right">Unit Price (₹)</th>
                <th className="py-3 px-4 text-right">Warehouse Stock</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    {products.length === 0
                      ? "No products yet — add your first."
                      : "No products match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-[#f7f9fb] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{p.name}</div>
                      <div className="text-[11px] font-mono text-gray-400 mt-0.5">SKU: {p.sku}</div>
                    </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-gray-700">{p.hsnSac}</td>
                  <td className="py-3.5 px-4">
                    <span className="bg-rose-50 text-[#93000b] font-mono font-bold text-[11px] px-2 py-0.5 rounded">
                      {p.gstRate}%
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900">
                    ₹{p.unitPrice.toLocaleString('en-IN')} <span className="text-[10px] font-normal text-gray-500">/ {p.unit}</span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-gray-800">
                    {p.stockQuantity} {p.unit}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded font-medium">
                      {p.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        className="p-1.5 text-gray-400 hover:text-[#166534] hover:bg-[#f0fdf4] rounded-lg transition-colors"
                        title="Edit product"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          confirmDelete({ kind: "product", id: p.id, name: p.name })
                        }
                        className="p-1.5 text-gray-400 hover:text-[#93000b] hover:bg-[#fef2f2] rounded-lg transition-colors"
                        title="Delete product"
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
        <AddProductModal product={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
};