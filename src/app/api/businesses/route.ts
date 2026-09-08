import { NextRequest, NextResponse } from "next/server";
import { createBusiness, getMyBusinesses } from "@/lib/business/business-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/businesses — create a new tenant business (authenticated).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { business } = await createBusiness({
      name: typeof body.name === "string" ? body.name.trim() : "",
      legalName: body.legalName,
      email: body.email,
      phone: body.phone,
      gstin: body.gstin,
      gstRegistered: body.gstRegistered,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      stateCode: body.stateCode,
      pincode: body.pincode,
      country: body.country,
      branchCode: typeof body.branchCode === "string" ? body.branchCode.trim() : undefined,
      branchName: body.branchName,
    });

    return NextResponse.json(
      {
        id: business.id,
        name: business.name,
        status: business.status,
        memberships: business.memberships.map((m) => ({
          role: m.role,
          status: m.status,
        })),
        branches: business.branches,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/businesses — list the caller's businesses (membership-scoped).
export async function GET() {
  try {
    const businesses = await getMyBusinesses();
    return NextResponse.json({ businesses });
  } catch (error) {
    return handleApiError(error);
  }
}
