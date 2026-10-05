import { NextRequest, NextResponse } from "next/server";
import { getAdminBusinessDetail } from "@/lib/admin/admin-businesses-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/businesses/[id] — one business + safe detail (Step 7).
//   * Same authorization as the list endpoint (SUPPORT_ADMIN + SUPER_ADMIN
//     read; anonymous -> 401; signed-in non-admin -> 403; server-resolved
//     roles only).
//   * Returns the business's registered identity/profile fields, safe
//     aggregate counts (members/branches/usage), the effective-subscription
//     summary (shared server-side lifecycle logic), and recent safe payment
//     history (customer billing-history fields only — no razorpayEventId, no
//     webhook payloads, no planSnapshot, no member permission JSON, no
//     user/session/account records).
//   * Unknown business id -> 404. Strictly read-only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const business = await getAdminBusinessDetail(id);
    return NextResponse.json({ business });
  } catch (error) {
    return handleApiError(error);
  }
}