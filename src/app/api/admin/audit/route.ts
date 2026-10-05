import { NextRequest, NextResponse } from "next/server";
import { listAdminAuditLogs } from "@/lib/admin/admin-audit-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/admin/audit — platform-admin audit trail (Phase 8A/8B).
//
//   * SUPPORT_ADMIN and SUPER_ADMIN may read; anonymous -> 401; signed-in
//     non-admin -> 403; roles are resolved from the server session, never
//     the browser.
//   * Returns every audit row (newest first) with the acting admin's email/name.
//   * Strictly READ-ONLY. No POST/PATCH/DELETE are ever allowed.
export async function GET(_request: NextRequest) {
  try {
    const logs = await listAdminAuditLogs();
    return NextResponse.json({ logs });
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
