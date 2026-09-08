import { NextRequest, NextResponse } from "next/server";
import {
  getVehicle,
  updateVehicle,
  deleteVehicle,
} from "@/lib/vehicle/vehicle-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/vehicles/[id]?businessId=... -- one vehicle in the member's business
// (404 for other-tenant or nonexistent ids, no disclosure).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const vehicle = await getVehicle(businessId, id);
    return NextResponse.json({ vehicle });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/vehicles/[id]?businessId=...
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const vehicle = await updateVehicle(businessId, id, body);
    return NextResponse.json({ vehicle });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/vehicles/[id]?businessId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const result = await deleteVehicle(businessId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}