"use client";

import { useEffect } from "react";

/**
 * BizLedger 10.2-C: production-safe, dependency-free PWA registration.
 *
 * Behaviour contract (kept deliberately conservative for a financial app):
 *   - Browser-only. Registration never runs during SSR, pre-render/build,
 *     or on any non-window agent — so `output: "export"` static generation
 *     and `next build` are unaffected (no `window` in those phases).
 *   - Production-only install surface. In local `npm run dev` there is no
 *     HTTPS origin, so the browser would rightfully refuse to register a
 *     service worker; we skip ahead of that failure instead of relying on
 *     the error path.
 *   - Failure never throws into the app and never blocks rendering.
 *   - No duplicate registration: only one registration call per lifecycle.
 *   - The worker itself is network-only for every authenticated/financial
 *     call and only caches versioned static build assets + the manifest —
 *     see public/sw.js.
 */
export function PwaInstaller() {
  useEffect(() => {
    if (typeof window === "undefined")     return;
    if (!("serviceWorker" in navigator))     return;

    const isProductionLike =
      process.env.NODE_ENV === "production" ||
      (typeof location !== "undefined" && location.protocol === "https:");

    if (!isProductionLike)     return;

    let disposed = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        /* Optional: report installability only; never auto-prompt install. */
      })
      .catch(() => {
        /* Silent — a flaky registration must never break the app. */
      });

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
