import { NextRequest, NextResponse } from "next/server";
import { getAdminSubscriptionDetail } from "@/lib/admin/admin-subscriptions-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/subscriptions/[id] — one subscription + safe history (Step 5D).
//   * Same authorization as the list endpoint (SUPPORT_ADMIN + SUPER_ADMIN read;
//     anonymous -> 401; signed-in non-admin -> 403; server-resolved roles only).
//   * Returns the subscription record with its effective lifecycle plus safe
//     related history — payment records (customer billing-history fields only),
//     billing invoices (without identity snapshots), and subscription events
//     (id/type/createdAt only — payload JSON never leaves the server).
//   * Unknown subscription id -> 404. Strictly read-only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const subscription = await getAdminSubscriptionDetail(id);
    return NextResponse.json({ subscription });
  } catch (error) {
    return handleApiError(error);
  }
}