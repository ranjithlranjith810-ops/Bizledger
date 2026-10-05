import { NextRequest, NextResponse } from "next/server";
import {
  updateAdminPlan,
  deleteAdminPlan,
} from "@/lib/admin/admin-plans-service";
import { handleApiError } from "@/lib/business/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";

// PATCH /api/admin/plans/[id] — update a plan (Step 5B/9C-2). SUPER_ADMIN only.
//   * Any subset of the writable fields (plus an optional `reason`); unknown
//     fields / bad values -> 400.
//   * Unknown plan id -> 404. The FREE (base) plan cannot be deactivated.
//   * ACTIVE TRANSITIONS require `reason` and produce PLAN_ACTIVATE /
//     PLAN_DEACTIVATE audit actions; other edits produce PLAN_UPDATE. The
//     catalog change and its audit row commit atomically (Phase 8F + 9C-2).
//   * Only the PlanCatalog row changes — historical PaymentRecord /
//     BillingInvoice amounts and BusinessSubscription.planSnapshot are never
//     touched. Deactivation only affects future plan selection.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit(request, "admin-mutation");
    if (limited) return limited;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const plan = await updateAdminPlan(id, body);
    return NextResponse.json({ plan });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/admin/plans/[id] — delete a plan (Step 5B/9C-2). SUPER_ADMIN only.
//   * The FREE (base) plan cannot be deleted -> 409.
//   * A plan referenced by subscriptions/payments/invoices cannot be deleted
//     -> 409 (reference check + delete + PLAN_DELETE audit in one transaction;
//     no cascade, history stays intact).
//   * Unknown id -> 404. An optional `reason` is recorded in the audit row.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit(request, "admin-mutation");
    if (limited) return limited;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).reason
        : undefined;
    const result = await deleteAdminPlan(id, reason);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}