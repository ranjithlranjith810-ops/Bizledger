import { NextRequest, NextResponse } from "next/server";
import {
  getMyDirectoryProfile,
  saveMyDirectoryProfile,
} from "@/lib/directory/directory-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/directory/mine?businessId=... — the caller's own business listing
// (any lifecycle state) or null when none exists yet.
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const business = await getMyDirectoryProfile(businessId);
    return NextResponse.json({ business });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/directory/mine?businessId=... — save the listing draft. Existing
// lifecycle status/isListed are preserved on updates.
export async function PUT(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, "directory-save");
    if (limited) return limited;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const business = await saveMyDirectoryProfile(businessId, body);
    return NextResponse.json({ business });
  } catch (error) {
    return handleApiError(error);
  }
}