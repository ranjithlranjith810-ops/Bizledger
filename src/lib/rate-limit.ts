// Shared sliding-window rate limiter for app API routes.
//
// Backed by the shared PostgreSQL `rate_limit` table (same table Better Auth's
// database storage uses), so limits are enforced across all server instances in
// production — no process-local memory. The atomic `ON CONFLICT (key)` upsert
// keeps concurrent requests from all passing a stale read.
//
// Keys are namespaced `app:{bucket}:{identifier}` so they never collide with
// Better Auth's own `{ip}:{path}` keys. The 429 body is sanitized and carries a
// standard `Retry-After` header.

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIpAddressConfig } from "@/lib/auth/trust-config";
import { getClientIpFromRequest } from "@/lib/auth/client-ip";

export interface RateLimitDecision {
  allowed: boolean;
  retryAfter: number;
}

/**
 * Per-route bucket limits. `window` is in seconds, `max` is the number of
 * requests allowed per `window` for a single client IP. Kept central so the
 * security tests and the routes read the same numbers.
 */
export const APP_RATE_LIMITS = {
  "team-invite": { window: 60, max: 10 },
  "expense-approve": { window: 60, max: 30 },
  "invoice-status": { window: 60, max: 60 },
  "estimate-status": { window: 60, max: 60 },
  "quotation-status": { window: 60, max: 60 },
  "purchase-order-status": { window: 60, max: 60 },
  "directory-save": { window: 60, max: 30 },
  "directory-submit": { window: 300, max: 5 },
  "directory-unlist": { window: 60, max: 10 },
  "billing-checkout": { window: 60, max: 10 },
  "directory-public": { window: 60, max: 60 },
  "admin-mutation": { window: 60, max: 30 },
} as const satisfies Record<string, { window: number; max: number }>;

export type RateLimitBucket = keyof typeof APP_RATE_LIMITS;

/**
 * Convenience wrapper for route handlers: looks up the bucket's limit and
 * enforces it for the caller's IP. Returns a 429 response when the limit is
 * exceeded, otherwise `null` so the handler continues.
 */
export async function enforceRateLimit(
  request: Request,
  bucket: RateLimitBucket,
): Promise<NextResponse | null> {
  const { window, max } = APP_RATE_LIMITS[bucket];
  const decision = await consumeRateLimit(
    bucket,
    getClientIp(request),
    window,
    max,
  );
  if (decision.allowed) return null;
  return tooManyRequestsResponse(decision.retryAfter);
}

/**
 * Resolve the caller IP for rate limiting.
 *
 * SECURITY: this must never let an external client choose its own rate-limit
 * identity. It previously trusted the FIRST `x-forwarded-for` token, which is
 * precisely the client-controlled end of the chain — every standard proxy
 * (nginx `$proxy_add_x_forwarded_for`, AWS ALB, Vercel, Cloudflare) APPENDS the
 * real connecting address to whatever the client sent, so a caller could send
 * `X-Forwarded-For: <anything>` and receive a fresh bucket on every request,
 * defeating team-invite, checkout, directory-submit and admin-mutation
 * throttling outright.
 *
 * The trust decision is delegated to `resolveIpAddressConfig` — the SAME pure
 * function and the SAME `TRUSTED_PROXIES` value that configure Better Auth's
 * limiter in `@/lib/auth` — so the two can never disagree about which proxies
 * are trusted. `@/lib/auth/client-ip` then walks the chain right-to-left and
 * returns the first hop that is not a trusted proxy.
 *
 * Fail-closed: when no trustworthy address can be established (production with
 * no proxy declared, a malformed header, or a chain of nothing but proxies) the
 * caller shares ONE bucket. That over-throttles; it never under-throttles.
 *
 * Local development keeps Better Auth's documented behavior (a single-value
 * header is honored, else a stable per-process identifier) so the throttling
 * suites can still isolate runs with `X-Forwarded-For`.
 */
export function getClientIp(request: Request): string {
  const config = resolveIpAddressConfig(
    process.env.NODE_ENV ?? "development",
    process.env.TRUSTED_PROXIES,
  );
  const resolved = getClientIpFromRequest(request, config);
  if (resolved) return resolved;
  // No trustworthy client IP: collapse to a single shared bucket for this
  // bucket name. Never fall back to a client-supplied header value.
  return process.env.NODE_ENV === "development" ? "dev-local" : "unknown";
}

/**
 * Consume one request against `bucket` for `identifier`. Sliding window: a
 * request resets the count when the previous one is older than the window;
 * otherwise it increments. Returns whether the request is allowed and the
 * number of seconds to wait on denial.
 */
export async function consumeRateLimit(
  bucket: string,
  identifier: string,
  windowSeconds: number,
  max: number,
): Promise<RateLimitDecision> {
  const key = `app:${bucket}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const rows = await prisma.$queryRaw<
    { count: bigint | number; lastRequest: bigint | number }[]
  >`
    INSERT INTO rate_limit (id, key, count, "lastRequest")
    VALUES (${crypto.randomUUID()}, ${key}, 1, ${now}::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit."lastRequest"::bigint <= (${now}::bigint - ${windowMs}::bigint) THEN 1
        ELSE rate_limit.count + 1
      END,
      "lastRequest" = ${now}::bigint
    RETURNING count, "lastRequest"
  `;
  const row = rows[0];
  const count = Number(row?.count ?? 1);
  const lastRequest = Number(row?.lastRequest ?? now);
  if (count <= max) {
    return { allowed: true, retryAfter: 0 };
  }
  const retryAfter = Math.max(
    1,
    Math.ceil((lastRequest + windowMs - now) / 1000),
  );
  return { allowed: false, retryAfter };
}

/**
 * Standard sanitized 429 response with a `Retry-After` header. No internals.
 */
export function tooManyRequestsResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfter))) },
    },
  );
}