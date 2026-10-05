"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { DocumentKind, documentKindLabel } from "@/lib/document-experience";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";

const STAGES = ["Preparing…", "Validating…", "Creating…"] as const;

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Subscribe to the reduced-motion media query. Using useSyncExternalStore
 * instead of setState-in-an-effect keeps the listener live (the user can flip
 * the OS setting while the overlay is open) without a cascading render.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia?.(REDUCE_MOTION_QUERY);
      if (!mq) return () => {};
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else mq.addListener(onChange);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener("change", onChange);
        else mq.removeListener(onChange);
      };
    },
    () => !!window.matchMedia?.(REDUCE_MOTION_QUERY).matches,
    () => false,
  );
}

interface DocumentSubmitLoadingProps {
  kind: DocumentKind;
  visible: boolean;
}

/**
 * Loading animation shown while a create request is in flight. Displays a large,
 * centered BizLedger logo as the primary visual, cycles through
 * Preparing… / Validating… / Creating…, is aria-live assertive for screen
 * readers, and keeps the motion purely decorative (the stage text always
 * conveys progress). Respects `prefers-reduced-motion` by rendering the steps
 * as text-only statics with no animation.
 */
export const DocumentSubmitLoading: React.FC<DocumentSubmitLoadingProps> = ({
  kind,
  visible,
}) => {
  const [stageIndex, setStageIndex] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  const reduceMotion = usePrefersReducedMotion();

  // Restart the stage sequence at "Preparing…" every time the overlay is shown.
  // Adjusting state during render (rather than in an effect) keeps the first
  // painted frame correct without an extra cascading render.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setStageIndex(0);
  }

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) return;
    const t = window.setInterval(
      () => setStageIndex((i) => (i + 1) % STAGES.length),
      900,
    );
    return () => window.clearInterval(t);
  }, [visible, reduceMotion]);

  if (!visible) return null;

  const stage = STAGES[stageIndex];

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-label={`Creating your ${documentKindLabel(kind).toLowerCase()}`}
      className="fixed inset-0 z-[80] bg-white/90 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-[#eceef0] px-10 py-10 max-w-sm w-full text-center space-y-5">
        {/* Large, centered official BizLedger logo. The motion is a gentle
            pulse (not a spin) so a brand mark never appears to tumble; it is
            dropped entirely for reduced-motion users. */}
        <div className="flex justify-center">
          <div className="w-32 h-32 flex items-center justify-center">
            <BizLedgerLogo
              size="large"
              alt=""
              className={`w-28 h-28 ${reduceMotion ? "" : "animate-pulse"}`}
            />
          </div>
        </div>
        <h4 className="text-sm font-bold text-[#191c1e]">
          {documentKindLabel(kind)} is being created
        </h4>
        <p className="text-xs text-gray-500">
          {reduceMotion ? (
            stage
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              {STAGES.map((s, i) => (
                <span
                  key={s}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                    i === stageIndex
                      ? "bg-rose-50 text-[#93000b]"
                      : "text-gray-400"
                  }`}
                >
                  {s}
                </span>
              ))}
            </span>
          )}
        </p>
      </div>
    </div>
  );
};