import { NextRequest, NextResponse } from "next/server";
import {
  getPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from "@/lib/sales-document/purchase-order-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/purchase-orders/[id]?businessId=... -- the member's PO. 404 for
// other-tenant or nonexistent ids (no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const purchaseOrder = await getPurchaseOrder(businessId, id);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/purchase-orders/[id]?businessId=... -- edit a PO (whitelisted
// fields; totals recomputed server-side).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const purchaseOrder = await updatePurchaseOrder(businessId, id, body);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/purchase-orders/[id]?businessId=... -- delete ONLY a draft PO.
// Issued purchase orders are 409.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const result = await deletePurchaseOrder(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}