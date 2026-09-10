import { NextRequest, NextResponse } from "next/server";
import { transitionInvoiceStatus } from "@/lib/invoice/invoice-service";
import { handleApiError } from "@/lib/business/api-error";

// PATCH /api/invoices/[id]/status?businessId=... -- the ONLY lifecycle path
// that changes invoice status (F4). Allowed edges are server-authoritative
// (Draft -> Pending -> Paid; Overdue/Cancelled by server flow). A forged
// status on the regular PATCH body is rejected. Unknown/forbidden edges -> 409.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const invoice = await transitionInvoiceStatus(businessId, id, body.status);
    return NextResponse.json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}