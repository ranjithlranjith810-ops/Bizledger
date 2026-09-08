// Phase 4B — server-only Razorpay provider (Test Mode foundation).
//
// SCOPE:
//   This module is the ONLY place that owns Razorpay credentials. Everything
//   below reads them from the server environment (never from client code, and
//   never hardcoded). It exposes:
//     • createOrder()            — Razorpay Orders API, returns ONLY safe fields
//     • verifyPaymentSignature() — HMAC-SHA256(orderId|paymentId, KEY_SECRET)
//     • verifyWebhookSignature() — HMAC-SHA256(rawBody, WEBHOOK_SECRET)
//
// SECURITY PROPERTIES:
//   • `import "server-only"` makes this module un-bundleable from the browser.
//   • No log/exception below ever includes a Key Secret, Authorization
//     headers, environment values, or raw sensitive request data — only the
//     *names* of missing environment variables.
//   • Responses are whitelisted to order_id/amount/currency.
//   • Signature comparisons use timing-safe equality and strict hex shape
//     checks (rejects malformed signatures instead of throwing).
//
// PHASE 4B CONSTRAINTS:
//   Does NOT create checkouts, verify payment routes, webhook routes, payment
//   activation, or entitlement changes — those belong to later phases. This is
//   the foundation only.

import "server-only";

import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "node:crypto";

const ENV_NAMES = {
  keyId: "RAZORPAY_KEY_ID",
  keySecret: "RAZORPAY_KEY_SECRET",
  webhookSecret: "RAZORPAY_WEBHOOK_SECRET",
} as const;

export type RazorpayErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_AMOUNT"
  | "CURRENCY_UNSUPPORTED"
  | "RECEIPT_REQUIRED"
  | "UPSTREAM_ERROR";

/**
 * Raised before any Razorpay call for anything we can reject locally.
 * `field` + `reason` describe the problem without leaking secrets.
 */
export class RazorpayOrderValidationError extends Error {
  readonly code: Exclude<RazorpayErrorCode, "MISSING_CONFIG" | "UPSTREAM_ERROR">;
  readonly field: string;

  constructor(
    code: Exclude<RazorpayErrorCode, "MISSING_CONFIG" | "UPSTREAM_ERROR">,
    field: string,
    message: string
  ) {
    super(message);
    this.name = "RazorpayOrderValidationError";
    this.code = code;
    this.field = field;
  }
}

/** Raised when Razorpay credentials are not configured in the environment. */
export class RazorpayConfigError extends Error {
  readonly code: "MISSING_CONFIG";

  constructor(missing: string[]) {
    super(
      `Razorpay is not configured: ${missing.map((n) => n).join(", ")} not set`
    );
    this.name = "RazorpayConfigError";
    this.code = "MISSING_CONFIG";
    this.missing = missing;
  }

  readonly missing: string[];
}

/** Sanitized wrap of an upstream (Razorpay API) failure. */
export class RazorpayApiError extends Error {
  readonly code: "UPSTREAM_ERROR";
  readonly statusCode: number | undefined;
  readonly errorCode: string | undefined;

  constructor(input: {
    message: string;
    statusCode?: number;
    errorCode?: string;
  }) {
    super(input.message);
    this.name = "RazorpayApiError";
    this.code = "UPSTREAM_ERROR";
    this.statusCode = input.statusCode;
    this.errorCode = input.errorCode;
  }
}

export interface CreateOrderInput {
  /** Amount in integer paise (1 INR = 100). */
  amount: number;
  /** ISO currency code — only INR is supported in Phase 4. */
  currency: string;
  /** Receipt reference for the merchant (required). */
  receipt: string;
}

/** The ONLY shape this provider returns to callers from an order. */
export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
}

/** What remains of a required signature input after strict shape checks. */
interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
}

function readConfig(): RazorpayConfig {
  const keyId = process.env[ENV_NAMES.keyId] ?? "";
  const keySecret = process.env[ENV_NAMES.keySecret] ?? "";
  const webhookSecret = process.env[ENV_NAMES.webhookSecret] ?? null;
  return { keyId, keySecret, webhookSecret };
}

/**
 * True when both Key ID and Key Secret are set non-empty in the environment.
 * Never reveals what the values are.
 */
export function razorpayConfigured(): boolean {
  const cfg = readConfig();
  return cfg.keyId.length > 0 && cfg.keySecret.length > 0;
}

/**
 * True when the webhook signing secret is set non-empty in the environment.
 * Lets the Phase 4F webhook route fail safely (503) when it is missing instead
 * of misreporting every request as an invalid signature. Never reveals the
 * value or whether it exists beyond the boolean it returns.
 */
export function webhookConfigured(): boolean {
  const cfg = readConfig();
  return cfg.webhookSecret !== null && cfg.webhookSecret.length > 0;
}

/**
 * The Razorpay Key ID is a PUBLIC identifier (it is meant to be loaded into the
 * browser's checkout page). Phase 4D returns it to the authenticated client so
 * the Phase 4E checkout UI can initialize the SDK. Returns `null` when billing
 * is not configured. Never ever returns the Key Secret.
 */
export function razorpayPublicKeyId(): string | null {
  const keyId = process.env[ENV_NAMES.keyId] ?? "";
  return keyId.length > 0 ? keyId : null;
}

function requireConfig(cfg: RazorpayConfig): void {
  if (!cfg.keyId || !cfg.keySecret) {
    const missing: string[] = [];
    if (!cfg.keyId) missing.push(ENV_NAMES.keyId);
    if (!cfg.keySecret) missing.push(ENV_NAMES.keySecret);
    throw new RazorpayConfigError(missing);
  }
}

/**
 * Creates a Razorpay Test Mode order.
 *
 * Validates amount (integer, >= 100 paise), currency (INR), and receipt before
 * any network call, then normalizes the SDK response down to the safe fields
 * BizLedger needs: order_id / amount / currency.
 *
 * @throws RazorpayOrderValidationError, RazorpayConfigError, RazorpayApiError
 */
export async function createOrder(
  input: CreateOrderInput
): Promise<RazorpayOrder> {
  const { amount, currency, receipt } = input;

  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    throw new RazorpayOrderValidationError(
      "INVALID_AMOUNT",
      "amount",
      "amount must be an integer (in paise)"
    );
  }
  if (amount < 100) {
    throw new RazorpayOrderValidationError(
      "INVALID_AMOUNT",
      "amount",
      "amount must be at least 100 paise (₹1)"
    );
  }
  if (typeof currency !== "string" || currency !== "INR") {
    throw new RazorpayOrderValidationError(
      "CURRENCY_UNSUPPORTED",
      "currency",
      "currency must be INR"
    );
  }
  if (typeof receipt !== "string" || receipt.trim().length === 0) {
    throw new RazorpayOrderValidationError(
      "RECEIPT_REQUIRED",
      "receipt",
      "receipt is required"
    );
  }

  const cfg = readConfig();
  requireConfig(cfg);

  let order: RazorpayOrder;
  try {
    const instance = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
    const created = await instance.orders.create({
      amount,
      currency,
      receipt: receipt.trim(),
    });
    order = {
      orderId: created.id,
      amount: Number(created.amount),
      currency: created.currency,
    };
  } catch (err) {
    // Whitelist-only sanitization: a Razorpay upstream failure can carry spine
    // echoing the request; never forward headers/options/body or credentials.
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? (err as { statusCode?: unknown }).statusCode
        : undefined;
    const errorCode =
      typeof err === "object" &&
      err !== null &&
      (err as { error?: { code?: unknown } }).error?.code
        ? String((err as { error: { code: unknown } }).error.code)
        : undefined;
    throw new RazorpayApiError({
      message: "Razorpay order creation failed",
      statusCode:
        typeof statusCode === "number" ? statusCode : undefined,
      errorCode,
    });
  }

  // Normalization guard: the API must echo back an integer amount.
  if (!Number.isInteger(order.amount) || !order.orderId || !order.currency) {
    throw new RazorpayApiError({
      message: "Razorpay returned an unexpected order payload",
    });
  }

  return order;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Constant-time hex HMAC-SHA256 comparison. Returns `false` (never throws) for
 * malformed or wrong-length signatures.
 */
function safeEqualHex(expectedHex: string, receivedHex: string): boolean {
  if (
    typeof receivedHex !== "string" ||
    receivedHex.length === 0 ||
    receivedHex.length !== expectedHex.length ||
    receivedHex.length % 2 !== 0 ||
    !HEX_RE.test(receivedHex)
  ) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return timingSafeEqual(expected, received);
}

function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/**
 * Verifies a Razorpay payment signature:
 *   HMAC-SHA256(orderId + "|" + paymentId, KEY_SECRET)
 *
 * Never mutates state — payment capture/activation belongs to later phases.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const cfg = readConfig();
  if (!cfg.keyId || !cfg.keySecret) return false;

  const expected = hmacSha256Hex(cfg.keySecret, `${input.orderId}|${input.paymentId}`);
  return safeEqualHex(expected, input.signature);
}

/**
 * Verifies a Razorpay webhook signature:
 *   HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 *
 * No webhook route/processing yet (Phase 4B is foundation only).
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string;
}): boolean {
  const cfg = readConfig();
  if (!cfg.keySecret || !cfg.webhookSecret) return false;

  const expected = hmacSha256Hex(cfg.webhookSecret, input.rawBody);
  return safeEqualHex(expected, input.signature);
}