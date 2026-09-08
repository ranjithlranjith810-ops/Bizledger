import { NextRequest, NextResponse } from "next/server";
import {
  getCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/customer/customer-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/customers/[id]?businessId=...
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const customer = await getCustomer(businessId, id);
    return NextResponse.json({ customer });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/customers/[id]?businessId=...
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const customer = await updateCustomer(businessId, id, body);
    return NextResponse.json({ customer });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/customers/[id]?businessId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const result = await deleteCustomer(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
