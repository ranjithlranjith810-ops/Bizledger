import { NextRequest, NextResponse } from "next/server";
import { listAdminPayments } from "@/lib/admin/admin-payments-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/payments — platform-admin payment list (Step 8).
//   * SUPPORT_ADMIN and SUPER_ADMIN may read (requirePlatformAdminRole);
//     anonymous -> 401; signed-in non-admin -> 403; roles are NEVER trusted
//     from the browser — the session + platform_admin row decide server-side.
//   * Reads every PaymentRecord across businesses. PaymentRecord is the
//     historical financial authority: amounts are returned VERBATIM as 2dp
//     strings and are NEVER recalculated from PlanCatalog; `status` is the
//     stored attempt truth (never inferred from subscription status); the plan
//     label is the stored PaymentRecord.planName so inactive/deleted plan
//     history stays readable.
//   * When a BillingInvoice exists for the payment, only the four safe invoice
//     identity/date fields (billingInvoiceId/invoiceNumber/invoiceDate/
//     paymentDate) are surfaced — never supplier/customer snapshots.
//   * Unnecessary internal fields and provider/secrets are excluded (see the
//     service boundary).
//   * READ-ONLY: no mutations/refunds here.
//   * Deterministic order: createdAt DESC, then id ASC.
//
// SCALABILITY: this endpoint returns the whole PaymentRecord table with no
// pagination (task constraint). Payment history is append-only and expected to
// grow unboundedly (every attempt — CREATED/VERIFIED/FAILED/CANCELLED — is
// recorded), so a production build MUST add keyset/has-more pagination (and/or
// a businessId filter) before this is exposed to a busy platform.
export async function GET(_request: NextRequest) {
  try {
    const payments = await listAdminPayments();
    return NextResponse.json({ payments });
  } catch (error) {
    return handleApiError(error);
  }
}