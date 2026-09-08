import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireBusinessRole,
} from "@/lib/business/business-service";
import { getBillingPaymentDetailDto } from "@/lib/billing/billing-history-service";
import {
  handleApiError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/business/api-error";

// GET /api/billing/invoice?businessId=...&paymentId=... — one payment attempt
// with its BillingInvoice / Payment Receipt (Phase 6A).
//
//   Auth:   required (401 when anonymous)
//   Tenant: OWNER/ADMIN ACTIVE member ONLY (404 for non-members, 403 for lower
//           roles / inactive membership). `paymentId` is the PaymentRecord ROW
//           id; it is always resolved against the member's own business — a
//           payment that does not belong to this tenant returns 404 (never
//           disclosed).
//   Body:   none.
//   Scope:  READ-ONLY. Returns `{ payment, invoice }`. `invoice` is null for
//           attempts that never reached VERIFIED (the page shows the payment
//           status only). `payment.status` is always included so the UI can
//           render the Payment Status section.
export async function GET(request: NextRequest) {
  try {
    const businessId =
      request.nextUrl.searchParams.get("businessId")?.trim() ?? "";
    const paymentId =
      request.nextUrl.searchParams.get("paymentId")?.trim() ?? "";

    if (businessId.length === 0) {
      throw new ValidationError("businessId is required");
    }
    if (paymentId.length === 0) {
      throw new ValidationError("paymentId is required");
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

    const detail = await getBillingPaymentDetailDto(business.id, paymentId);
    if (!detail) {
      throw new ResourceNotFoundError("Payment not found");
    }

    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}