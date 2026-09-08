import { NextRequest, NextResponse } from "next/server";
import { inviteTeamMember } from "@/lib/team/team-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/team/invite?businessId=... — invite a team member (OWNER/ADMIN).
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const member = await inviteTeamMember(businessId, body);
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}