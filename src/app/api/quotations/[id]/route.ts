import { NextRequest, NextResponse } from "next/server";
import {
  getQuotation,
  updateQuotation,
  deleteQuotation,
} from "@/lib/sales-document/quotation-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/quotations/[id]?businessId=... -- the member's quotation. 404 for
// other-tenant or nonexistent ids (no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const quotation = await getQuotation(businessId, id);
    return NextResponse.json({ quotation });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/quotations/[id]?businessId=... -- edit a quotation (whitelisted
// fields; totals recomputed server-side).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const quotation = await updateQuotation(businessId, id, body);
    return NextResponse.json({ quotation });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/quotations/[id]?businessId=... -- rejected unconditionally (409).
// There is no quotation deletion path.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const result = await deleteQuotation(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}