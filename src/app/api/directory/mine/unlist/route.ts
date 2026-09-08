import { NextRequest, NextResponse } from "next/server";
import { unlistMyDirectoryProfile } from "@/lib/directory/directory-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/directory/mine/unlist?businessId=... — take the business off the
// public directory (NOT_LISTED, isListed=false). Draft details are kept.
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const business = await unlistMyDirectoryProfile(businessId);
    return NextResponse.json({ business });
  } catch (error) {
    return handleApiError(error);
  }
}