import { NextRequest, NextResponse } from "next/server";
import { listTeam } from "@/lib/team/team-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/team?businessId=... — list the member's business team.
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const members = await listTeam(businessId);
    return NextResponse.json({ members });
  } catch (error) {
    return handleApiError(error);
  }
}