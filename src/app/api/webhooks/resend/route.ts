import { NextRequest, NextResponse } from "next/server";
import {
  processResendWebhook,
  ResendConfigError,
} from "@/lib/email/resend-webhook-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/webhooks/resend — Resend delivery-event webhook (Standard Webhooks
// / Svix signature).
//
//   Auth:        NONE (no Better Auth). Authority = Svix Ed25519-style signed
//                message over the raw body using RESEND_WEBHOOK_SECRET.
//   Body:        read as RAW TEXT (request.text()) and signed as-is.
//   Headers:     webhook-id (required, = idempotency key),
//                webhook-timestamp (required, 5-min tolerance window),
//                webhook-signature (required).
//   Responses:   minimal `{ received: true }` (200) for every durable outcome;
//                generic 400 for invalid signature/malformed payload; 503 when
//                RESEND_WEBHOOK_SECRET is not configured; 500+ for retryable
//                DB failures. No records, ids, signatures, or secrets echoed.
//
// The App Router returns 405 automatically for non-POST methods.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const id = request.headers.get("webhook-id")?.trim() ?? "";
    const timestamp = request.headers.get("webhook-timestamp")?.trim() ?? "";
    const signature = request.headers.get("webhook-signature")?.trim() ?? "";

    const result = await processResendWebhook({
      rawBody,
      headers: { id, timestamp, signature },
    });

    if (result.status === 400) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ResendConfigError) {
      return NextResponse.json(
        { error: "Email webhook is not configured" },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}