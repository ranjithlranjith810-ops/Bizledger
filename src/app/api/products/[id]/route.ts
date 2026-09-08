import { NextRequest, NextResponse } from "next/server";
import {
  getProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/product/product-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/products/[id]?businessId=...
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const product = await getProduct(businessId, id);
    return NextResponse.json({ product });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/products/[id]?businessId=...
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const product = await updateProduct(businessId, id, body);
    return NextResponse.json({ product });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/products/[id]?businessId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const result = await deleteProduct(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
