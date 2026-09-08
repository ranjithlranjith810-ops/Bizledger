import { NextRequest, NextResponse } from "next/server";
import { getDirectoryProfile } from "@/lib/directory/directory-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/directory/[profileId] — PUBLIC detail of a PUBLISHED listing only.
// Non-published listings and unknown ids both resolve to 404.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const business = await getDirectoryProfile(id);
    return NextResponse.json({ business });
  } catch (error) {
    return handleApiError(error);
  }
}