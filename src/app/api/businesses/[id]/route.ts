import { NextRequest, NextResponse } from "next/server";
import { getBusinessForMember } from "@/lib/business/business-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/businesses/[id] — resolve ONE tenant business, verified by the
// authenticated caller's own membership. The [id] from the URL is only a
// requested target; the server returns the business only if the caller is a
// member. A non-member receives an identical 404 as a nonexistent business,
// so no cross-tenant information is leaked.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { business, membership, branches } = await getBusinessForMember(id);

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        legalName: business.legalName,
        email: business.email,
        phone: business.phone,
        gstin: business.gstin,
        gstRegistered: business.gstRegistered,
        addressLine1: business.addressLine1,
        addressLine2: business.addressLine2,
        city: business.city,
        state: business.state,
        stateCode: business.stateCode,
        pincode: business.pincode,
        country: business.country,
        status: business.status,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt,
      },
      membership: {
        role: membership.role,
        status: membership.status,
      },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isActive: b.isActive,
        isDefault: b.isDefault,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
