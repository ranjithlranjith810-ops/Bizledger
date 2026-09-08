"use client";

// Phase 4E — single reusable Razorpay Standard Checkout integration helper.
//
// The checkout.js script URL lives here (never duplicated across components),
// plus pure helpers the payment UI + automated tests share:
//   • createScriptLoader / loadRazorpayCheckoutScript — one script element,
//     cached; pages that do not pay never load it.
//   • buildRazorpayOptions — whitelisted options: public keyId + backend
//     order_id/amount only. The Key Secret NEVER appears anywhere here.
//   • buildVerifyPayload — success-callback → verification request mapping.
//   • shouldLaunchPaidCheckout / serverOrderAmounts — free-plan guard and
//     server-authoritative amount display.
//   • reduceCheckoutPhase — small phase state machine that prevents duplicate
//     checkout launches and keeps success/failure/cancel ordering safe.
//   • openRazorpayCheckout — injectable constructor for headless tests.

import type { PaidCheckout, FreeCheckout } from "@/lib/api/billing";

export const RAZORPAY_CHECKOUT_SCRIPT_URL =
  "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpaySuccessPayload {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface PaymentVerificationRequest {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface CheckoutPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

export interface ScriptLoadEnv {
  document?: {
    getElementById(id: string): HTMLElement | null;
    createElement(tag: string): HTMLScriptElement;
    head: { appendChild(node: unknown): unknown };
  };
}

/** Deferred script loader factory — each instance appends at most ONE element. */
export function createScriptLoader() {
  let promise: Promise<void> | null = null;
  return function load(env: ScriptLoadEnv = {}): Promise<void> {
    if (promise) return promise;
    const doc = env.document;
    if (!doc) {
      promise = Promise.reject(
        new Error("Razorpay checkout scripts can only load in the browser"),
      );
      return promise;
    }
    promise = new Promise<void>((resolve, reject) => {
      try {
        if (doc.getElementById("razorpay-checkout-script")) {
          resolve();
          return;
        }
        const script = doc.createElement("script");
        script.id = "razorpay-checkout-script";
        script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          promise = null;
          reject(new Error("Failed to load Razorpay checkout"));
        };
        doc.head.appendChild(script);
      } catch (error) {
        promise = null;
        reject(error);
      }
    });
    return promise;
  };
}

const sharedScriptLoader = createScriptLoader();

/** Singleton loader used by the payment UI (browser only). */
export function loadRazorpayCheckoutScript(): Promise<void> {
  return sharedScriptLoader({
    document:
      typeof document !== "undefined"
        ? {
            getElementById: (id) => document.getElementById(id),
            createElement: (tag) =>
              document.createElement(tag) as HTMLScriptElement,
            head: document.head,
          }
        : undefined,
  });
}

/**
 * True only for a paid checkout that can actually open the Razorpay modal.
 * Returns false for the Base plan (requiresPayment:false), a missing order, or
 * an unconfigured key — so the modal is never launched for Base (§28) and the
 * public key is never fabricated client-side.
 */
export function shouldLaunchPaidCheckout(
  checkout: PaidCheckout | FreeCheckout | null | undefined,
): checkout is PaidCheckout {
  return (
    !!checkout &&
    checkout.requiresPayment === true &&
    !!checkout.orderId &&
    !!checkout.keyId
  );
}

/**
 * Maps the Razorpay success callback response to the verification request the
 * backend accepts. Returns null when any of the three provider values is
 * missing — callers then treat it as a failed verification, never a pass.
 */
export function buildVerifyPayload(
  payload: Record<string, unknown> | null | undefined,
): PaymentVerificationRequest | null {
  const paymentId =
    payload && typeof payload.razorpay_payment_id === "string"
      ? payload.razorpay_payment_id
      : "";
  const orderId =
    payload && typeof payload.razorpay_order_id === "string"
      ? payload.razorpay_order_id
      : "";
  const signature =
    payload && typeof payload.razorpay_signature === "string"
      ? payload.razorpay_signature
      : "";
  if (!paymentId || !orderId || !signature) return null;
  return {
    razorpay_payment_id: paymentId,
    razorpay_order_id: orderId,
    razorpay_signature: signature,
  };
}

/** Server-authoritative amounts for display — never recomputed client-side. */
export function serverOrderAmounts(
  checkout: PaidCheckout | FreeCheckout,
): { base: string; gst: string; total: string } {
  return {
    base: checkout.baseAmount,
    gst: checkout.gstAmount,
    total: checkout.totalAmount,
  };
}

export type CheckoutPhase =
  | "idle"
  | "creating"
  | "ready"
  | "opening"
  | "verifying"
  | "success"
  | "failed"
  | "cancelled";

export type CheckoutEvent =
  | "create"
  | "checkout"
  | "error"
  | "open"
  | "success"
  | "verified"
  | "verify-error"
  | "dismiss"
  | "retry";

/**
 * Deterministic payment-flow state machine. Its main job is preventing
 * uncontrolled duplicate launches (§25 / §36): a second "open" while creating
 * or while the modal is up is a no-op, and once verification starts the modal
 * close/failure events cannot regress the UI.
 */
export function reduceCheckoutPhase(
  current: CheckoutPhase,
  event: CheckoutEvent,
): CheckoutPhase {
  switch (current) {
    case "idle":
      return event === "create" ? "creating" : current;
    case "creating":
      return event === "checkout" ? "ready" : event === "error" ? "idle" : current;
    case "ready":
      return event === "open" ? "opening" : event === "create" ? "creating" : current;
    case "opening":
      return event === "success"
        ? "verifying"
        : event === "error"
        ? "failed"
        : event === "dismiss"
        ? "cancelled"
        : current;
    case "verifying":
      return event === "verified"
        ? "success"
        : event === "verify-error"
        ? "failed"
        : current;
    case "failed":
    case "cancelled":
      return event === "retry" ? "ready" : current;
    default:
      return current;
  }
}

export interface RazorpayCheckoutInstance {
  on(
    event: "payment.success" | "payment.error" | "modal.close",
    handler: (arg?: unknown) => void,
  ): unknown;
  open(): void;
}

export type RazorpayCheckoutCtor = new (
  options: Record<string, unknown>,
) => RazorpayCheckoutInstance;

/**
 * Builds the exact option set the Razorpay Standard Checkout modal accepts.
 * The success `handler` forwards all three provider values (or invokes
 * `onMalformedPayload` when any is missing — never a silent pass). Dismissal
 * and payment-failure events are wired by the caller through
 * `openRazorpayCheckout`, keeping this object a pure whitelist.
 */
export function buildRazorpayOptions(
  checkout: PaidCheckout,
  description: string,
  onSuccess: (payload: RazorpaySuccessPayload) => void,
  onMalformedPayload: () => void,
  prefill?: CheckoutPrefill,
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    key: checkout.keyId,
    amount: checkout.amount,
    currency: checkout.currency,
    name: "BizLedger",
    description,
    order_id: checkout.orderId,
    handler: (response: Record<string, unknown>) => {
      const payload = buildVerifyPayload(response);
      if (payload) onSuccess(payload);
      else onMalformedPayload();
    },
  };
  if (prefill && (prefill.name || prefill.email || prefill.contact)) {
    options.prefill = prefill;
  }
  return options;
}

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutCtor;
  }
}

/**
 * Instantiates and opens the Razorpay modal, wiring failure + close events to
 * the caller's handlers. The constructor is injectable so the harness can drive
 * the exact option object without a browser.
 */
export function openRazorpayCheckout(
  ctor: RazorpayCheckoutCtor,
  options: Record<string, unknown>,
  extras: { onError?: (info?: unknown) => void; onClose?: () => void } = {},
): RazorpayCheckoutInstance {
  const modal = new ctor(options);
  modal.on("payment.error", (info) => {
    extras.onError?.(info);
  });
  modal.on("modal.close", () => {
    extras.onClose?.();
  });
  modal.open();
  return modal;
}