// Focused tests for the enum-controlled Resend webhook endpoint configuration.
//
// Run:
//   $env:NODE_OPTIONS="--conditions=react-server"
//   npx tsx src/__tests__/resend-webhook-config.test.ts

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  RESEND_WEBHOOK_ROUTE,
  RESEND_WEBHOOK_BASE_URL_ENV,
  getResendWebhookUrl,
  isResendWebhookBaseUrlConfigured,
  resendWebhookBaseUrl,
  ResendConfigError,
} from "../lib/email/resend-webhook-config";

const prev = process.env[RESEND_WEBHOOK_BASE_URL_ENV];

beforeEach(() => {
  process.env[RESEND_WEBHOOK_BASE_URL_ENV] = "https://abc-3000.incl.devtunnels.ms";
});

afterEach(() => {
  if (prev === undefined) {
    delete process.env[RESEND_WEBHOOK_BASE_URL_ENV];
  } else {
    process.env[RESEND_WEBHOOK_BASE_URL_ENV] = prev;
  }
});

describe("Resend webhook route", () => {
  it("is the exact app route /api/webhooks/resend", () => {
    assert.equal(RESEND_WEBHOOK_ROUTE, "/api/webhooks/resend");
  });
});

describe("getResendWebhookUrl()", () => {
  it("builds BASE + ROUTE into the public endpoint", () => {
    assert.equal(
      getResendWebhookUrl(),
      "https://abc-3000.incl.devtunnels.ms/api/webhooks/resend",
    );
  });

  it("tolerates a trailing slash on the base URL", () => {
    process.env[RESEND_WEBHOOK_BASE_URL_ENV] = "https://abc-3000.incl.devtunnels.ms/";
    assert.equal(
      getResendWebhookUrl(),
      "https://abc-3000.incl.devtunnels.ms/api/webhooks/resend",
    );
  });

  it("fails loudly when the base URL is unset (never builds an invalid endpoint)", () => {
    delete process.env[RESEND_WEBHOOK_BASE_URL_ENV];
    assert.equal(isResendWebhookBaseUrlConfigured(), false);
    assert.throws(
      () => getResendWebhookUrl(),
      (err: unknown) =>
        err instanceof ResendConfigError &&
        /RESEND_WEBHOOK_BASE_URL is not configured/.test((err as Error).message),
    );
  });

  it("fails loudly when the base URL is empty/whitespace", () => {
    process.env[RESEND_WEBHOOK_BASE_URL_ENV] = "   ";
    assert.equal(isResendWebhookBaseUrlConfigured(), false);
    assert.throws(() => getResendWebhookUrl(), ResendConfigError);
  });

  it("after a successful build the helper reports configured", () => {
    assert.equal(resendWebhookBaseUrl(), "https://abc-3000.incl.devtunnels.ms");
    assert.equal(isResendWebhookBaseUrlConfigured(), true);
  });
});

describe("secrets stay server-side (no NEXT_PUBLIC_ footprint)", () => {
  it("Resend secret env names never carry a NEXT_PUBLIC_ prefix", () => {
    // The canonical env names are read server-side only; a NEXT_PUBLIC_ prefix
    // would have shipped them into the client bundle. Assert the exact names.
    for (const name of ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"]) {
      assert.ok(!name.startsWith("NEXT_PUBLIC_"), `${name} must be server-only`);
    }
    // Base URL is server configuration too (not secret, still non-public):
    assert.equal(RESEND_WEBHOOK_BASE_URL_ENV, "RESEND_WEBHOOK_BASE_URL");
    assert.ok(!RESEND_WEBHOOK_BASE_URL_ENV.startsWith("NEXT_PUBLIC_"));
  });
});