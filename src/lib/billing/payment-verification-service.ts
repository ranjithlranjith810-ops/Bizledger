// Phase 4E — payment verification service.
//
// The browser callback is NOT business truth: Razorpay's checkout.js callback
// only proves a payment was *attempted/claimed*. Everything durable happens
// here AFTER server-side HMAC signature verification:
//
//   1. locate the local PaymentRecord by `orderId`
//   2. assert the record belongs to the authorized business (tenant-safe 404)
//   3. idempotently short-circuit an already-VERIFIED record (same paymentId)
//   4. HMAC-SHA256(orderId|paymentId, RAZORPAY_KEY_SECRET)  (Phase 4B provider)
//   5. transition CREATED -> VERIFIED and store `paymentId` — ONLY then
//
// Subscription activation stays Phase 4F (webhook). This service NEVER touches
// BusinessSubscription status, entitlements, or any money/plan fields. The
// verification request contains only provider identifiers + signature — there
// is no client-supplied plan/price/GST/total anywhere in this path; the local
// PaymentRecord (created server-side in Phase 4D) is the authority for those.

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/business/api-error";
import { verifyPaymentSignature as defaultVerifySignature } from "@/lib/billing/razorpay";
import { PaymentStatus } from "@/generated/prisma/enums";

export interface PaymentVerificationInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** The read-only slice of PaymentRecord the verification state machine uses. */
export interface PaymentRecordForVerification {
  id: string;
  businessId: string;
  planId: string;
  subscriptionId: string | null;
  status: PaymentStatus;
  paymentId: string | null;
  orderId: string | null;
  currency: string;
}

export interface PaymentVerificationResult {
  verified: true;
  paymentId: string;
  orderId: string;
  status: "VERIFIED";
}

export interface PaymentVerificationDeps {
  /**
   * Injectable so automated tests never hit the database; the production
   * default resolves the record by orderId.
   */
  findPaymentByOrderId?: (
    orderId: string,
  ) => Promise<PaymentRecordForVerification | null>;
  /**
   * The Phase 4B HMAC verifier. Injectable so tests can assert exact argument
   * shape and simulate both acceptance and rejection.
   */
  verifySignature?: (input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }) => boolean;
  /**
   * The atomic CREATED -> VERIFIED guard. Injectable so unit tests can simulate
   * both the winning write (count 1) and a lost race (count 0).
   */
  markVerified?: (recordId: string, paymentId: string) => Promise<number>;
}

const SELECT_PAYMENT = {
  id: true,
  businessId: true,
  planId: true,
  subscriptionId: true,
  status: true,
  paymentId: true,
  orderId: true,
  currency: true,
} as const;

export async function findPaymentByOrderId(
  orderId: string,
): Promise<PaymentRecordForVerification | null> {
  return prisma.paymentRecord.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: SELECT_PAYMENT,
  });
}

/**
 * Generic, invariant-safe failure message for every rejection in this service.
 * Never reveals expected/computed signatures, HMAC details, or record
 * internals (§19).
 */
const GENERIC_FAILURE = "Payment verification failed";

/**
 * Verifies a payment for a business the caller was ALREADY authorized on by the
 * route (OWNER/ADMIN ACTIVE member). Re-checks tenant ownership here as
 * defense-in-depth — an orderId can never be verified against another
 * business's PaymentRecord.
 *
 * @throws ResourceNotFoundError (404) — unknown order / foreign business
 * @throws ValidationError (400) — missing inputs, invalid signature, or an
 *   unsafe state conflict (e.g. already VERIFIED with a different paymentId)
 */
export async function verifyPaymentForBusiness(
  businessId: string,
  input: PaymentVerificationInput,
  deps: PaymentVerificationDeps = {},
): Promise<PaymentVerificationResult> {
  const findPayment = deps.findPaymentByOrderId ?? findPaymentByOrderId;
  const verifySignature = deps.verifySignature ?? defaultVerifySignature;
  // Resolves to the number of rows updated — 0 means the atomic guard won.
  const markVerified =
    deps.markVerified ??
    (async (recordId: string, paymentIdToStore: string) => {
      const result = await prisma.paymentRecord.updateMany({
        where: { id: recordId, status: PaymentStatus.CREATED },
        data: { status: PaymentStatus.VERIFIED, paymentId: paymentIdToStore },
      });
      return result.count;
    });

  if (!input?.orderId || !input?.paymentId || !input?.signature) {
    throw new ValidationError(GENERIC_FAILURE);
  }
  const { orderId, paymentId, signature } = input;

  const record = await findPayment(orderId);
  if (!record) {
    throw new ResourceNotFoundError(GENERIC_FAILURE);
  }
  // Tenant authority: the record MUST belong to the caller's business. A
  // caller can never act on another business's order by id alone.
  if (record.businessId !== businessId) {
    throw new ResourceNotFoundError(GENERIC_FAILURE);
  }
  if (record.orderId !== orderId) {
    throw new ResourceNotFoundError(GENERIC_FAILURE);
  }

  // Idempotent repeats with the SAME paymentId are a safe success.
  if (record.status === PaymentStatus.VERIFIED) {
    if (record.paymentId === paymentId) {
      return { verified: true, paymentId, orderId, status: "VERIFIED" };
    }
    // Already VERIFIED with a DIFFERENT paymentId — never overwrite the
    // original payment record (§17).
    throw new ValidationError(GENERIC_FAILURE);
  }

  // Only CREATED records may move here. A FAILED/CANCELLED/unknown state is
  // never silently resurrected by a browser retry (§15, §23).
  if (record.status !== PaymentStatus.CREATED) {
    throw new ValidationError(GENERIC_FAILURE);
  }

  if (!verifySignature({ orderId, paymentId, signature })) {
    throw new ValidationError(GENERIC_FAILURE);
  }

  // Atomic guard: only a row still in CREATED can be promoted. Two concurrent
  // requests racing can only ever produce one winner.
  const updated = await markVerified(record.id, paymentId);

  if (updated === 0) {
    // Lost the race. Re-read: if the winner (same paymentId) already marked it
    // VERIFIED, answer idempotently; otherwise reject safely.
    const current = await findPayment(orderId);
    if (
      current?.status === PaymentStatus.VERIFIED &&
      current.paymentId === paymentId
    ) {
      return { verified: true, paymentId, orderId, status: "VERIFIED" };
    }
    throw new ValidationError(GENERIC_FAILURE);
  }

  return { verified: true, paymentId, orderId, status: "VERIFIED" };
}