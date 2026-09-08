import { NextRequest, NextResponse } from "next/server";
import { activateFinancialYear } from "@/lib/financial-year/financial-year-service";
import { handleApiError } from "@/lib/business/api-error";
import { getBusinessForMember } from "@/lib/business/business-service";

// POST /api/financial-years/[id]/activate?businessId=... — set the single
// active financial year for the member's business.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    await getBusinessForMember(businessId);
    const { id } = await params;
    const financialYear = await activateFinancialYear(businessId, id);
    return NextResponse.json({ financialYear });
  } catch (error) {
    return handleApiError(error);
  }
}
