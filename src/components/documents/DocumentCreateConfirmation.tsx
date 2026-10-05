"use client";

import React, { useEffect, useRef } from "react";
import {
  DocumentKind,
  documentCreateConfirmation,
  documentKindLabel,
} from "@/lib/document-experience";
import { FileCheck2, X } from "lucide-react";

export interface CreateConfirmationSummary {
  number: string;
  customer: string;
  itemCount: number;
  total: number;
  /** Optionally explain a pending target detail (e.g. "for FY 2026-27"). */
  note?: string;
}

interface DocumentCreateConfirmationProps {
  kind: DocumentKind;
  summary: CreateConfirmationSummary;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Extra detail rendered between the summary and the action row. Each create
   *  flow passes its own immutability notice here so the warning is read at the
   *  moment of commitment instead of cluttering the create form. */
  children?: React.ReactNode;
}

/**
 * The final confirmation shown AFTER client-side validation and BEFORE any API
 * call. This is where the immutability notice lives: the create form itself
 * stays clean, and the user reads "what is locked" at the moment they are about
 * to commit a permanent financial record.
 *
 * The presentation is a calm document confirmation — advisory amber for the
 * caution, neutral slate for the summary — not a red error panel, because
 * creating the document is the expected outcome rather than a failure. Cancel
 * leaves the form untouched and sends nothing; Confirm proceeds to the create
 * request. Focus trap/restore + Escape→cancel match the modal conventions used
 * across the app.
 */
export const DocumentCreateConfirmation: React.FC<
  DocumentCreateConfirmationProps
> = ({ kind, summary, isSubmitting, onCancel, onConfirm, children }) => {
  const copy = documentCreateConfirmation(kind);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    lastFocused.current = document.activeElement;
    dialogRef.current?.focus();
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (lastFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [isSubmitting, onCancel]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-confirm-title"
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container text-secondary flex items-center justify-center">
              <FileCheck2 aria-hidden="true" className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="document-confirm-title"
                className="text-base font-bold text-[#191c1e]"
              >
                {copy.heading}
              </h3>
              <p className="text-xs text-gray-500">
                Final confirmation before anything is created.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close confirmation dialog"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-gray-600 leading-relaxed">{copy.message}</p>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-900">
            {copy.important}
          </div>

          <div className="rounded-xl border border-[#eceef0] bg-[#f7f9fb] p-4 space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">{documentKindLabel(kind)} Number</span>
              <span className="font-mono font-bold text-gray-900 break-all text-right">
                {summary.number}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">
                {kind === "purchaseOrder" ? "Vendor" : "Customer"}
              </span>
              <span className="font-semibold text-gray-900 text-right">
                {summary.customer}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Line items</span>
              <span className="font-semibold text-gray-900">
                {summary.itemCount}
              </span>
            </div>
            <div className="flex justify-between gap-2 pt-1 border-t border-gray-200">
              <span className="text-gray-500">Total incl. GST</span>
              <span className="font-mono font-bold text-[#93000b] text-sm">
                &#8377;{summary.total.toLocaleString("en-IN")}
              </span>
            </div>
            {summary.note && (
              <p className="text-[11px] text-gray-500 pt-1">{summary.note}</p>
            )}
          </div>

          {children}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-[#d8dcdf] text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Creating…" : copy.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};