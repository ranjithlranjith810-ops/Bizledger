import { NextRequest, NextResponse } from "next/server";
import { getAdminPaymentDetail } from "@/lib/admin/admin-payments-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/payments/[id] — one payment record + safe detail (Step 8).
//   * Same authorization as the list endpoint (SUPPORT_ADMIN + SUPER_ADMIN
//     read; anonymous -> 401; signed-in non-admin -> 403; server-resolved
//     roles only).
//   * Returns the same safe operational payment fields as the list plus the
//     safe invoice identity/dates when a BillingInvoice exists. Amounts are
//     the stored 2dp PaymentRecord values (financial authority — never
//     recomputed from PlanCatalog); `status` is the PaymentRecord truth.
//   * Unknown payment id -> 404. Strictly read-only — no mutation/refund.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payment = await getAdminPaymentDetail(id);
    return NextResponse.json({ payment });
  } catch (error) {
    return handleApiError(error);
  }
}