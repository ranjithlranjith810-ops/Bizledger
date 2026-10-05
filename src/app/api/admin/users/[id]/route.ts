import { NextRequest, NextResponse } from "next/server";
import { getAdminUserDetail } from "@/lib/admin/admin-users-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/users/[id] — one user + safe detail (Phase 9B).
//   * Same authorization as the list endpoint (SUPPORT_ADMIN + SUPER_ADMIN
//     read; anonymous -> 401; signed-in non-admin -> 403; server-resolved
//     roles only).
//   * Returns the user's identity/profile fields, status, safe aggregate
//     counts, safe membership metadata (business name + role + status, never
//     the permission JSON), safe recent activity, and the user's PlatformAdmin
//     tier if any. Never accounts, sessions, tokens, passwords.
//   * Unknown user id -> 404. Strictly read-only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAdminUserDetail(id);
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

// All mutating methods are explicitly disallowed; use /suspend and
// /reactivate for status changes.
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