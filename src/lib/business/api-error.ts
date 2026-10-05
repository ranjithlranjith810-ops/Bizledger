// Shared minimal error handler for the business/tenancy API surface.
// Maps service-layer failures to HTTP statuses without leaking internal
// details. Lives outside the route module so it can be shared by multiple
// route files without violating the App Router "only route handlers" rule.
import "server-only";
import { NextResponse } from "next/server";
import { SuspendedUserError, UnauthorizedError } from "@/lib/business/tenant";
import {
  BusinessNotFoundError,
  ForbiddenError,
  DuplicateBusinessError,
  GstinValidationError,
  ProfileValidationError,
} from "@/lib/business/business-service";
import {
  BillingPeriodError,
  BillingAmountError,
} from "@/lib/billing/calculator";
import {
  RazorpayApiError,
  RazorpayConfigError,
} from "@/lib/billing/razorpay";
import {
  EntitlementDeniedError,
  FeatureDeniedError,
} from "@/lib/billing/entitlements-server";
import { Prisma } from "@/generated/prisma/client";

/**
 * Request-payload validation failure. Mapped to 400 Bad Request.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * A requested resource (customer/product) was not found within the caller's
 * own business. Mapped to 404. No difference is disclosed between a
 * nonexistent id and a resource that belongs to another tenant.
 */
export class ResourceNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

/**
 * A uniqueness/constraint violation (e.g. duplicate business-scoped value).
 * Mapped to 409 Conflict.
 */
export class DuplicateResourceError extends Error {
  constructor(message = "Resource already exists") {
    super(message);
    this.name = "DuplicateResourceError";
  }
}

/**
 * A state/transition conflict (e.g. deleting an issued document, or a
 * moderation transition that the current status does not permit). Mapped to
 * 409 Conflict, distinct from a client validation problem (400).
 */
export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Rate limit exceeded for a protected route. Mapped to 429 with a sanitized
 * body (no bucket/limit internals disclosed).
 */
export class RateLimitExceededError extends Error {
  constructor(message = "Too many requests. Please try again later.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (error instanceof SuspendedUserError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof BusinessNotFoundError) {
    return NextResponse.json({ error: "Business not found or access denied" }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof BillingPeriodError) {
    return NextResponse.json(
      { error: "Invalid billing period. Use 'month' or 'year'." },
      { status: 400 },
    );
  }
  if (error instanceof BillingAmountError) {
    return NextResponse.json({ error: "Invalid billing amount" }, { status: 400 });
  }
  if (error instanceof ResourceNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof DuplicateResourceError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof DuplicateBusinessError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof GstinValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ProfileValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }
  // Plan-ceiling denial (Security Hardening 1 — F3). 403 with a stable,
  // machine-readable payload the frontend can map to an upgrade banner. No
  // subscription row/plan/payment internals are disclosed.
  if (error instanceof EntitlementDeniedError) {
    return NextResponse.json(
      {
        error: "Plan limit reached",
        code: "ENTITLEMENT_LIMIT",
        kind: error.kind,
        limit: error.limit,
        used: error.used,
      },
      { status: 403 },
    );
  }
  // Feature-entitlement denial (Phase 9C-4). 403 with a stable, machine-readable
  // payload naming the registered feature; no plan internals are disclosed.
  if (error instanceof FeatureDeniedError) {
    return NextResponse.json(
      {
        error: "Feature not enabled on this plan",
        code: "ENTITLEMENT_FEATURE",
        feature: error.feature,
      },
      { status: 403 },
    );
  }
  // Upstream provider failures are ALREADY sanitized by the Razorpay provider
  // (never carry secrets/headers). Config gaps are environmental, not client
  // faults — 503; API failures are upstream — 502.
  if (error instanceof RazorpayConfigError) {
    return NextResponse.json({ error: "Billing provider is not configured" }, { status: 503 });
  }
  if (error instanceof RazorpayApiError) {
    return NextResponse.json({ error: "Billing provider error" }, { status: 502 });
  }
  // Prisma "record not found" (row deleted between lookup and mutation, or a
  // filter never matched). Mapped to 404 so a race or stale id degrades to a
  // normal missing-resource response instead of an internal error.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }
  // Any OTHER Prisma unique-constraint violation that escaped its service's
  // specific handling: map to 409 with a generic message rather than exposing
  // database internals as a 500. (GSTIN duplicates are already converted to
  // DuplicateBusinessError with the exact end-user message before this.)
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      { error: "A record with this value already exists." },
      { status: 409 },
    );
  }
  // Never log the raw error/stack: an unexpected failure may embed request or
  // database details. Log a sanitized summary and return a generic message.
  console.error("Unexpected API error:", {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message.slice(0, 500) : "non-Error thrown",
  });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
