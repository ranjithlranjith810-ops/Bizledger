"use client";

import React, { useEffect, useRef } from "react";
import {
  DocumentKind,
  documentKindLabel,
  markLearningSeen,
} from "@/lib/document-experience";
import { DocumentSampleViewer } from "@/components/documents/DocumentSampleViewer";
import { DocumentLearningGuide } from "@/components/documents/DocumentLearningGuide";
import { X, Sparkles } from "lucide-react";

interface DocumentExperienceModalProps {
  kind: DocumentKind;
  onClose: () => void;
}

/**
 * "View sample & learn": a two-column modal (sample PDF preview + first-time
 * guide). Both panels use keyboard-accessible buttons and the dialog traps
 * focus/restores it on close. Completing (or skipping) the tour persists the
 * seen-state via markLearningSeen so it is offered again only on demand.
 */
export const DocumentExperienceModal: React.FC<DocumentExperienceModalProps> = ({
  kind,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    lastFocused.current = document.activeElement;
    const node = dialogRef.current;
    node?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (lastFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const completeTour = () => markLearningSeen(kind);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-experience-title"
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="document-experience-title"
                className="text-base font-bold text-[#191c1e]"
              >
                View a sample {documentKindLabel(kind)}
              </h3>
              <p className="text-xs text-gray-500">
                See exactly what a real {documentKindLabel(kind).toLowerCase()}{" "}
                looks like before you create one — this sample is not saved and
                has no legal effect.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sample viewer"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          <DocumentSampleViewer kind={kind} height={440} />
          <div className="bg-[#f7f9fb] border border-[#eceef0] rounded-xl overflow-hidden flex flex-col">
            <DocumentLearningGuide
              kind={kind}
              onClose={onClose}
              onComplete={completeTour}
            />
          </div>
        </div>
      </div>
    </div>
  );
};