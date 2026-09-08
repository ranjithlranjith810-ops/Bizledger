import { NextRequest, NextResponse } from "next/server";
import {
  createCustomer,
  listCustomers,
} from "@/lib/customer/customer-service";
import { handleApiError } from "@/lib/business/api-error";
import { getBusinessForMember } from "@/lib/business/business-service";

// Resolve the authenticated member's verified business from the query param.
// The `businessId` query value is a REQUESTED target — getBusinessForMember
// validates it against the authenticated user's own membership.
async function requireVerifiedBusiness(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? "";
  return getBusinessForMember(businessId);
}

// POST /api/customers?businessId=... — create a customer in the member's business.
export async function POST(request: NextRequest) {
  try {
    await requireVerifiedBusiness(request);
    const body = await request.json().catch(() => ({}));
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const customer = await createCustomer(businessId, body);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/customers?businessId=...&q=... — list/search the member's customers.
export async function GET(request: NextRequest) {
  try {
    await requireVerifiedBusiness(request);
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const customers = await listCustomers(businessId, { q });
    return NextResponse.json({ customers, count: customers.length });
  } catch (error) {
    return handleApiError(error);
  }
}
