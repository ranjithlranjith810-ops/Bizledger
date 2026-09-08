import { NextRequest, NextResponse } from "next/server";
import {
  createPurchaseOrder,
  listPurchaseOrders,
} from "@/lib/sales-document/purchase-order-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/purchase-orders?businessId=... -- create a purchase order in the
// member's business (atomic: number allocation + insert in one transaction).
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const purchaseOrder = await createPurchaseOrder(businessId, body);
    return NextResponse.json({ purchaseOrder }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/purchase-orders?businessId=... -- list the member's POs (newest first).
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const purchaseOrders = await listPurchaseOrders(businessId);
    return NextResponse.json({ purchaseOrders, count: purchaseOrders.length });
  } catch (error) {
    return handleApiError(error);
  }
}