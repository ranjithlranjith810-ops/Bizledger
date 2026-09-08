import { NextRequest, NextResponse } from "next/server";
import {
  createFinancialYear,
  listFinancialYears,
} from "@/lib/financial-year/financial-year-service";
import { handleApiError } from "@/lib/business/api-error";
import { getBusinessForMember } from "@/lib/business/business-service";

// Resolve the authenticated member's verified business from the query param.
async function requireVerifiedBusiness(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? "";
  return getBusinessForMember(businessId);
}

// POST /api/financial-years?businessId=... — create a financial year in the
// member's business (activated when it is the first year).
export async function POST(request: NextRequest) {
  try {
    await requireVerifiedBusiness(request);
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const financialYear = await createFinancialYear(businessId, body);
    return NextResponse.json({ financialYear }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/financial-years?businessId=... — list the member's financial years.
export async function GET(request: NextRequest) {
  try {
    await requireVerifiedBusiness(request);
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const financialYears = await listFinancialYears(businessId);
    return NextResponse.json({ financialYears, count: financialYears.length });
  } catch (error) {
    return handleApiError(error);
  }
}
