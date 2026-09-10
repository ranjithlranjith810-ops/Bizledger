import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireBusinessRole,
} from "@/lib/business/business-service";
import { getBusinessSubscriptionDto } from "@/lib/billing/subscription-service";
import { handleApiError, ValidationError } from "@/lib/business/api-error";

// GET /api/billing/subscription?businessId=... — effective subscription for the
// billing UI (Phase 4F follow-up + lifecycle).
//
//   Auth:   required (401 when anonymous)
//   Tenant: OWNER/ADMIN ACTIVE member ONLY (404 for non-members, 403 for lower
//           roles / inactive membership) — same gate as checkout/verify.
//   Body:   none. businessId comes from the query string (the http client also
//           appends it automatically when `businessId` is passed in options).
//   Scope:  READ-ONLY. Returns the EFFECTIVE subscription (status ACTIVE,
//           GRACE_PERIOD or EXPIRED derived from stored dates vs the SERVER
//           clock, with grace bounds + renewalRequired) or `{ subscription:
//           null }` when the business has no ACTIVE subscription row. Never
//           mutates rows — activation remains exclusively the webhook's job,
//           and expiry is a derived state, never a background mutation.
export async function GET(request: NextRequest) {
  try {
    const businessId =
      request.nextUrl.searchParams.get("businessId")?.trim() ?? "";

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

    const subscription = await getBusinessSubscriptionDto(business.id);

    return NextResponse.json({ subscription }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}