"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Product } from "@/types";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { validateHsnSAC } from "@/lib/validation";
import { X, PackagePlus, Check, Edit3 } from "lucide-react";

interface AddProductModalProps {
  product?: Product | null;
  onClose?: () => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  product,
  onClose,
}) => {
  const { addProduct, updateProduct, setOpenModal, products } = useApp();
  const isEdit = !!product;

  // If an existing product's category is not a built-in category (i.e. it was
  // saved from the "Other" choice as a custom category), pre-fill the Custom
  // Category input so the value round-trips on edit instead of being lost.
  const initialCustom =
    product?.category &&
    !(PRODUCT_CATEGORIES as readonly string[]).includes(product.category)
      ? product.category
      : "";

  const [name, setName] = useState<string>(product?.name || "");
  const [sku, setSku] = useState<string>(product?.sku || "");
  const [category, setCategory] = useState<string>(product?.category || "");
  const [customCategory, setCustomCategory] = useState<string>(initialCustom);
  const [unit, setUnit] = useState<string>(product?.unit || "Pcs");
  const [unitPrice, setUnitPrice] = useState<string>(
    product ? String(product.unitPrice || 0) : ""
  );
  const [stockQuantity, setStockQuantity] = useState<string>(
    product ? String(product.stockQuantity || 0) : ""
  );
  const [hsnSac, setHsnSac] = useState<string>(product?.hsnSac || "");
  const [hsnError, setHsnError] = useState<string | null>(null);
  const [gstRate, setGstRate] = useState<number>(product?.gstRate ?? 18);

  const close = () => {
    if (onClose) onClose();
    else setOpenModal(null);
  };

  const isOther = category === "Other" || !PRODUCT_CATEGORIES.includes(category as (typeof PRODUCT_CATEGORIES)[number]);
  const resolvedCategory = isOther && customCategory.trim() ? customCategory.trim() : category;

  // HSN/SAC is validated but NEVER guessed/inferred/generated. The business is
  // responsible for providing the correct code; we only format-validate + store
  // what the user enters and remind them to verify it.
  const validateHsn = (): boolean => {
    const msg = validateHsnSAC().validate(hsnSac);
    setHsnError(msg);
    return msg == null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isOther && !customCategory.trim()) return;
    if (!validateHsn()) return;

    const payload: Omit<Product, "id"> = {
      name: name.trim(),
      sku:
        sku.trim() ||
        `SKU-${Date.now().toString().slice(-6)}`.toUpperCase(),
      category: resolvedCategory || "General",
      unit,
      unitPrice: parseFloat(unitPrice) || 0,
      stockQuantity: parseInt(stockQuantity, 10) || 0,
      hsnSac: hsnSac.trim().toUpperCase(),
      gstRate,
    };

    if (isEdit && product) {
      updateProduct({ ...payload, id: product.id });
    } else {
      addProduct(payload);
    }
    close();
  };

  const categoryOptions = Array.from(
    new Set([...PRODUCT_CATEGORIES, ...(product?.category ? [product.category] : [])])
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              {isEdit ? <Edit3 className="w-5 h-5" /> : <PackagePlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">
                {isEdit ? "Edit Product" : "Add New Product"}
              </h3>
              <p className="text-xs text-gray-500">
                Add an SKU with HSN/SAC code, GST rate, and warehouse stock level
              </p>
            </div>
          </div>
          <button
            onClick={close}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0]">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Galvanised Iron Sheet 1mm"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-semibold text-gray-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                SKU Code
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="GI-SHT-1MM"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="">Select category...</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {isOther && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-gray-700 mb-1">
                  Specify Category <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Fabricated Sections"
                  className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-medium"
                />
              </div>
            )}

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="Pcs">Pcs</option>
                <option value="Meters">Meters</option>
                <option value="Kg">Kg</option>
                <option value="Ltr">Ltr</option>
                <option value="Box">Box</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                HSN / SAC Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={hsnSac}
                onChange={(e) => {
                  setHsnSac(e.target.value.trim().toUpperCase());
                  if (hsnError) setHsnError(null);
                }}
                placeholder="Enter HSN code"
                className={`w-full py-2 px-3 bg-white border rounded-lg outline-none font-mono ${
                  hsnError
                    ? "border-rose-500"
                    : "border-[#eceef0] focus:border-[#93000b]"
                }`}
              />
              {hsnError ? (
                <p className="text-[11px] text-rose-600 mt-1">{hsnError}</p>
              ) : (
                <p className="text-[11px] text-amber-600 mt-1">
                  Please check your HSN/SAC properly before saving.
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                GST Rate (%)
              </label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Unit Price (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="e.g. 120"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Warehouse Stock
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="0"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
              />
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Tip: A total of {products.length} active SKUs are currently in the catalog.
          </p>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={close}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 px-5 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isOther && !customCategory.trim()}
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>{isEdit ? "Save Changes" : "Add Product"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
