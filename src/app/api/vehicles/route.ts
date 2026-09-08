import { NextRequest, NextResponse } from "next/server";
import {
  createVehicle,
  listVehicles,
} from "@/lib/vehicle/vehicle-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/vehicles?businessId=... -- register a vehicle in the member's business.
export async function POST(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const body = await request.json().catch(() => ({}));
    const vehicle = await createVehicle(businessId, body);
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/vehicles?businessId=... -- list the member's business vehicles with
// optional search/status/vehicleType filters (frontend behaviour).
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
    const opts = {
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      vehicleType: request.nextUrl.searchParams.get("vehicleType") ?? undefined,
    };
    const vehicles = await listVehicles(businessId, opts);
    return NextResponse.json({ vehicles });
  } catch (error) {
    return handleApiError(error);
  }
}