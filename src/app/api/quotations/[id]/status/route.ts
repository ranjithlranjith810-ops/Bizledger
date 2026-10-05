import { NextRequest, NextResponse } from "next/server";
import { transitionQuotationStatus } from "@/lib/sales-document/quotation-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// PATCH /api/quotations/[id]/status?businessId=... -- the ONLY lifecycle path
// that changes a quotation's status. Allowed edges are server-authoritative
// (QUOTATION_STATUS_TRANSITIONS): Draft -> Sent -> Accepted/Rejected/Expired,
// with every terminal status closed. The body's `status` is a requested
// destination, not an assignment: the server reads the current status from the
// database and rejects an illegal edge with 409. A forged `status` on the
// regular PATCH body is still rejected.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit(request, "quotation-status");
    if (limited) return limited;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const quotation = await transitionQuotationStatus(businessId, id, body.status);
    return NextResponse.json({ quotation });
  } catch (error) {
    return handleApiError(error);
  }
}
