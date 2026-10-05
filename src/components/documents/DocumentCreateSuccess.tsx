"use client";

import React from "react";
import {
  DocumentKind,
  documentKindLabel,
} from "@/lib/document-experience";
import { CheckCircle2, FileText, List, Eye } from "lucide-react";

export interface DocumentCreateSuccessProps {
  kind: DocumentKind;
  number: string;
  onViewPdf: () => void;
  onViewDocument: () => void;
  onGoToList: () => void;
  onClose: () => void;
}

/**
 * Success panel shown INSIDE the create modal after the server has confirmed
 * the persisted document. Provides: View PDF (rendered from the created
 * record), View <Document>, Go to <List>. Nothing is auto-downloaded.
 */
export const DocumentCreateSuccess: React.FC<DocumentCreateSuccessProps> = ({
  kind,
  number,
  onViewPdf,
  onViewDocument,
  onGoToList,
  onClose,
}) => {
  const label = documentKindLabel(kind);
  const noun = label.toLowerCase();
  return (
    <div className="p-10 flex flex-col items-center justify-center text-center space-y-5">
      <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
        <CheckCircle2 className="w-7 h-7" />
      </div>
      <div className="space-y-1">
        <h4 className="text-lg font-bold text-[#191c1e]">
          {label} Created
        </h4>
        <p className="text-sm text-gray-500">
          <span className="font-mono font-bold text-gray-800">{number}</span>{" "}
          was created and is now visible in {label}s.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onViewPdf}
          className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
        >
          <FileText className="w-4 h-4" />
          View PDF
        </button>
        <button
          type="button"
          onClick={onViewDocument}
          className="inline-flex items-center gap-1.5 bg-white border border-[#eceef0] hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors"
        >
          <Eye className="w-4 h-4" />
          View {label}
        </button>
        <button
          type="button"
          onClick={onGoToList}
          className="inline-flex items-center gap-1.5 bg-white border border-[#eceef0] hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors"
        >
          <List className="w-4 h-4" />
          Go to {label}s
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
      >
        Close
      </button>
      <p className="text-[10px] text-gray-400 max-w-sm">
        Note: creating a {noun} is final and has already been recorded. It
        cannot be deleted; use the status control for lifecycle changes.
      </p>
    </div>
  );
};