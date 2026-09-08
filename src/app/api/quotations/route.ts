import { NextRequest, NextResponse } from "next/server";
import { createQuotation, listQuotations } from "@/lib/sales-document/quotation-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/quotations?businessId=... -- create a quotation in the member's
// business (atomic: number allocation + insert in one transaction).
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const quotation = await createQuotation(businessId, body);
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/quotations?businessId=... -- list the member's quotations (newest first).
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const quotations = await listQuotations(businessId);
    return NextResponse.json({ quotations, count: quotations.length });
  } catch (error) {
    return handleApiError(error);
  }
}