"use client";

import React from "react";
import { Product, PricingMode } from "@/types";
import {
  calculateInvoiceTotals,
  calculateLineTotals,
  InvoiceLineInput,
} from "@/lib/invoice";
import { Plus, Trash2, PackageSearch } from "lucide-react";
import { SearchablePicker } from "@/components/invoices/SearchablePicker";

export interface DocLineDraft {
  id: string;
  productId?: string;
  description: string;
  hsnSac: string;
  quantity: number;
  unit: string;
  unitPrice: number; // per-unit price entered (mode-aware incl./excl. GST)
  gstRate: number;
}

export interface TotalsLabels {
  subtotal: string;
  subtotalHighlight?: boolean;
  cgst: string;
  sgst: string;
  total: string;
}

interface LineItemsEditorProps {
  lines: DocLineDraft[];
  onChange: (lines: DocLineDraft[]) => void;
  products: Product[];
  onOpenAddProduct?: () => void;
  rateLabel?: string;
  addItemLabel?: string;
  totalsLabel: TotalsLabels;
  approximate?: boolean;
  pricingMode?: PricingMode;
}

export function LineItemsEditor({
  lines,
  onChange,
  products,
  onOpenAddProduct,
  rateLabel,
  addItemLabel = "Add Item",
  totalsLabel,
  approximate = false,
  pricingMode = "inclusive",
}: LineItemsEditorProps) {
  const resolvedRateLabel =
    rateLabel ??
    (pricingMode === "exclusive"
      ? "Rate (₹, excl. GST)"
      : "Rate (₹, incl. GST)");
  const addProductLine = (prod: Product) => {
    onChange([
      ...lines,
      {
        id: `item-${Date.now()}-${lines.length}`,
        productId: prod.id,
        description: prod.name,
        hsnSac: prod.hsnSac,
        quantity: 1,
        unit: prod.unit || "Pcs",
        unitPrice: prod.unitPrice,
        gstRate: prod.gstRate,
      },
    ]);
  };

  const addCustomLine = () => {
    onChange([
      ...lines,
      {
        id: `item-${Date.now()}-${lines.length}`,
        description: "",
        hsnSac: "",
        quantity: 1,
        unit: "Pcs",
        unitPrice: 0,
        gstRate: 18,
      },
    ]);
  };

  const handleLineChange = (
    index: number,
    field: keyof DocLineDraft,
    value: string | number
  ) => {
    onChange(
      lines.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const removeLine = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
  };

  const totals = calculateInvoiceTotals(
    lines.map((it): InvoiceLineInput => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      gstRate: it.gstRate,
    })),
    pricingMode
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-[#191c1e] uppercase tracking-wider text-xs">
          Line Items &amp; Materials
        </h4>
        <button
          type="button"
          onClick={addCustomLine}
          className="text-xs text-[#93000b] hover:bg-rose-50 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 border border-rose-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{addItemLabel}</span>
        </button>
      </div>

      {/* ONE main product search area */}
      <div className="bg-[#f7f9fb] border border-[#eceef0] rounded-xl p-3">
        <label className="block font-semibold text-gray-700 mb-1.5">
          Search product to add
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <SearchablePicker
              items={products}
              value=""
              onSelect={(id) => {
                const prod = products.find((p) => p.id === id);
                if (prod) addProductLine(prod);
              }}
              getLabel={(p) => p.name}
              getSub={(p) =>
                `SKU: ${p.sku} · ₹${p.unitPrice}/${p.unit} · GST ${p.gstRate}%`
              }
              searchText={(p) =>
                `${p.name} ${p.sku} ${p.hsnSac} ${p.category}`
              }
              placeholder={
                pricingMode === "exclusive"
                  ? "Search products... (prices are GST-exclusive)"
                  : "Search products... (prices are GST-inclusive)"
              }
              emptyText="No products found. Add a product first."
              emptyActionLabel="Add Product"
              onEmptyAction={onOpenAddProduct}
            />
          </div>
          <button
            type="button"
            onClick={addCustomLine}
            className="shrink-0 text-xs text-[#93000b] hover:bg-rose-50 px-3 py-2 rounded-lg font-semibold border border-rose-200 transition-colors"
          >
            + Custom Item
          </button>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="border border-dashed border-[#eceef0] rounded-xl p-6 text-center text-gray-400">
          <PackageSearch className="w-6 h-6 mx-auto mb-1.5 text-gray-300" />
          No items yet. Add a product or a custom line item above.
        </div>
      ) : (
        <div className="border border-[#eceef0] rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-600 font-semibold text-[11px] uppercase">
              <tr>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3">HSN Code</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3">Unit</th>
                <th className="py-2.5 px-3 text-right">{resolvedRateLabel}</th>
                <th className="py-2.5 px-3 text-right">GST %</th>
                <th className="py-2.5 px-3 text-right">Total (₹)</th>
                <th className="py-2.5 px-2 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {lines.map((it, idx) => {
                const line = calculateLineTotals(
                  {
                    quantity: it.quantity,
                    unitPrice: it.unitPrice,
                    gstRate: it.gstRate,
                  },
                  pricingMode
                );
                return (
                  <tr key={it.id} className="bg-white">
                    <td className="py-2 px-3 min-w-52">
                      <input
                        type="text"
                        value={it.description}
                        onChange={(e) =>
                          handleLineChange(idx, "description", e.target.value)
                        }
                        placeholder="Item description"
                        className="w-full py-1 px-2 bg-white border border-[#eceef0] rounded text-[11px] outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 w-28">
                      <input
                        type="text"
                        value={it.hsnSac}
                        onChange={(e) =>
                          handleLineChange(idx, "hsnSac", e.target.value)
                        }
                        className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs font-mono outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 w-20 text-right">
                      <input
                        type="number"
                        min="0"
                        value={it.quantity}
                        onChange={(e) =>
                          handleLineChange(
                            idx,
                            "quantity",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs text-right font-mono font-bold outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 w-20">
                      <input
                        type="text"
                        value={it.unit}
                        onChange={(e) => handleLineChange(idx, "unit", e.target.value)}
                        className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 w-28 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={(e) =>
                          handleLineChange(
                            idx,
                            "unitPrice",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs text-right font-mono font-bold outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 w-24 text-right">
                      <select
                        value={it.gstRate}
                        onChange={(e) =>
                          handleLineChange(
                            idx,
                            "gstRate",
                            parseInt(e.target.value) || 0
                          )
                        }
                        className="w-full py-1.5 px-2 bg-[#f7f9fb] border border-[#eceef0] rounded text-xs outline-none font-mono"
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                      ₹{line.totalAmount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-gray-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals summary */}
      <div className="flex flex-col sm:flex-row justify-end">
        <div className="sm:w-80 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">{totalsLabel.subtotal}</span>
            <span className="font-mono font-semibold">
              ₹{totals.subtotal.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{totalsLabel.cgst}:</span>
            <span className="font-mono font-semibold">
              ₹{totals.cgst.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{totalsLabel.sgst}:</span>
            <span className="font-mono font-semibold">
              ₹{totals.sgst.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-200">
            <span className="font-bold text-[#93000b]">{totalsLabel.total}</span>
            <span className="font-mono font-bold text-[#93000b] text-base">
              ₹{totals.grandTotal.toLocaleString("en-IN")}
            </span>
          </div>
          {approximate && (
            <div className="pt-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Estimated / Approximate Amount
            </div>
          )}
        </div>
      </div>
    </div>
  );
}