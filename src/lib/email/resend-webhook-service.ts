// Resend webhook → idempotent delivery-event inbox.
//
// This is the Resend/Standard-Webhooks counterpart of the Razorpay billing
// webhook handler. SALES/BILLING/ENTITLEMENT logic is deliberately untouched —
// nothing here creates payments, invoices, subscriptions, or plan changes.
//
// FLOW:
//   1. config gate            — RESEND_WEBHOOK_SECRET must be configured (503)
//   2. input shape            — webhook-id / webhook-timestamp /
//                               webhook-signature headers + raw body (400)
//   3. signature              — Standard Webhooks (Svix) verification over the
//                               RAW body, via `standardwebhooks` (the same
//                               library the Resend SDK itself uses). Fail →
//                               400, NO persistence, no internals leaked,
//                               no signature/timestamp details echoed.
//   4. parse                  — JSON AFTER the signature check (400)
//   5. idempotency            — one durable WebhookEvent per `webhook-id`
//                               header; the unique index turns concurrent
//                               repeats into a single winner (duplicates →
//                               safe 200)
//   6. classify               — email.* events we care to acknowledge vs
//                               known-but-unhandled providers (both → 200)
//
// AUTHORITY: the body is trusted ONLY as a delivery signal. No email/identity
// data from the payload is ever used to mutate user/session/verification
// state. The stored payload is a REDACTED summary (type + email id + created)
// — subscriptions/admin from/to/subject/bounce/complaint internals are never
// persisted or logged.
//
// RETRY SEMANTICS: genuine DB failures propagate out of the transaction
// (rollback → non-2xx → Resend retries; the WebhookEvent row is never
// committed as processed). Every durable *result* (duplicate, unhandled event)
// is persisted with `processed=true` and acknowledged — an unknown event or a
// replayed delivery cannot make Resend retry forever.

import "server-only";

import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/business/api-error";
import { ResendConfigError } from "@/lib/email/resend-webhook-config";

// Re-export so the route and callers keep a single stable error type for both
// the signing-secret gate (this file) and the base-URL gate (the config module).
export { ResendConfigError };

export interface ResendWebhookInput {
  rawBody: string;
  headers: { id: string; timestamp: string; signature: string };
}

export type ResendWebhookReason =
  | "INVALID_SIGNATURE"
  | "MALFORMED_JSON"
  | "MALFORMED_PAYLOAD"
  | "DUPLICATE"
  | "UNHANDLED_EVENT_TYPE"
  | "SUCCESS";

export interface ResendWebhookResult {
  status: 200 | 400;
  reason: ResendWebhookReason;
}

/**
 * RESEND_WEBHOOK_SECRET is missing or empty. Mapped to 503 by the route so the
 * endpoint never surfaces a stack trace or the absence of configuration to the
 * caller. Resend will retry a 5xx until the secret is configured.
 */

const GENERIC_ERROR = "Invalid webhook payload";

/** email.* delivery events useful for password-reset / email-verification flows. */
const KNOWN_EMAIL_EVENTS = new Set([
  "email.scheduled",
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.received",
  "email.failed",
  "email.suppressed",
]);

function isP2002(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function resendWebhookConfigured(): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  return typeof secret === "string" && secret.trim().length > 0;
}

/**
 * Builds the REDACTED payload stored on the WebhookEvent row. Only the event
 * type, email id, and created-at are kept (and created-at only when the
 * payload itself carries one). from/to/subject/bounce/complaint and every
 * other field are intentionally discarded.
 */
function safeEventSummary(parsed: unknown): Prisma.InputJsonValue {
  const root =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  const data =
    typeof root.data === "object" && root.data !== null
      ? (root.data as Record<string, unknown>)
      : {};
  const summary: Record<string, unknown> = {
    type: typeof root.type === "string" ? root.type : null,
    created_at: typeof root.created_at === "string" ? root.created_at : null,
  };
  if (typeof data.email_id === "string") {
    summary.email_id = data.email_id;
  }
  return summary as Prisma.InputJsonValue;
}

/** Persists a durable audit row for a request rejected before the transaction. */
async function persistRecoverable(
  eventId: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
  processed: boolean,
  error: string,
): Promise<void> {
  try {
    await prisma.webhookEvent.create({
      data: { eventId, eventType, payload, signatureValid: true, processed, error },
    });
  } catch (err) {
    // The same durable event was already recorded by another delivery — fine.
    if (!isP2002(err)) throw err;
  }
}

/**
 * Processes a signed Resend webhook. Throws ValidationError (400) for missing
 * inputs and ResendConfigError (503) when the webhook secret is not configured.
 * Returns a WebhookResult for every durable outcome.
 */
export async function processResendWebhook(
  input: ResendWebhookInput,
): Promise<ResendWebhookResult> {
  const { rawBody, headers } = input;

  if (!resendWebhookConfigured()) {
    throw new ResendConfigError("RESEND_WEBHOOK_SECRET is not configured");
  }

  const eventId = headers.id?.trim() ?? "";
  const timestamp = headers.timestamp?.trim() ?? "";
  const signature = headers.signature?.trim() ?? "";
  if (!eventId || !timestamp || !signature) {
    throw new ValidationError(GENERIC_ERROR);
  }
  if (typeof rawBody !== "string" || rawBody.length === 0) {
    throw new ValidationError(GENERIC_ERROR);
  }

  // Signature first, over the RAW body. Never persisted, never explained —
  // and the Standard Webhooks tolerance window (5 min) is applied internally.
  const webhook = new Webhook(process.env.RESEND_WEBHOOK_SECRET as string);
  try {
    webhook.verify(
      rawBody,
      {
        "webhook-id": eventId,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
      },
      { jsonParse: false },
    );
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return { status: 400, reason: "INVALID_SIGNATURE" };
    }
    throw error;
  }

  // Only now can the body be trusted enough to parse.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    await persistRecoverable(
      eventId,
      "malformed",
      {} as Prisma.InputJsonValue,
      false,
      "MALFORMED_JSON",
    );
    return { status: 400, reason: "MALFORMED_JSON" };
  }

  const root = parsed as Record<string, unknown> | null;
  const eventType = typeof root?.type === "string" ? root.type : null;
  if (!eventType) {
    await persistRecoverable(
      eventId,
      "unknown",
      safeEventSummary(parsed),
      false,
      "MALFORMED_PAYLOAD",
    );
    return { status: 400, reason: "MALFORMED_PAYLOAD" };
  }

  return prisma.$transaction(
    async (tx) => {
      const { auditId, duplicate } = await acquireAuditRow(
        tx,
        eventId,
        eventType,
        safeEventSummary(parsed),
      );
      if (duplicate) {
        return { status: 200, reason: "DUPLICATE" };
      }

      // Known-but-unhandled providers (contact.* / domain.* / suppression.*
      // or a future email.* type) are acknowledged; nothing is acted on.
      if (!KNOWN_EMAIL_EVENTS.has(eventType)) {
        await tx.webhookEvent.update({
          where: { id: auditId },
          data: { processed: true, error: "UNHANDLED_EVENT_TYPE" },
        });
        return { status: 200, reason: "UNHANDLED_EVENT_TYPE" };
      }

      // Acknowledged delivery event. No further side effect exists yet: the
      // body's addresses/tokens are never used for user/verification state.
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "SUCCESS" },
      });
      console.info("resend-webhook: processed", { eventId, eventType });
      return { status: 200, reason: "SUCCESS" };
    },
    { maxWait: 10000, timeout: 30000 },
  );
}

interface AuditRowOutcome {
  auditId: string;
  duplicate: boolean;
}

/**
 * Races for the durable WebhookEvent row (INSERT ... ON CONFLICT DO NOTHING so
 * a lost race never aborts the transaction — Postgres 25P02). The winner
 * processes; concurrent or later duplicates of the same `webhook-id` are
 * acknowledged idempotently, and a stale unprocessed row is taken over.
 */
async function acquireAuditRow(
  tx: Prisma.TransactionClient,
  eventId: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
): Promise<AuditRowOutcome> {
  const inserted = await tx.webhookEvent.createMany({
    data: [
      {
        eventId,
        eventType,
        payload,
        signatureValid: true,
        processed: false,
      },
    ],
    skipDuplicates: true,
  });

  if (inserted.count === 1) {
    const row = await tx.webhookEvent.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!row) throw new Error("Resend webhook audit row missing after insert");
    return { auditId: row.id, duplicate: false };
  }

  const existing = await tx.webhookEvent.findUnique({
    where: { eventId },
    select: { id: true, processed: true },
  });
  if (!existing) throw new Error("Resend webhook audit row missing on duplicate");
  if (existing.processed) {
    return { auditId: existing.id, duplicate: true };
  }
  // A previously committed *unprocessed* row (e.g. an acknowledged malformed
  // delivery) — take ownership and reprocess this delivery.
  return { auditId: existing.id, duplicate: false };
}