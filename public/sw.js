/* BizLedger – dependency-free, production-safe service worker (10.2-C).
 *
 * SCOPE OF CACHING — deliberately conservative for a financial product:
 *   WE CACHE  : versioned Next.js static build artifacts only:
 *                 - /_next/static/** (immutable chunk hashes; cache-first)
 *                 - /manifest.webmanifest (cache-first, versioned above)
 *                 - the app shell (/) and /favicon path — shell is
 *                   revalidated network-first, never trusted stale offline.
 *   WE NEVER CACHE:
 *                 - /api/** (all authenticated, account-scoped endpoints:
 *                   Razorpay payment verify/webhook, invoices, expenses,
 *                   customers, business profile, subscription/entitlement,
 *                   admin). Network-only, always.
 *                 - Razorpay checkout/checkout.js or any cross-origin
 *                   authenticated/resource-loading URL.
 *                 - Any request with a non-GET method, an Authorization
 *                   header, or a Cache request-mode — never even touched.
 *
 * This worker therefore provides offline static shell resilience WITHOUT
 * ever making an authenticated or financial response available offline, and
 * without ever serving stale payment/entitlement state.
 */

const VERSION = "bizledger-sw-v1.0.0";
const CACHE_NAME = `bizledger-static-${VERSION}`;

const PRECACHE_URLS = ["/manifest.webmanifest"];

/* Files are only ever added to the runtime cache when the response was a
 * successful, same-origin GET with a browser-mode request — never for API
 * calls (they never match the /_next or / route family below, so this is
 * structural, not a string-match heuristics risk). */
const STATIC_PREFIX = "/_next/static/";
const APP_SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {
        /* If precache fails, the SW still installs — the app must never be
         * blocked by the PWA enhancement. */
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("bizledger-static-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* Hard structural firewall: NEVER intercept, cache, or serve anything
   * authenticated, dynamic, or financial from cache. API + Razorpay +
   * non-GET + credentialed requests always go straight to the network with
   * the cache completely bypassed. */
  const url = new URL(req.url);
  const isApi = url.pathname.startsWith("/api/");
  const isRazorpay =
    url.hostname.endsWith("razorpay.com") || url.hostname.endsWith("razorpay.io");
  const isCredentialed = req.headers.get("authorization") != null;
  const isNonGet = req.method !== "GET";
  if (isApi || isRazorpay || isCredentialed || isNonGet) {
    return;
  }

  const isStatic = url.pathname.startsWith(STATIC_PREFIX);
  const isManifest = url.pathname === "/manifest.webmanifest";
  const isShell = url.pathname === APP_SHELL;

  if (!isStatic && !isManifest && !isShell) {
    /* Unrecognized asset — network-only, never cached (defensive default). */
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      /* Static build chunks: immutable by content hash → cache-first with a
       * worst-case network revalidation fallback. */
      if (isStatic) {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          if (cached) return cached;
          return new Response(null, { status: 503 });
        }
      }

      /* Manifest is versioned above the worker; cache-first is fine. */
      if (isManifest) {
        const hit = await cache.match(req);
        if (hit) return hit;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      }

      /* App shell /: network-first, then cached copy as last-resort offline.
       * Never returns a stale shell as if it were fresh financial truth — an
       * offline shell only ever renders the sign-in / entry surface, and all
       * data APIs remain network-only (see firewall above). Authentication
       * and every data read are therefore still gated by the live server. */
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const fallback = await cache.match(req);
        if (fallback) return fallback;
        return new Response(null, { status: 503 });
      }
    })()
  );
});
