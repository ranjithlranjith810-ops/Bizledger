import { NextRequest, NextResponse } from "next/server";
import { listAdminSubscriptions } from "@/lib/admin/admin-subscriptions-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/subscriptions — platform-admin subscription list (Step 5D).
//   * SUPPORT_ADMIN and SUPER_ADMIN may read (requirePlatformAdminRole);
//     anonymous -> 401; signed-in non-admin -> 403; roles are NEVER trusted
//     from the browser — the session + platform_admin row decide server-side.
//   * Reads every BusinessSubscription row across businesses; each entry carries
//     the raw stored fields plus the EFFECTIVE lifecycle verdict computed with
//     the shared `computeSubscriptionLifecycle` helper (server clock) — a raw
//     ACTIVE row past its paid period is reported FREE, never paid-by-status.
//   * READ-ONLY: no mutations here — lifecycle changes remain the exclusive job
//     of the billing/webhook services.
//   * Deterministic order: createdAt DESC, then id ASC. No pagination (the
//     dataset is safely returned whole; see the scalability note).
export async function GET(_request: NextRequest) {
  try {
    const subscriptions = await listAdminSubscriptions();
    return NextResponse.json({ subscriptions });
  } catch (error) {
    return handleApiError(error);
  }
}