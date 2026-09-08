import { NextRequest, NextResponse } from "next/server";
import { moderateDirectoryListing } from "@/lib/directory/directory-admin-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/directory/admin/[id]/restore -- platform-admin-only transition.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const listing = await moderateDirectoryListing(id, "restore");
    return NextResponse.json({ listing });
  } catch (error) {
    return handleApiError(error);
  }
}