import { NextRequest, NextResponse } from "next/server";
import {
  getEstimate,
  updateEstimate,
  deleteEstimate,
} from "@/lib/sales-document/estimate-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/estimates/[id]?businessId=... -- the member's estimate. 404 for
// other-tenant or nonexistent ids (no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const estimate = await getEstimate(businessId, id);
    return NextResponse.json({ estimate });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/estimates/[id]?businessId=... -- edit an estimate (whitelisted
// fields; totals recomputed server-side).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const estimate = await updateEstimate(businessId, id, body);
    return NextResponse.json({ estimate });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/estimates/[id]?businessId=... -- rejected unconditionally (409).
// There is no estimate deletion path.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const result = await deleteEstimate(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}