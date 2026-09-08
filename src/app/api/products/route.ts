import { NextRequest, NextResponse } from "next/server";
import { createProduct, listProducts } from "@/lib/product/product-service";
import { handleApiError } from "@/lib/business/api-error";
import { getBusinessForMember } from "@/lib/business/business-service";

// Resolve the authenticated member's verified business from the query param.
async function requireVerifiedBusiness(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? "";
  return getBusinessForMember(businessId);
}

// POST /api/products?businessId=... — create a product in the member's business.
export async function POST(request: NextRequest) {
  try {
    await requireVerifiedBusiness(request);
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const product = await createProduct(businessId, body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/products?businessId=...&q=... — list/search the member's products.
export async function GET(request: NextRequest) {
  try {
    await requireVerifiedBusiness(request);
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const products = await listProducts(businessId, { q });
    return NextResponse.json({ products, count: products.length });
  } catch (error) {
    return handleApiError(error);
  }
}
