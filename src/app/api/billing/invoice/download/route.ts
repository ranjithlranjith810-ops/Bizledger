import { NextRequest } from "next/server";
import {
  ForbiddenError,
  requireBusinessRole,
} from "@/lib/business/business-service";
import { getBillingPaymentDetailDto } from "@/lib/billing/billing-history-service";
import {
  handleApiError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/business/api-error";
import {
  invoiceDownloadFilename,
  renderInvoicePdf,
} from "@/lib/billing/invoice-pdf";

// GET /api/billing/invoice/download?businessId=...&paymentId=... — server-side
// PDF download of a VERIFIED-payment receipt (Phase 8D).
//
//   Auth:   identical to GET /api/billing/invoice — OWNER/ADMIN ACTIVE member
//           of the payment's own business only (401 anonymous, 404 unknowns,
//           403 lower roles / inactive membership / inactive business).
//   Body:   none.
//   Reads:  the exact BillingInvoice dto the detail page renders; NO document
//           numbers are minted here (allocateBillingNumber / billing_sequence
//           are untouched), so downloading can never re-sequence invoices.
//   Response: attachment PDF (filename "Invoice_<invoiceNumber>.pdf").
//   Scope:  READ-ONLY. 409 when the payment has no receipt yet.
export async function GET(request: NextRequest) {
  try {
    const businessId =
      request.nextUrl.searchParams.get("businessId")?.trim() ?? "";
    const paymentId =
      request.nextUrl.searchParams.get("paymentId")?.trim() ?? "";

    if (businessId.length === 0) {
      throw new ValidationError("businessId is required");
    }
    if (paymentId.length === 0) {
      throw new ValidationError("paymentId is required");
    }

    const { business, membership } = await requireBusinessRole(businessId, [
      "OWNER",
      "ADMIN",
    ]);
    if (membership.status !== "ACTIVE") {
      throw new ForbiddenError("Membership is not active");
    }
    if (business.status !== "ACTIVE") {
      throw new ForbiddenError("Business is not active");
    }

    const detail = await getBillingPaymentDetailDto(business.id, paymentId);
    if (!detail) {
      throw new ResourceNotFoundError("Payment not found");
    }
    if (!detail.invoice) {
      throw new ValidationError(
        "No receipt available for this payment attempt yet.",
      );
    }

    const bytes = await renderInvoicePdf(detail);
    const body = Buffer.from(bytes);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceDownloadFilename(
          detail.invoice.invoiceNumber,
        )}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}