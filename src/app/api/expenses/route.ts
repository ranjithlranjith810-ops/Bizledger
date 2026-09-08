import { NextRequest, NextResponse } from "next/server";
import {
  createExpense,
  listExpenses,
} from "@/lib/expense/expense-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/expenses?businessId=... -- create an expense in the member's business.
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const expense = await createExpense(businessId, body);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/expenses?businessId=... -- list the member's business expenses with
// optional search/category/paymentMethod/status filters (frontend behaviour).
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const opts = {
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      category: request.nextUrl.searchParams.get("category") ?? undefined,
      paymentMethod: request.nextUrl.searchParams.get("paymentMethod") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    };
    const expenses = await listExpenses(businessId, opts);
    return NextResponse.json({ expenses });
  } catch (error) {
    return handleApiError(error);
  }
}