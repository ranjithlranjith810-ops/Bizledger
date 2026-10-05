import { NextRequest, NextResponse } from "next/server";
import { getAdminUserActivity } from "@/lib/admin/admin-users-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/users/[id]/activity?limit=... — safe recent activity for one
// user (Phase 9B).
//   * SUPPORT_ADMIN and SUPER_ADMIN may read; anonymous -> 401; signed-in
//     non-admin -> 403; server-resolved roles only.
//   * Activity is DERIVED from existing immutable/safe rows (audit-log entries
//     targeting the user, session sign-in timestamps, membership join events,
//     OWNER business creations) — never fabricated, never exposes tokens.
//   * Unknown user id -> 404. Strictly read-only.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const activity = await getAdminUserActivity(id, rawLimit);
    return NextResponse.json({ activity });
  } catch (error) {
    return handleApiError(error);
  }
}

// All mutating methods are explicitly disallowed.
export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}