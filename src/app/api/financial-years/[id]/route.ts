import { NextRequest, NextResponse } from "next/server";
import { getFinancialYear } from "@/lib/financial-year/financial-year-service";
import { handleApiError } from "@/lib/business/api-error";
import { getBusinessForMember } from "@/lib/business/business-service";

// GET /api/financial-years/[id]?businessId=... — get one financial year in the
// member's business (404 for other-tenant or nonexistent ids, no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    await getBusinessForMember(businessId);
    const { id } = await params;
    const financialYear = await getFinancialYear(businessId, id);
    return NextResponse.json({ financialYear });
  } catch (error) {
    return handleApiError(error);
  }
}
