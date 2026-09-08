import { NextResponse } from "next/server";
import { requireUser } from "@/lib/business/tenant";
import { listPlans } from "@/lib/billing/plan-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/billing/plans — the global, read-only plan catalog.
//   * Any AUTHENTICATED user may read (401 for anonymous callers).
//   * Not tenant-scoped: the catalog is platform data, not business data.
//   * Returns DTOs only (id/name/description/price/period/
//     businessNetworkIncluded/limits) — no secrets, no internal DB metadata,
//     no subscription/payment history.
//   * No mutation endpoints exist (plans are application-controlled; future
//     plan management belongs to a real admin backend authorization layer).
export async function GET() {
  try {
    await requireUser();
    const plans = await listPlans({ activeOnly: true });
    return NextResponse.json({ plans });
  } catch (error) {
    return handleApiError(error);
  }
}