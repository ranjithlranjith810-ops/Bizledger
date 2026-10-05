import { NextResponse } from "next/server";
import { requirePlatformAdminRole } from "@/lib/directory/directory-admin-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/me — the admin console's identity/role endpoint (Phase 9C-3).
//   * Anonymous -> 401; signed-in non-admin -> 403 (requirePlatformAdminRole).
//   * Both SUPER_ADMIN and SUPPORT_ADMIN may use it; the actor's tier is
//     resolved from the server session, NEVER from the browser, so the admin
//     console can render the full (SUPER_ADMIN) vs read-only (SUPPORT_ADMIN)
//     surfaces truthfully and hide write controls for the restricted tier.
//   * Strictly a read of the caller's own platform_admin row — it exposes no
//     business data, no relations and no secrets.
export async function GET() {
  try {
    const { admin } = await requirePlatformAdminRole("SUPPORT_ADMIN");
    return NextResponse.json({ ok: true, role: admin.role });
  } catch (error) {
    return handleApiError(error);
  }
}