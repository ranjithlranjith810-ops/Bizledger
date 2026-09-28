import { NextRequest, NextResponse } from "next/server";
import { moderateDirectoryListing } from "@/lib/directory/directory-admin-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/directory/admin/[id]/suspend -- platform-admin-only transition.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit(request, "admin-mutation");
    if (limited) return limited;
    const { id } = await params;
    const listing = await moderateDirectoryListing(id, "suspend");
    return NextResponse.json({ listing });
  } catch (error) {
    return handleApiError(error);
  }
}