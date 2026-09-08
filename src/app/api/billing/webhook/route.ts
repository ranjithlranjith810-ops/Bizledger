import { NextRequest, NextResponse } from "next/server";
import { processWebhook } from "@/lib/billing/webhook-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/billing/webhook — Razorpay webhook → durable payment confirmation
// → subscription activation (Phase 4F).
//
//   Auth:        NONE (no Better Auth). Authority = Razorpay HMAC signature
//                + reconciliation against the server-stored PaymentRecord.
//   Body:        read as RAW TEXT (request.text()) and signed as-is.
//   Headers:     X-Razorpay-Signature (required), x-razorpay-event-id (required
//                for idempotency).
//   Money:       amount/currency/plan/business NEVER come from the body — all
//                resolve from the stored record. Mismatches never activate.
//   Responses:   minimal `{ received: true }` (200) for every durable outcome;
//                generic 400 for invalid signature/malformed payload; 503 when
//                the webhook secret is not configured; 500+ for retryable DB
//                failures. No records, ids, signatures, or secrets are echoed.
//
// The App Router returns 405 automatically for non-POST methods.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature")?.trim() ?? "";
    const eventId = request.headers.get("x-razorpay-event-id")?.trim() ?? "";

    const result = await processWebhook({ rawBody, signature, eventId });

    if (result.status === 400) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}