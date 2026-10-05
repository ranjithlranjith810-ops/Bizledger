import { NextRequest, NextResponse } from "next/server";
import {
  getBusinessForMember,
  assertPermission,
  updateBusinessForMember,
} from "@/lib/business/business-service";
import {
  handleApiError,
  ValidationError,
} from "@/lib/business/api-error";

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
    const ctx = await getBusinessForMember(id);
    const { business, membership, branches } = ctx;

    // F3: the tenant profile is settings-grade data. Members WITHOUT
    // `settings.view` (STAFF by baseline, or any role whose per-member
    // override revoked it) are NOT given the private master record — no
    // GSTIN, registered address, or branch topology. They receive a minimal
    // safe DTO sufficient for everyday app use. OWNER/ADMIN/MANAGER (and any
    // override granting settings.view) keep the full profile unchanged.
    const mayViewSettings = (() => {
      try {
        assertPermission(ctx, "settings", "view");
        return true;
      } catch {
        return false;
      }
    })();

    if (!mayViewSettings) {
      return NextResponse.json({
        business: {
          id: business.id,
          name: business.name,
          status: business.status,
        },
        membership: {
          role: membership.role,
          status: membership.status,
        },
        branches: [],
      });
    }

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
      // Rich company profile (nullable — not yet persisted on older tenants).
      companyProfile: business.companyProfileJson as Record<string, unknown> | null,
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

// PATCH /api/businesses/[id] — persist the company profile for the caller's
// own business (Settings -> Company Profile). Server-authoritative: gated on
// `settings.edit`, payload whitelisted and validated in the service layer. The
// response returns the normalized profile plus the synced scalar business
// record so the client is always replaced with ground truth.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Expected a JSON object.");
    }

    const { business, companyProfile } = await updateBusinessForMember(id, body);

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
        updatedAt: business.updatedAt,
      },
      companyProfile,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
