import { NextRequest, NextResponse } from "next/server";
import { listAdminUsers } from "@/lib/admin/admin-users-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/users?q=... — platform-admin user list (Phase 9B).
//   * SUPPORT_ADMIN and SUPER_ADMIN may read; anonymous -> 401; signed-in
//     non-admin -> 403; roles are NEVER trusted from the browser — the session
//     + platform_admin row decide server-side.
//   * Optional `q` filters server-side across name, email and user id.
//   * Returns the safe operational surface per user: identity/status, safe
//     aggregate counts and last-activity timestamp. Never passwords, tokens,
//     sessions/accounts, or permission JSON.
//   * READ-ONLY. Deterministic order: createdAt DESC, then id ASC.
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q");
    const users = await listAdminUsers(q);
    return NextResponse.json({ users });
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
export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}