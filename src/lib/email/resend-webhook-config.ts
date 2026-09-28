// Server-only Resend webhook configuration.
//
// The public endpoint Resend must POST delivery events to is derived ONLY from
// environment configuration — never from a hard-coded host, localhost alias, or
// VS Code forwarded URL:
//
//   RESEND_WEBHOOK_BASE_URL   https://<public-or-forwarded-host>   (no path)
//   RESEND_WEBHOOK_ROUTE      /api/webhooks/resend                (the app route)
//
//   getResendWebhookUrl()   =  RESEND_WEBHOOK_BASE_URL + RESEND_WEBHOOK_ROUTE
//
// The base URL lives in the environment so a changing VS Code Dev Tunnel /
// port-forwarded URL can be swapped in .env.local without touching source.
//
// Security posture:
//   * The base URL is NOT secret, but it is still server configuration: this
//     module is "server-only" and never reaches the client bundle, and there is
//     NO NEXT_PUBLIC_ variant. RESEND_API_KEY / RESEND_WEBHOOK_SECRET remain
//     secrets entirely on the server as before.
//   * getResendWebhookUrl() FAILS FAST (ResendConfigError) when the base URL is
//     missing/empty instead of silently building an invalid "/api/webhooks/"
//     endpoint — the same contract the inbound handler uses for a missing
//     signing secret (503), so a misconfigured integration never self-lies.
//
// This complements (and shares the error type of) the inbound handler in
// ./resend-webhook-service.ts, which verifies signatures against
// RESEND_WEBHOOK_SECRET and answers 503 when that secret is unset.

import "server-only";

export const RESEND_WEBHOOK_ROUTE = "/api/webhooks/resend";

export const RESEND_WEBHOOK_BASE_URL_ENV = "RESEND_WEBHOOK_BASE_URL";

/**
 * RESEND_WEBHOOK_SECRET / RESEND_WEBHOOK_BASE_URL is missing or empty. The
 * inbound route maps this to 503; the caller of getResendWebhookUrl() must
 * surface it as a clear configuration error, never a broken URL.
 */
export class ResendConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendConfigError";
  }
}

/** True when RESEND_WEBHOOK_BASE_URL is present and non-empty. */
export function isResendWebhookBaseUrlConfigured(): boolean {
  const base = process.env.RESEND_WEBHOOK_BASE_URL;
  return typeof base === "string" && base.trim().length > 0;
}

/** The raw base URL with any trailing slashes removed; "" when unset. */
export function resendWebhookBaseUrl(): string {
  return (process.env.RESEND_WEBHOOK_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

/**
 * The full public webhook endpoint (`BASE + ROUTE`), or a clear configuration
 * error when BASE is missing. Never returns an invalid/partial URL.
 */
export function getResendWebhookUrl(): string {
  const base = resendWebhookBaseUrl();
  if (!base) {
    throw new ResendConfigError(
      `RESEND_WEBHOOK_BASE_URL is not configured; cannot build ${RESEND_WEBHOOK_ROUTE}`,
    );
  }
  return `${base}${RESEND_WEBHOOK_ROUTE}`;
}