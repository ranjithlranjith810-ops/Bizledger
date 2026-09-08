import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireBusinessRole,
} from "@/lib/business/business-service";
import {
  findPaymentByOrderId,
  verifyPaymentForBusiness,
} from "@/lib/billing/payment-verification-service";
import {
  handleApiError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/business/api-error";

// POST /api/billing/payment/verify — payment verification for Razorpay
// Standard Checkout (Phase 4E).
//
//   Body:   { razorpay_payment_id, razorpay_order_id, razorpay_signature }
//           (provider identifiers ONLY — no amounts, no plan, no businessId)
//   Auth:   required (401 when anonymous)
//   Tenant: the owning business is resolved FROM the stored PaymentRecord by
//           orderId — never from the request. The session user must be an
//           OWNER/ADMIN ACTIVE member of THAT business (404 non-member / 403
//           lower role). An attacker cannot verify another business's order by
//           id alone.
//   State:  CREATED → VERIFIED + paymentId stored, ONLY after server-side
//           HMAC-SHA256 signature verification succeeds. Idempotent repeats
//           return the same success; a VERIFIED record with a different
//           paymentId is rejected. BusinessSubscription stays PENDING — durable
//           activation belongs to Phase 4F.
export async function POST(request: NextRequest) {
  try {
    const body: Record<string, unknown> | null = await request
      .json()
      .catch(() => null);
    const paymentId =
      body && typeof body.razorpay_payment_id === "string"
        ? body.razorpay_payment_id
        : "";
    const orderId =
      body && typeof body.razorpay_order_id === "string"
        ? body.razorpay_order_id
        : "";
    const signature =
      body && typeof body.razorpay_signature === "string"
        ? body.razorpay_signature
        : "";

    if (paymentId.length === 0) {
      throw new ValidationError("razorpay_payment_id is required");
    }
    if (orderId.length === 0) {
      throw new ValidationError("razorpay_order_id is required");
    }
    if (signature.length === 0) {
      throw new ValidationError("razorpay_signature is required");
    }

    // Resolve the owning business from the STORED record. Order ids are global;
    // the membership gate on the record's business is what defeats
    // cross-business reuse of a payment/order.
    const record = await findPaymentByOrderId(orderId);
    if (!record) {
      throw new ResourceNotFoundError("Payment not found");
    }

    const { membership, business } = await requireBusinessRole(record.businessId, [
      "OWNER",
      "ADMIN",
    ]);
    if (membership.status !== "ACTIVE") {
      throw new ForbiddenError("Membership is not active");
    }
    if (business.status !== "ACTIVE") {
      throw new ForbiddenError("Business is not active");
    }

    const result = await verifyPaymentForBusiness(record.businessId, {
      orderId,
      paymentId,
      signature,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}