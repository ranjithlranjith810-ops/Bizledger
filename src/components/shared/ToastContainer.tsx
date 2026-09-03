"use client";

import React, { useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from "lucide-react";
import { useApp } from "@/context/AppContext";

// Auto-dismiss after N ms. Deletion ("Removed") toasts stay a bit longer so the
// Undo action remains available.
const DEFAULT_DURATION = 6000;
const REMOVED_DURATION = 10000;

function isRemovedToast(title: string): boolean {
  return /removed|deleted|reset/i.test(title || "");
}

export const ToastContainer: React.FC = () => {
  const { notifications, removeNotification, restoreLastDeleted } = useApp();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Clear any toast timers, then (re)arm one per visible toast. Long-lived
  // "caught up" drawer records are never auto-dismissed — only the small toast
  // stack that is rendered here is timed.
  useEffect(() => {
    Object.values(timers.current).forEach((t) => clearTimeout(t));
    timers.current = {};
    notifications.forEach((n) => {
      const removed = isRemovedToast(n.title);
      const t = setTimeout(() => removeNotification(n.id), removed ? REMOVED_DURATION : DEFAULT_DURATION);
      timers.current[n.id] = t;
    });
    return () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t));
      timers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => {
        const isRemoved = isRemovedToast(n.title);
        return (
          <div
            key={n.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg border text-xs flex items-start gap-3 transition-all animate-in slide-in-from-bottom-5 ${
              n.type === 'success'
                ? 'bg-emerald-900 text-white border-emerald-800'
                : n.type === 'error'
                ? 'bg-rose-900 text-white border-rose-800'
                : 'bg-gray-900 text-white border-gray-800'
            }`}
          >
            {(n.type === 'success' || n.type === 'payment' || n.type === 'payroll') && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {n.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {(n.type === 'info' || n.type === 'warning' || n.type === 'renewal') && <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <div className="font-bold text-white text-xs">{n.title}</div>
              <div className="text-[11px] opacity-90 mt-0.5">{n.message}</div>
              {isRemoved && (
                <button
                  onClick={() => restoreLastDeleted()}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1 transition-colors"
                >
                  <Undo2 className="w-3 h-3" />
                  Undo
                </button>
              )}
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-white/60 hover:text-white p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
