import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireBusinessRole,
} from "@/lib/business/business-service";
import { getBillingHistoryDto } from "@/lib/billing/billing-history-service";
import { handleApiError, ValidationError } from "@/lib/business/api-error";

// GET /api/billing/history?businessId=... — billing history for the billing UI
// (Phase 6A).
//
//   Auth:   required (401 when anonymous)
//   Tenant: OWNER/ADMIN ACTIVE member ONLY (404 for non-members, 403 for lower
//           roles / inactive membership) — same gate as /api/billing/subscription.
//   Body:   none. businessId comes from the query string (the http client also
//           appends it automatically when `businessId` is passed in options).
//   Scope:  READ-ONLY. Returns ALL payment attempts (VERIFIED / FAILED /
//           CREATED / CANCELLED), newest first; verified attempts carry a
//           receipt link, failed ones never show an invoice number. The full
//           receipt body renders on the detail page (/api/billing/invoice).
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

    const payments = await getBillingHistoryDto(business.id);

    return NextResponse.json({ payments }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}