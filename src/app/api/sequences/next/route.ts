import { NextRequest, NextResponse } from "next/server";
import { peekDocumentNumber } from "@/lib/sequence/sequence-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/sequences/next?businessId=...&financialYearId=...&kind=invoice
//
// Read-only preview of the document number the NEXT create would be given, so
// create forms can show the authoritative number instead of a locally cached
// counter. This never allocates: allocation happens only inside the create
// transaction via `allocateDocumentNumber`, which remains the sole owner of
// the counter.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const businessId = params.get("businessId") ?? "";
    const financialYearId = params.get("financialYearId") ?? "";
    const kind = params.get("kind") ?? "invoice";
    const prefix = params.get("prefix") ?? undefined;

    const next = await peekDocumentNumber(
      businessId,
      financialYearId,
      kind,
      prefix,
    );
    return NextResponse.json(next);
  } catch (error) {
    return handleApiError(error);
  }
}
