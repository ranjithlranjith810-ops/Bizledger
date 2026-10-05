import { NextRequest, NextResponse } from "next/server";
import { transitionPurchaseOrderStatus } from "@/lib/sales-document/purchase-order-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// PATCH /api/purchase-orders/[id]/status?businessId=... -- the ONLY lifecycle
// path that changes a PO's status. Allowed edges are server-authoritative
// (PURCHASE_ORDER_STATUS_TRANSITIONS): Draft -> Sent, then Sent -> Accepted /
// Partially Received / Received / Cancelled; every status after Draft is
// terminal (no receiving progression). The body's `status` is a requested
// destination, not an assignment: the server reads the current status from the
// database and rejects an illegal edge with 409. A forged `status` on the
// regular PATCH body is still rejected.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit(request, "purchase-order-status");
    if (limited) return limited;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const purchaseOrder = await transitionPurchaseOrderStatus(
      businessId,
      id,
      body.status,
    );
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return handleApiError(error);
  }
}
