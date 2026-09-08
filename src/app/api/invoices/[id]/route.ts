import { NextRequest, NextResponse } from "next/server";
import {
  getInvoice,
  updateInvoice,
  deleteInvoice,
} from "@/lib/invoice/invoice-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/invoices/[id]?businessId=... -- get one invoice in the member's
// business (404 for other-tenant or nonexistent ids, no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const invoice = await getInvoice(businessId, id);
    return NextResponse.json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/invoices/[id]?businessId=... -- edit an invoice (whitelisted
// fields only; totals always recomputed server-side). Protected identity and
// numbering fields are rejected with 400.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const invoice = await updateInvoice(businessId, id, body);
    return NextResponse.json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/invoices/[id]?businessId=... -- delete ONLY a draft invoice.
// Issued invoices and conversion-referenced invoices are 409.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const { id } = await params;
    const result = await deleteInvoice(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}