import { NextRequest, NextResponse } from "next/server";
import { suspendAdminUser } from "@/lib/admin/admin-users-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/admin/users/[id]/suspend — SUPER_ADMIN only (Phase 9B). Flips
// user.status ACTIVE → SUSPENDED atomically with a PlatformAdminLog audit row.
// Anonymous → 401; signed-in non-admin → 403; SUPPORT_ADMIN → 403. Missing/
// empty reason → 400. Already SUSPENDED → 409.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit(request, "admin-mutation");
    if (limited) return limited;
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const reason = (body as Record<string, unknown> | undefined)?.reason;
    const result = await suspendAdminUser(id, reason);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// Read methods are explicitly disallowed here.
export async function GET() {
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