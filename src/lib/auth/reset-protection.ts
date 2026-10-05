// Server-only reset-protection helpers implementing the approved fixes:
//
//   consumeEmailResetBudget  — per-normalized-email reset rate-limit bucket
//                              (Fix 3). Independent of Better Auth's per-IP
//                              bucket; keyed by a SHA-256 digest of the
//                              normalized email so the rate_limit table never
//                              stores plaintext addresses. Applies equally to
//                              known and unknown addresses, so it can never
//                              reveal whether an account exists.
//
//   invalidatePriorResetTokens — before a new reset token is minted, delete any
//                              earlier `reset-password:*` verification rows for
//                              the same user (Fix 2). Email-verification rows
//                              are untouched.
//
// The DB schema is Better Auth's own `rate_limit` table (unique `key`, `count`,
// `lastRequest` BigInt ms) with a distinct key prefix so the two systems never
// collide. Window/limit mirror the /request-password-reset IP rule (300s / 5).

import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/email-validation";

export const EMAIL_RESET_WINDOW_SECONDS = 300;
export const EMAIL_RESET_MAX_PER_WINDOW = 5;
export const RESET_RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";

const RESET_PREFIX = "reset-password:";
const EMAIL_BUCKET_PREFIX = "email-reset:";
// A value that can never match a real user id, keeping the invalidation query a
// uniform DB round trip for addresses that have no account (no timing tell).
const NO_USER_VALUE = "00000000-0000-0000-0000-000000000000";

/** Deterministic rate-limit key for one normalized email (hashed, never raw). */
export function resetEmailBucketKey(email: string): string {
  const normalized = normalizeEmail(email);
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `${EMAIL_BUCKET_PREFIX}${digest}`;
}

export interface ResetBudgetDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Consume one unit of the per-email reset budget. Mirrors the fixed-window
 * semantics of Better Auth's database-backed limiter so both buckets agree:
 * a request inside the window increments `count` while `count < max`, a request
 * outside the window restarts the window. Returns { allowed: false } with a
 * retry delay once the email has hit `max` requests in `windowSeconds`.
 */
export async function consumeEmailResetBudget(
  email: string,
  windowSeconds: number = EMAIL_RESET_WINDOW_SECONDS,
  max: number = EMAIL_RESET_MAX_PER_WINDOW,
): Promise<ResetBudgetDecision> {
  const key = resetEmailBucketKey(email);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row) {
      try {
        await prisma.rateLimit.create({ data: { key, count: 1, lastRequest: BigInt(now) } });
        return { allowed: true };
      } catch {
        // Another request created the row in the same instant; re-read.
        continue;
      }
    }
    const last = Number(row.lastRequest);
    if (now - last >= windowMs) {
      await prisma.rateLimit.updateMany({
        where: { key, lastRequest: { lte: row.lastRequest } },
        data: { count: 1, lastRequest: BigInt(now) },
      });
      return { allowed: true };
    }
    if (row.count < max) {
      const updated = await prisma.rateLimit.updateMany({
        where: { key, count: { lt: max }, lastRequest: row.lastRequest },
        data: { count: { increment: 1 }, lastRequest: BigInt(now) },
      });
      if (updated.count === 1) return { allowed: true };
      continue; // lost an increment race; re-read.
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - last)) / 1000)),
    };
  }
  // Persistent race with the unique key (effectively unreachable): fail open so
  // a storage hiccup can never turn into a self-inflicted lockout.
  return { allowed: true };
}

/**
 * Delete every earlier `reset-password:*` verification row for the normalized
 * email's user so only the single newest token survives. Safe when the address
 * has no account (uniform no-op query). Email-verification tokens never match
 * the `reset-password:` prefix and are left untouched.
 */
export async function invalidatePriorResetTokens(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  const value = user?.id ?? NO_USER_VALUE;
  await prisma.verification.deleteMany({
    where: {
      value,
      identifier: { startsWith: RESET_PREFIX },
    },
  });
}