"use client";

import React from "react";
import {
  DocumentKind,
  documentImmutabilityWarning,
  documentKindLabel,
} from "@/lib/document-experience";
import { Lock, PencilLine } from "lucide-react";

interface DocumentImmutabilityWarningProps {
  kind: DocumentKind;
  /** Stack the editable/locked lists in one column instead of two. Used inside
   *  the narrow final-confirmation dialog, where a two-column grid would cramp
   *  the longer labels. */
  stacked?: boolean;
}

/**
 * The immutable-fields notice: which values stay editable once the document
 * exists, and which are locked for good.
 *
 * This is a calm advisory, not an error. It is rendered in the FINAL
 * confirmation step immediately before the create request is sent, so the
 * create form itself stays clean. Styling is deliberately advisory (amber on a
 * light surface, neutral locked column) rather than a red error panel — the
 * outcome it describes is a normal, expected part of creating a financial
 * document.
 */
export const DocumentImmutabilityWarning: React.FC<
  DocumentImmutabilityWarningProps
> = ({ kind, stacked = false }) => {
  const copy = documentImmutabilityWarning(kind);
  return (
    <section
      role="note"
      aria-label={`${documentKindLabel(kind)} immutability warning`}
      className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3.5"
    >
      <div className="flex items-start gap-2.5">
        <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-amber-900">{copy.heading}</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-900/85">
            {copy.message}
          </p>

          <div
            className={
              stacked
                ? "mt-3 grid grid-cols-1 gap-2.5"
                : "mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            }
          >
            <div className="rounded-lg border border-amber-200/70 bg-white/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                <PencilLine aria-hidden="true" className="h-3 w-3" />
                Editable after creation
              </p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-amber-900/85">
                {copy.canEdit.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span aria-hidden="true" className="text-emerald-700">
                      &#10003;
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-amber-200/70 bg-white/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                <Lock aria-hidden="true" className="h-3 w-3" />
                Locked after creation
              </p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-amber-900/85">
                {copy.cannotEdit.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span aria-hidden="true" className="text-amber-700/70">
                      &#8212;
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
