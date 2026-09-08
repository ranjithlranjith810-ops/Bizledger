import { NextRequest, NextResponse } from "next/server";
import { createEstimate, listEstimates } from "@/lib/sales-document/estimate-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/estimates?businessId=... -- create an estimate in the member's
// business (atomic: number allocation + insert in one transaction).
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const estimate = await createEstimate(businessId, body);
    return NextResponse.json({ estimate }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/estimates?businessId=... -- list the member's estimates (newest first).
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const estimates = await listEstimates(businessId);
    return NextResponse.json({ estimates, count: estimates.length });
  } catch (error) {
    return handleApiError(error);
  }
}