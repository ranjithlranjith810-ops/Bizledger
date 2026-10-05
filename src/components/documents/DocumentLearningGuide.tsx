"use client";

import React, { useState } from "react";
import {
  DocumentKind,
  documentKindLabel,
  documentLearningSteps,
  isLearningDismissed,
  markLearningDismissed,
} from "@/lib/document-experience";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  X,
} from "lucide-react";

interface DocumentLearningGuideProps {
  kind: DocumentKind;
  onClose: () => void;
  onComplete: () => void;
}

/**
 * First-time learning guide shown next to the sample document. Stepper with
 * Back / Next / Skip, keyboard-accessible buttons, an aria-live step body, and
 * a persisted "Don't show again" preference. "Finish" (on the last step) and
 * "Skip" both complete the tour and let the parent persist the seen-state.
 */
export const DocumentLearningGuide: React.FC<DocumentLearningGuideProps> = ({
  kind,
  onClose,
  onComplete,
}) => {
  const steps = documentLearningSteps(kind);
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(() =>
    isLearningDismissed(kind),
  );
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const step = steps[index];

  const skip = () => {
    if (dontShowAgain) markLearningDismissed(kind);
    onComplete();
    onClose();
  };

  return (
    <div className="flex flex-col h-full" role="group" aria-label="Learning guide">
      <div className="flex items-center justify-between gap-3 border-b border-[#eceef0] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#eef6ff] text-[#0057c8] flex items-center justify-center">
            <Info className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-[#191c1e]">
              Learn about {documentKindLabel(kind)}s
            </h4>
            <p className="text-[11px] text-gray-500">
              Step {index + 1} of {steps.length}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={skip}
          aria-label="Close the learning guide"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs">
        <div aria-live="polite" className="space-y-2">
          <h5 className="font-bold text-gray-900">{step.title}</h5>
          <p className="text-gray-600 leading-relaxed">{step.body}</p>
        </div>
        <div className="flex gap-1.5 pt-1">
          {steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setIndex(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i === index ? "bg-[#93000b]" : "bg-gray-200 hover:bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-[#eceef0] px-4 pt-2.5 pb-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => {
              const next = e.target.checked;
              setDontShowAgain(next);
              if (next) markLearningDismissed(kind);
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 text-[#93000b] focus:ring-[#93000b]/30 accent-[#93000b]"
            aria-label="Don't show this guide again"
          />
          <span className="text-[11px] text-gray-600 group-hover:text-gray-800 transition-colors">
            Don’t show this guide again
          </span>
        </label>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex(isFirst ? 0 : index - 1)}
            disabled={isFirst}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#eceef0] text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skip}
              className="px-3 py-2 rounded-xl text-gray-500 text-xs font-semibold hover:bg-gray-100 transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => (isLast ? skip() : setIndex(index + 1))}
              className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              {isLast ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Finish
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};