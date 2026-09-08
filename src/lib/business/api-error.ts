// Shared minimal error handler for the business/tenancy API surface.
// Maps service-layer failures to HTTP statuses without leaking internal
// details. Lives outside the route module so it can be shared by multiple
// route files without violating the App Router "only route handlers" rule.
import "server-only";
import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/business/tenant";
import {
  BusinessNotFoundError,
  ForbiddenError,
} from "@/lib/business/business-service";
import {
  BillingPeriodError,
  BillingAmountError,
} from "@/lib/billing/calculator";
import {
  RazorpayApiError,
  RazorpayConfigError,
} from "@/lib/billing/razorpay";

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

export function handleApiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
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
  console.error("Unexpected API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
