import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireBusinessRole,
} from "@/lib/business/business-service";
import { createCheckoutForBusiness } from "@/lib/billing/checkout-service";
import { handleApiError, ValidationError } from "@/lib/business/api-error";

// POST /api/billing/checkout — secure checkout / Razorpay Test Mode order.
//
//   Body:       { businessId, planId, period }
//   Auth:       required (401 when anonymous)
//   Tenant:     OWNER/ADMIN ACTIVE member ONLY (404 for non-members, 403 for
//               lower roles) — a supplied businessId is only ever a *requested
//               target* and is always checked against session membership.
//   Authority:  price/GST/total come from plan_catalog + the Phase 4C calculator.
//               Client-supplied amount/price/gst/total/currency are IGNORED —
//               they are not read from the body at all.
//   Records:    PENDING subscription + CREATED payment with the Razorpay
//               orderId, stored atomically AFTER the order succeeds.
//   Response:   safe DTO only — orderId, public keyId, amount (paise), INR,
//               plan/period, monetary strings. No secrets, no raw rows.
export async function POST(request: NextRequest) {
  try {
    const body: Record<string, unknown> | null = await request
      .json()
      .catch(() => null);
    const businessId =
      body && typeof body.businessId === "string" ? body.businessId : "";

    if (businessId.length === 0) {
      throw new ValidationError("businessId is required");
    }

    const { business, membership } = await requireBusinessRole(businessId, [
      "OWNER",
      "ADMIN",
    ]);
    if (membership.status !== "ACTIVE") {
      throw new ForbiddenError("Membership is not active");
    }
    if (business.status !== "ACTIVE") {
      throw new ForbiddenError("Business is not active");
    }

    const result = await createCheckoutForBusiness(business.id, {
      planId: body?.planId,
      period: body?.period,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}