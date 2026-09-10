import { NextRequest, NextResponse } from "next/server";
import { decideExpenseApproval } from "@/lib/expense/expense-service";
import { handleApiError } from "@/lib/business/api-error";

// PATCH /api/expenses/[id]/approve?businessId=... -- explicit server-authorized
// approval operation (F5). Body: { decision: "APPROVE" | "REJECT" }. Requires
// `expenses.approve`, records the authenticated approver as `approvedBy`, and
// refuses self-approval (403). A forged status on the regular PATCH body is
// rejected (400) — status changes only through this endpoint.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const expense = await decideExpenseApproval(businessId, id, body.decision);
    return NextResponse.json({ expense });
  } catch (error) {
    return handleApiError(error);
  }
}