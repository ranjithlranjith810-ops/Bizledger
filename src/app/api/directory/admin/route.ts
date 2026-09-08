import { NextRequest, NextResponse } from "next/server";
import { listDirectoryModerationQueue } from "@/lib/directory/directory-admin-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/directory/admin[?status=...] -- the moderation queue. 401 for
// anonymous callers, 403 for signed-in non-admins (requirePlatformAdmin).
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const listings = await listDirectoryModerationQueue({ status });
    return NextResponse.json({ listings, count: listings.length });
  } catch (error) {
    return handleApiError(error);
  }
}