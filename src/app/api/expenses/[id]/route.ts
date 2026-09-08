import { NextRequest, NextResponse } from "next/server";
import {
  getExpense,
  updateExpense,
  deleteExpense,
} from "@/lib/expense/expense-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/expenses/[id]?businessId=... -- one expense in the member's business
// (404 for other-tenant or nonexistent ids, no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const expense = await getExpense(businessId, id);
    return NextResponse.json({ expense });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/expenses/[id]?businessId=...
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const expense = await updateExpense(businessId, id, body);
    return NextResponse.json({ expense });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/expenses/[id]?businessId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const result = await deleteExpense(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}