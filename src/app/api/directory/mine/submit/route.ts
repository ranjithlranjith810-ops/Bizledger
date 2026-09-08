import { NextRequest, NextResponse } from "next/server";
import { submitMyDirectoryProfile } from "@/lib/directory/directory-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/directory/mine/submit?businessId=... — submit the listing for
// moderation (PENDING_REVIEW); removed from public visibility until a
// moderator publishes it.
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const business = await submitMyDirectoryProfile(businessId);
    return NextResponse.json({ business });
  } catch (error) {
    return handleApiError(error);
  }
}