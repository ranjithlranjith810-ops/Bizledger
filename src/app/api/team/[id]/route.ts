import { NextRequest, NextResponse } from "next/server";
import { revokeTeamMember } from "@/lib/team/team-service";
import { handleApiError } from "@/lib/business/api-error";

// DELETE /api/team/[memberId]?businessId=... — revoke a team member's access.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const result = await revokeTeamMember(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}