import { NextRequest, NextResponse } from "next/server";
import { reactivateAdminBusiness } from "@/lib/admin/admin-businesses-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/admin/businesses/[id]/reactivate — SUPER_ADMIN only. Updates
// business.status SUSPENDED → ACTIVE atomically with a PlatformAdminLog
// audit row. Anonymous → 401; signed-in non-admin → 403; SUPPORT_ADMIN →
// 403. Missing/empty reason → 400. Already ACTIVE → 409.
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
    const result = await reactivateAdminBusiness(id, reason);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
