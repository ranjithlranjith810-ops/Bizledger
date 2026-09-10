// Phase 4F — Razorpay webhook → durable payment confirmation → subscription
// activation.
//
// FLOW:
//   1. config gate            — webhook signing secret must be configured (503)
//   2. input shape            — signature + event id headers (400)
//   3. signature              — HMAC-SHA256(rawBody, WEBHOOK_SECRET) (400, no
//                               persistence, no internals leaked)
//   4. parse                  — JSON AFTER the signature check (400)
//   5. idempotency            — one durable WebhookEvent per `eventId`; the
//                               unique index turns concurrent repeats into a
//                               single winner (duplicates → safe 200)
//   6. reconcile              — PaymentRecord by razorpay orderId; amount paise
//                               and INR are compared against the STORED totals
//                               (the webhook never supplies money values)
//   7. activate               — PENDING → ACTIVE subscription, exactly one
//                               SubscriptionEvent per activation
//
// AUTHORITY: nothing here trusts the webhook body for business/plan/amount/
// currency/subscription identity. Those all resolve from the server-stored
// PaymentRecord + BusinessSubscription. A webhook can only ever confirm or
// fail what was already created by Phase 4D/4E checkout — it cannot create
// orders, subscriptions, plans, or money values.
//
// MONOTONIC STATE MACHINE (never downgrades success):
//   CREATED|FAILED --payment.captured|order.paid--> VERIFIED --> ACTIVE
//   CREATED        --payment.failed---------------> FAILED
//   VERIFIED       --payment.failed---------------> stays VERIFIED
//   ACTIVE         --duplicate capture------------> stays ACTIVE (no 2nd event)
//   FAILED         --payment.captured-------------> VERIFIED + ACTIVATE (OOO)
//
// RETRY SEMANTICS: genuine DB/processing failures propagate out of the
// transaction (rollback → non-2xx → Razorpay retries; the WebhookEvent row is
// never committed as processed). Everything that is a durable *result* (a
// known order with a business conflict, amount mismatch, unknown order, or a
// skipped event type) is persisted with `processed=true` and acknowledged —
// an attacker or a misconfigured webhook cannot make Razorpay retry forever.

import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  RazorpayConfigError,
  verifyWebhookSignature as defaultVerifyWebhookSignature,
  webhookConfigured,
} from "@/lib/billing/razorpay";
import { inrToPaise, moneyString } from "@/lib/billing/calculator";
import {
  capturedAtFromEntity,
  extractSafePaymentMethod,
  mintBillingInvoice,
  type BillingPaymentMethod,
} from "@/lib/billing/billing-invoice-service";
import { ValidationError } from "@/lib/business/api-error";
import { PaymentStatus, SubscriptionStatus } from "@/generated/prisma/enums";
import { computeSubscriptionLifecycle } from "@/lib/plans";
import { getActivePlanForBilling } from "@/lib/billing/plan-service";

export interface WebhookInput {
  rawBody: string;
  signature: string;
  eventId: string;
}

export type WebhookReason =
  | "INVALID_SIGNATURE"
  | "MALFORMED_JSON"
  | "MALFORMED_PAYLOAD"
  | "DUPLICATE"
  | "UNHANDLED_EVENT_TYPE"
  | "SUCCESS"
  | "ALREADY_ACTIVE"
  | "UNKNOWN_ORDER"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "PAYMENT_ID_CONFLICT"
  | "FAILED_AFTER_SUCCESS"
  | "FAILED"
  | "FAILED_IDEMPOTENT"
  | "FAILED_PAYMENT_ID_CONFLICT"
  | "NO_SUBSCRIPTION"
  | "PLAN_MISMATCH"
  | "PLAN_UNAVAILABLE"
  | "UNEXPECTED_ACTIVATION_STATE"
  | "UNEXPECTED_STATE"
  | "ACTIVATION_CONFLICT";

export interface WebhookResult {
  status: 200 | 400;
  reason: WebhookReason;
  activated: boolean;
}

/** Webhook events that may activate a subscription. */
const ACTIVATING_EVENTS = new Set(["payment.captured", "order.paid"]);
/** Webhook events that may only fail a payment (never activate). */
const FAILING_EVENTS = new Set(["payment.failed"]);

const SELECT_RECORD = {
  id: true,
  businessId: true,
  planId: true,
  subscriptionId: true,
  status: true,
  paymentId: true,
  orderId: true,
  currency: true,
  totalAmount: true,
  planName: true,
  billingPeriod: true,
} as const;

type PaymentRow = Prisma.PaymentRecordGetPayload<{
  select: typeof SELECT_RECORD;
}>;

interface ExtractedEntity {
  orderId: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  /** Allowlisted payment method (card/netbanking/upi/wallet/emi) or null. */
  method: BillingPaymentMethod | null;
  /** Razorpay `captured_at` (unix seconds) as a Date, or null when absent. */
  capturedAt: Date | null;
}

const GENERIC_ERROR = "Invalid webhook payload";

function isP2002(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Extracts orderId / paymentId / amount / currency from a Razorpay webhook
 * payload for a SUPPORTED event. Returns null when the required shape is
 * missing or the amount is not a positive integer paise value (currency is
 * returned as-is; the reconcile layer decides whether it matches INR).
 */
function extractEntity(
  parsed: unknown,
  eventType: string,
): ExtractedEntity | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.payload !== "object" || root.payload === null) return null;
  const wrapper =
    eventType === "order.paid"
      ? (root.payload as Record<string, unknown>).order
      : (root.payload as Record<string, unknown>).payment;
  const entity =
    typeof wrapper === "object" && wrapper !== null
      ? (wrapper as Record<string, unknown>).entity
      : null;
  if (typeof entity !== "object" || entity === null) return null;
  const e = entity as Record<string, unknown>;

  const amount = e.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  const currency = e.currency;
  if (typeof currency !== "string" || currency.length === 0) return null;

  const orderId = eventType === "order.paid" ? e.id : e.order_id;
  if (typeof orderId !== "string" || orderId.length === 0) return null;

  const paymentId = eventType === "order.paid" ? null : e.id;
  if (
    paymentId !== null &&
    (typeof paymentId !== "string" || paymentId.length === 0)
  ) {
    return null;
  }

  return {
    orderId,
    paymentId,
    amount,
    currency,
    method: extractSafePaymentMethod(e.method),
    capturedAt: capturedAtFromEntity(e.captured_at),
  };
}

/** Persists an audit row for a request rejected before the transaction. */
async function persistRecoverable(
  eventId: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
  processed: boolean,
  error: string,
): Promise<void> {
  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType,
        payload,
        signatureValid: true,
        processed,
        error,
      },
    });
  } catch (err) {
    // The same durable event was already recorded by another delivery — fine.
    if (!isP2002(err)) throw err;
  }
}

/**
 * Processes a signed Razorpay webhook. Throws ValidationError (400) for
 * missing inputs and RazorpayConfigError (503) when the webhook secret is not
 * configured. Returns a WebhookResult for every durable outcome.
 */
export async function processWebhook(
  input: WebhookInput,
): Promise<WebhookResult> {
  const { rawBody, signature, eventId } = input;

  if (!webhookConfigured()) {
    throw new RazorpayConfigError(["RAZORPAY_WEBHOOK_SECRET"]);
  }
  if (!eventId || typeof eventId !== "string" || eventId.length === 0) {
    throw new ValidationError(GENERIC_ERROR);
  }
  if (typeof signature !== "string" || signature.length === 0) {
    throw new ValidationError(GENERIC_ERROR);
  }
  if (typeof rawBody !== "string" || rawBody.length === 0) {
    throw new ValidationError(GENERIC_ERROR);
  }

  // Signature first, over the RAW body. Never persisted, never explained.
  if (!defaultVerifyWebhookSignature({ rawBody, signature })) {
    return { status: 400, reason: "INVALID_SIGNATURE", activated: false };
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
    return { status: 400, reason: "MALFORMED_JSON", activated: false };
  }

  const root = parsed as Record<string, unknown> | null;
  const eventType = typeof root?.event === "string" ? root.event : null;
  const isValidEventEnvelope =
    root !== null &&
    typeof root.entity === "string" &&
    root.entity === "event" &&
    eventType !== null;

  if (!isValidEventEnvelope) {
    await persistRecoverable(
      eventId,
      eventType ?? "unknown",
      parsed as Prisma.InputJsonValue,
      false,
      "MALFORMED_PAYLOAD",
    );
    return { status: 400, reason: "MALFORMED_PAYLOAD", activated: false };
  }

  // Prisma's default interactive-transaction timeout is 5s. Minting a billing
  // invoice allocates a platform-global sequence number inside this SAME
  // transaction, so parallel Razorpay deliveries briefly contend on the
  // billing_sequence row lock; over the Supabase pooler that can push a single
  // delivery past 5s and expire the transaction (a 500 that Razorpay retries).
  // Bump the timeout so genuine parallel deliveries commit instead of rolling
  // back — idempotency (eventId @@unique + paymentId @@unique) keeps retries safe.
  return prisma.$transaction(
    async (tx) => {
    const { auditId, duplicate } = await acquireAuditRow(
      tx,
      eventId,
      eventType as string,
      parsed as Prisma.InputJsonValue,
    );
    if (duplicate) {
      return { status: 200, reason: "DUPLICATE", activated: false };
    }

    const handledType = eventType as string;
    const isActivating = ACTIVATING_EVENTS.has(handledType);
    const isFailing = FAILING_EVENTS.has(handledType);

    // Known-but-ignored event types are acknowledged; nothing is reconciled.
    if (!isActivating && !isFailing) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "UNHANDLED_EVENT_TYPE" },
      });
      return {
        status: 200,
        reason: "UNHANDLED_EVENT_TYPE",
        activated: false,
      };
    }

    const entity = extractEntity(parsed, handledType);
    if (!entity) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: false, error: "MALFORMED_PAYLOAD" },
      });
      return { status: 400, reason: "MALFORMED_PAYLOAD", activated: false };
    }

    const record = await tx.paymentRecord.findFirst({
      where: { orderId: entity.orderId },
      orderBy: { createdAt: "desc" },
      select: SELECT_RECORD,
    });

    // An order we have never seen. Acknowledge to stop retries; NEVER
    // auto-provision subscriptions/payments/plans from a webhook body.
    if (!record) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "UNKNOWN_ORDER" },
      });
      return { status: 200, reason: "UNKNOWN_ORDER", activated: false };
    }

    const reconsiled = await reconcileRecord(
      tx,
      auditId,
      record,
      entity,
      isFailing,
    );
    if (reconsiled.reason !== "SUCCESS") {
      return { status: 200, reason: reconsiled.reason, activated: false };
    }

    // Failure events never activate; reconcile already applied the FAILED mark.
    if (isFailing) {
      return { status: 200, reason: "FAILED", activated: false };
    }

    // Success path: the record is safely VERIFIED — ding the subscription.
    const activation = await activateSubscription(
      tx,
      auditId,
      eventId,
      record,
    );
    if (activation.type === "blocked") {
      return { status: 200, reason: activation.reason, activated: false };
    }

    // Phase 6A — mint the Billing Invoice / Payment Receipt inside the SAME
    // transaction that activated the subscription (exactly once per verified
    // payment; ALREADY_ACTIVE never reaches here, so historical VERIFIED rows
    // are never backfilled). A mint failure rolls the whole webhook back and
    // Razorpay retries safely — the paymentId @@unique + pre-check keep a
    // retried delivery idempotent. Amounts are copied from the stored record,
    // never the webhook body.
    const paymentDate =
      entity.capturedAt ?? new Date();
    await mintBillingInvoice(tx, {
      paymentId: record.id,
      subscriptionId: activation.subscriptionId,
      paymentDate,
      paymentMethod: entity.method,
    });

    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "SUCCESS" },
    });
    console.info("webhook: processed", {
      eventId,
      eventType: handledType,
      orderId: entity.orderId,
      activated: true,
    });
    return { status: 200, reason: "SUCCESS", activated: true };
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
 * processes; concurrent or later duplicates of the same `eventId` are
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
    if (!row) throw new Error("Webhook audit row missing after insert");
    return { auditId: row.id, duplicate: false };
  }

  const existing = await tx.webhookEvent.findUnique({
    where: { eventId },
    select: { id: true, processed: true },
  });
  if (!existing) throw new Error("Webhook audit row missing on duplicate");
  if (existing.processed) {
    return { auditId: existing.id, duplicate: true };
  }
  // A previously committed *unprocessed* row (e.g. an acknowledged malformed
  // delivery) — take ownership and reprocess this delivery.
  return { auditId: existing.id, duplicate: false };
}

/**
 * Reconciles a payment success/failure against the stored record. Money and
 * currency mismatches and payment-id conflicts never write the record. Returns
 * reason "SUCCESS" only when the payment is safely in VERIFIED (success path)
 * or got the FAILED mark (failure path).
 */
async function reconcileRecord(
  tx: Prisma.TransactionClient,
  auditId: string,
  record: PaymentRow,
  entity: ExtractedEntity,
  failurePath: boolean,
): Promise<{ reason: WebhookReason }> {
  // Amount authority: the STORED total, never the webhook.
  let expectedPaise: number;
  try {
    expectedPaise = inrToPaise(record.totalAmount);
  } catch {
    console.error("webhook: stored total is not a valid amount", record.id);
    throw new Error("Stored billing total is invalid");
  }

  if (expectedPaise !== entity.amount) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "AMOUNT_MISMATCH" },
    });
    return { reason: "AMOUNT_MISMATCH" };
  }
  if (record.currency !== "INR" || entity.currency !== "INR") {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "CURRENCY_MISMATCH" },
    });
    return { reason: "CURRENCY_MISMATCH" };
  }

  const webhookPaymentId = entity.paymentId;
  const storedPaymentId = record.paymentId;
  // CASE A null->store / CASE B same->continue / CASE C different->conflict.
  const paymentIdConflict =
    storedPaymentId !== null &&
    webhookPaymentId !== null &&
    storedPaymentId !== webhookPaymentId;

  if (failurePath) {
    if (
      record.status === PaymentStatus.VERIFIED ||
      record.status === PaymentStatus.CANCELLED
    ) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "FAILED_AFTER_SUCCESS" },
      });
      return { reason: "FAILED_AFTER_SUCCESS" };
    }
    if (paymentIdConflict) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "FAILED_PAYMENT_ID_CONFLICT" },
      });
      return { reason: "FAILED_PAYMENT_ID_CONFLICT" };
    }
    if (record.status === PaymentStatus.FAILED) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "FAILED_IDEMPOTENT" },
      });
      return { reason: "FAILED_IDEMPOTENT" };
    }
    const updated = await tx.paymentRecord.updateMany({
      where: { id: record.id, status: PaymentStatus.CREATED },
      data: {
        status: PaymentStatus.FAILED,
        ...(webhookPaymentId ? { paymentId: webhookPaymentId } : {}),
      },
    });
    if (updated.count === 0) {
      // Raced with a success promotion — read the committed winner.
      const current = await tx.paymentRecord.findUnique({
        where: { id: record.id },
        select: { status: true },
      });
      if (current?.status === PaymentStatus.VERIFIED) {
        await tx.webhookEvent.update({
          where: { id: auditId },
          data: { processed: true, error: "FAILED_AFTER_SUCCESS" },
        });
        return { reason: "FAILED_AFTER_SUCCESS" };
      }
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "FAILED_IDEMPOTENT" },
      });
      return { reason: "FAILED_IDEMPOTENT" };
    }
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "FAILED" },
    });
    return { reason: "SUCCESS" };
  }

  // ---- Success path (payment.captured / order.paid) ----
  if (record.status === PaymentStatus.VERIFIED) {
    if (paymentIdConflict) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "PAYMENT_ID_CONFLICT" },
      });
      return { reason: "PAYMENT_ID_CONFLICT" };
    }
    // Same (or no) payment id — already VERIFIED. No downgrade, no overwrite.
    return { reason: "SUCCESS" };
  }

  if (record.status === PaymentStatus.CANCELLED) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "UNEXPECTED_STATE" },
    });
    return { reason: "UNEXPECTED_STATE" };
  }

  // CREATED or FAILED → promote, storing the paymentId only when it was null.
  const updated = await tx.paymentRecord.updateMany({
    where: {
      id: record.id,
      status: { in: [PaymentStatus.CREATED, PaymentStatus.FAILED] },
    },
    data: {
      status: PaymentStatus.VERIFIED,
      ...(webhookPaymentId ? { paymentId: webhookPaymentId } : {}),
    },
  });
  if (updated.count === 0) {
    const current = await tx.paymentRecord.findUnique({
      where: { id: record.id },
      select: { status: true, paymentId: true },
    });
    if (
      current?.status === PaymentStatus.VERIFIED &&
      (webhookPaymentId === null ||
        current.paymentId === null ||
        current.paymentId === webhookPaymentId)
    ) {
      return { reason: "SUCCESS" };
    }
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "PAYMENT_ID_CONFLICT" },
    });
    return { reason: "PAYMENT_ID_CONFLICT" };
  }
  return { reason: "SUCCESS" };
}

type ActivationOutcome =
  | { type: "activated"; subscriptionId: string }
  | { type: "blocked"; reason: WebhookReason };

/**
 * Activates a subscription after a VERIFIED payment. Exactly ONE
 * SubscriptionEvent is recorded; already-ACTIVE subscriptions stay ACTIVE with
 * no second activation record; other statuses are never resurrected.
 *
 * Two activation modes:
 *   LINKED  (subscriptionId set — first-time purchase)  → promote PENDING→ACTIVE.
 *   UNLINKED (subscriptionId null — renewal/upgrade after the paid period,
 *   Phase 7): never a row mutation of a possibly-fine subscription. The prior
 *   governing ACTIVE row is retired to EXPIRED and a brand-new ACTIVE row for
 *   the paid plan is created, and the payment is linked to it — atomically —
 *   ONLY after the money has been verified (the old row stays raw-ACTIVE the
 *   whole time between checkout and webhook success).
 */
async function activateSubscription(
  tx: Prisma.TransactionClient,
  auditId: string,
  eventId: string,
  record: PaymentRow,
): Promise<ActivationOutcome> {
  if (record.subscriptionId === null) {
    return activateRenewal(tx, auditId, eventId, record);
  }

  let matched = await tx.businessSubscription.findUnique({
    where: { id: record.subscriptionId },
  });

  if (!matched) {
    matched = await tx.businessSubscription.findFirst({
      where: {
        businessId: record.businessId,
        planId: record.planId,
        status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!matched) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "NO_SUBSCRIPTION" },
    });
    return { type: "blocked", reason: "NO_SUBSCRIPTION" };
  }
  if (matched.planId !== record.planId) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "PLAN_MISMATCH" },
    });
    return { type: "blocked", reason: "PLAN_MISMATCH" };
  }

  if (matched.status === SubscriptionStatus.ACTIVE) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "ALREADY_ACTIVE" },
    });
    return { type: "blocked", reason: "ALREADY_ACTIVE" };
  }

  if (matched.status !== SubscriptionStatus.PENDING) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "UNEXPECTED_ACTIVATION_STATE" },
    });
    return { type: "blocked", reason: "UNEXPECTED_ACTIVATION_STATE" };
  }

  const startedAt = matched.startedAt ?? new Date();
  // Renewal is driven by the STORED billing period (authoritative), never the
  // body: month → +30 days, year → +365 days (mirrors AppContext's ambiguity-
  // free renewal math so the billing UI's "Renews on" never goes blank).
  const renewalDays = record.billingPeriod === "year" ? 365 : 30;
  const renewsAt = new Date(startedAt.getTime() + renewalDays * 86400000);

  const promoted = await tx.businessSubscription.updateMany({
    where: { id: matched.id, status: SubscriptionStatus.PENDING },
    data: {
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewsAt,
    },
  });

  if (promoted.count === 0) {
    // Raced with a concurrent activation — read the committed state.
    const winner = await tx.businessSubscription.findUnique({
      where: { id: matched.id },
      select: { status: true },
    });
    if (winner?.status === SubscriptionStatus.ACTIVE) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "ALREADY_ACTIVE" },
      });
      return { type: "blocked", reason: "ALREADY_ACTIVE" };
    }
    return { type: "blocked", reason: "ACTIVATION_CONFLICT" };
  }

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: matched.id,
      type: "activation",
      payload: {
        businessId: record.businessId,
        planId: record.planId,
        planName: record.planName,
        billingPeriod: record.billingPeriod,
        subscriptionId: matched.id,
        status: "ACTIVE",
        orderId: record.orderId,
        paymentId: record.paymentId,
        webhookEventId: eventId,
        activatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  return { type: "activated", subscriptionId: matched.id };
}

/**
 * Renewal/upgrade activation for an UNLINKED payment (subscriptionId null).
 *
 * The checkout deliberately created NO pending row and left the prior ACTIVE
 * row untouched until now. On a VERIFIED payment this atomically:
 *   1. guards idempotency (a replay already linked the payment → ALREADY_ACTIVE)
 *   2. retires the governing raw-ACTIVE row to EXPIRED — only when its derived
 *      lifecycle is past-paid (GRACE/EXPIRED), never when it is still ACTIVE
 *      (a renewal must not cancel time that is still paid)
 *   3. creates a brand-new ACTIVE row for the STORED plan/period with a fresh
 *      planSnapshot from plan_catalog (never the webhook body)
 *   4. links the payment → created subscription (durable idempotency)
 *   5. records a `superseded` event on the old row and an `activation` event on
 *      the new one (both in this same transaction)
 *
 * Concurrency: two simultaneous renewal webhooks for the same business race on
 * the retire-CAS of the SAME prior row; the loser re-reads the frontier (now the
 * winner's brand-new ACTIVE row) and reports ALREADY_ACTIVE — the one-PENDING-
 * or-ACTIVE partial unique index can never be violated.
 */
async function activateRenewal(
  tx: Prisma.TransactionClient,
  auditId: string,
  eventId: string,
  record: PaymentRow,
): Promise<ActivationOutcome> {
  // Durable idempotency: verify the STORED link state in this transaction — a
  // replay of the same order must not mint a second subscription.
  const fresh = await tx.paymentRecord.findUnique({
    where: { id: record.id },
    select: { subscriptionId: true },
  });
  if (fresh?.subscriptionId) {
    const linked = await tx.businessSubscription.findUnique({
      where: { id: fresh.subscriptionId },
      select: { status: true },
    });
    if (linked?.status === SubscriptionStatus.ACTIVE) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "ALREADY_ACTIVE" },
      });
      return { type: "blocked", reason: "ALREADY_ACTIVE" };
    }
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "ACTIVATION_CONFLICT" },
    });
    return { type: "blocked", reason: "ACTIVATION_CONFLICT" };
  }

  // The governing row is the raw-ACTIVE subscription that was in GRACE/EXPIRED
  // when the customer checked out (expiry is DERIVED, so the row is still
  // ACTIVE — nothing mutated it at checkout).
  const governing = await tx.businessSubscription.findFirst({
    where: {
      businessId: record.businessId,
      status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!governing) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "NO_SUBSCRIPTION" },
    });
    return { type: "blocked", reason: "NO_SUBSCRIPTION" };
  }

  if (governing.status === SubscriptionStatus.PENDING) {
    // A concurrent first-purchase created a PENDING row. This renewal payment
    // was NOT created against it — never hijack another purchase's subscription.
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "UNEXPECTED_ACTIVATION_STATE" },
    });
    return { type: "blocked", reason: "UNEXPECTED_ACTIVATION_STATE" };
  }

  // governing.status === ACTIVE. Retire it ONLY if it has genuinely passed its
  // paid period against the SERVER clock (GRACE/EXPIRED). A still-ACTIVE plan
  // means another renewal already superseded this one → ALREADY_ACTIVE.
  const lifecycle = computeSubscriptionLifecycle(governing.renewsAt, new Date());
  if (lifecycle.status === "ACTIVE") {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "ALREADY_ACTIVE" },
    });
    return { type: "blocked", reason: "ALREADY_ACTIVE" };
  }

  // Plan snapshot authority: the STORED planId (from the PaymentRecord that the
  // checkout -not the webhook- created), read from the ACTIVE plan_catalog. If
  // the plan is no longer purchasable, block rather than invent a snapshot.
  const plan = await getActivePlanForBilling(record.planId);
  if (!plan) {
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "PLAN_UNAVAILABLE" },
    });
    return { type: "blocked", reason: "PLAN_UNAVAILABLE" };
  }

  // Compare-and-swap retire: retires only if the row is STILL the ACTIVE row.
  // The row lock serializes concurrent renewal deliveries for this business.
  const retired = await tx.businessSubscription.updateMany({
    where: { id: governing.id, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.EXPIRED, endedAt: new Date() },
  });

  if (retired.count === 0) {
    // A concurrent renewal already retired this row. Re-evaluate the frontier.
    const frontier = await tx.businessSubscription.findFirst({
      where: {
        businessId: record.businessId,
        status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (frontier?.status === SubscriptionStatus.ACTIVE) {
      await tx.webhookEvent.update({
        where: { id: auditId },
        data: { processed: true, error: "ALREADY_ACTIVE" },
      });
      return { type: "blocked", reason: "ALREADY_ACTIVE" };
    }
    await tx.webhookEvent.update({
      where: { id: auditId },
      data: { processed: true, error: "ACTIVATION_CONFLICT" },
    });
    return { type: "blocked", reason: "ACTIVATION_CONFLICT" };
  }

  const snapshot: Prisma.InputJsonValue = {
    id: plan.id,
    name: plan.name,
    price: moneyString(plan.price),
    period: record.billingPeriod,
    businessNetworkIncluded: plan.businessNetworkIncluded,
    limits: plan.limits,
  } as Prisma.InputJsonValue;

  // Renewal is driven by the STORED billing period (authoritative): month →
  // +30 days, year → +365 days (mirrors AppContext / SubscriptionService).
  const renewalDays = record.billingPeriod === "year" ? 365 : 30;
  const startedAt = new Date();
  const renewsAt = new Date(startedAt.getTime() + renewalDays * 86400000);

  const created = await tx.businessSubscription.create({
    data: {
      businessId: record.businessId,
      planId: record.planId,
      status: SubscriptionStatus.ACTIVE,
      period: record.billingPeriod,
      planSnapshot: snapshot,
      startedAt,
      renewsAt,
    },
    select: { id: true },
  });

  // Link for durable idempotency of later replays/deliveries of the same order.
  await tx.paymentRecord.update({
    where: { id: record.id },
    data: { subscriptionId: created.id },
  });

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: governing.id,
      type: "superseded",
      payload: {
        businessId: record.businessId,
        previousPlanId: governing.planId,
        previousPeriod: governing.period,
        planId: record.planId,
        billingPeriod: record.billingPeriod,
        status: SubscriptionStatus.EXPIRED,
        orderId: record.orderId,
        paymentId: record.paymentId,
        webhookEventId: eventId,
        supersededAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: created.id,
      type: "activation",
      payload: {
        businessId: record.businessId,
        planId: record.planId,
        planName: record.planName,
        billingPeriod: record.billingPeriod,
        subscriptionId: created.id,
        status: SubscriptionStatus.ACTIVE,
        orderId: record.orderId,
        paymentId: record.paymentId,
        webhookEventId: eventId,
        activatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  return { type: "activated", subscriptionId: created.id };
}