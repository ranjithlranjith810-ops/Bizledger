import { NextRequest, NextResponse } from "next/server";
import { listDirectory } from "@/lib/directory/directory-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/directory — PUBLIC, unauthenticated browse of PUBLISHED listings.
export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, "directory-public");
    if (limited) return limited;
    const opts = {
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      businessType: request.nextUrl.searchParams.get("businessType") ?? undefined,
      category: request.nextUrl.searchParams.get("category") ?? undefined,
      state: request.nextUrl.searchParams.get("state") ?? undefined,
    };
    const businesses = await listDirectory(opts);
    return NextResponse.json({ businesses });
  } catch (error) {
    return handleApiError(error);
  }
}