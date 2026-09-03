"use client";

import React from "react";
import { useApp } from "@/context/AppContext";

const ENTITY_LABELS: Record<string, string> = {
  product: "Product",
  customer: "Customer",
  invoice: "Invoice",
  expense: "Expense",
  vehicle: "Vehicle",
  team: "Team Member",
  quotation: "Quotation",
  estimate: "Estimate",
  purchaseOrder: "Purchase Order",
};

export const DeleteConfirmModal: React.FC = () => {
  const { deleteConfirm, setDeleteConfirm, performDelete } = useApp();

  if (!deleteConfirm) return null;

  const entityLabel = ENTITY_LABELS[deleteConfirm.kind] || "Item";

  return (
    <div className="fixed inset-0 bg-on-surface/40 z-50 backdrop-blur-xs flex items-center justify-center p-lg animate-[fadeIn_0.15s_ease-out]">
      <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-surface-variant overflow-hidden">
        {/* Modal Header */}
        <div className="p-lg border-b border-surface-variant flex items-start justify-between">
          <div className="flex items-center gap-md">
            <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-error shrink-0">
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                warning
              </span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Delete {entityLabel}?</h2>
          </div>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="text-on-surface-variant hover:bg-surface-container p-xs rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-lg">
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed text-sm">
            Are you sure you want to delete <span className="font-bold text-on-surface">&apos;{deleteConfirm.name}&apos;</span>? This action cannot be undone and will remove it completely.
          </p>
          <div className="mt-md p-md bg-surface-container-low rounded border border-surface-variant text-body-sm text-on-surface-variant flex gap-sm items-start text-xs">
            <span className="material-symbols-outlined text-[18px] text-tertiary mt-[2px] shrink-0">info</span>
            <p>Associated invoices or purchase orders may be affected by removing this {entityLabel.toLowerCase()}. Consider archiving it instead if historical data is needed.</p>
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="p-md bg-surface-container-lowest border-t border-surface-variant flex justify-end gap-md">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-lg py-sm rounded border border-surface-variant font-body-md text-body-md font-medium text-on-surface hover:bg-surface-container-low transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => performDelete(deleteConfirm)}
            className="px-lg py-sm rounded bg-error text-on-error font-body-md text-body-md font-medium hover:opacity-90 shadow-sm transition-opacity flex items-center gap-xs text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span> Delete
          </button>
        </div>
      </div>
    </div>
  );
};