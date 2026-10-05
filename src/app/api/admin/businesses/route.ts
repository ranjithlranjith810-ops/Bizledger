import { NextRequest, NextResponse } from "next/server";
import { listAdminBusinesses } from "@/lib/admin/admin-businesses-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/businesses — platform-admin business list (Step 7).
//   * SUPPORT_ADMIN and SUPER_ADMIN may read (requirePlatformAdminRole);
//     anonymous -> 401; signed-in non-admin -> 403; roles are NEVER trusted
//     from the browser — the session + platform_admin row decide server-side.
//   * Returns the safe operational surface per business: identity/status/
//     createdAt, active-branch + member counts, and the EFFECTIVE subscription
//     summary computed with the shared server-side lifecycle helper — a raw
//     ACTIVE row past its paid period is reported FREE, never paid-by-status.
//   * READ-ONLY: no mutations here.
//   * Deterministic order: createdAt DESC, then id ASC.
export async function GET(_request: NextRequest) {
  try {
    const businesses = await listAdminBusinesses();
    return NextResponse.json({ businesses });
  } catch (error) {
    return handleApiError(error);
  }
}