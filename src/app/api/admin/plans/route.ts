import { NextRequest, NextResponse } from "next/server";
import {
  listAdminPlans,
  createAdminPlan,
} from "@/lib/admin/admin-plans-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/admin/plans — the platform-admin plan catalog (Step 5A).
//   * Both SUPER_ADMIN and SUPPORT_ADMIN may read (requirePlatformAdminRole).
//   * Anonymous -> 401; signed-in non-admin -> 403.
//   * Reads ONLY from PlanCatalog (plan_catalog) — never src/lib/plans.ts and
//     never any localStorage/mock source.
//   * Safe DTO only; deterministic sort; existing handleApiError conventions.
export async function GET() {
  try {
    const plans = await listAdminPlans();
    return NextResponse.json({ plans });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/admin/plans — create a plan (Step 5B/9C-2). SUPER_ADMIN only.
//   * SUPPORT_ADMIN -> 403; signed-in non-admin -> 403; anonymous -> 401.
//   * Requests must be a JSON object of the 7 writable fields exactly; unknown
//     fields (including id/createdAt/updatedAt) are rejected (400), and every
//     field is validated server-side (price/period/limits/booleans/name).
//   * The id is generated server-side (never from the browser); no plan may be
//     created with the reserved `base` id.
//   * A PLAN_CREATE audit row is written in the same transaction (Phase 8F).
//   * Duplicate plan names are guarded at the application layer (no unique
//     schema constraint exists — reported as a design decision).
export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, "admin-mutation");
    if (limited) return limited;
    const body = await request.json().catch(() => null);
    const plan = await createAdminPlan(body);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}