import { NextRequest, NextResponse } from "next/server";
import {
  createInvoice,
  listInvoices,
} from "@/lib/invoice/invoice-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/invoices?businessId=... -- create an invoice in the member's
// business (atomic: number allocation + insert in one transaction).
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const invoice = await createInvoice(businessId, body);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/invoices?businessId=... -- list the member's invoices (newest first).
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const invoices = await listInvoices(businessId);
    return NextResponse.json({ invoices, count: invoices.length });
  } catch (error) {
    return handleApiError(error);
  }
}