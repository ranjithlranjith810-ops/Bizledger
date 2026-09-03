// Single source of truth for document presentation settings (payment terms,
// terms & conditions, GST/support info). Referenced by the invoice detail,
// sales-document print sheets, PDF, and the settings UI so no string is
// duplicated across the codebase.
import { CompanyProfile } from "@/types";

// Default payment terms shown on tax invoices when the account has not
// configured its own value.
export const DEFAULT_PAYMENT_TERMS = "Immediate (NEFT/RTGS/CHEQUE)";

// Company-wide default Terms & Conditions rendered when the account has not
// overridden them. Shown as numbered clauses.
export const DEFAULT_INVOICE_TERMS = [
  "Goods once sold or ordered will not be taken back.",
  "Replacement / repairs will be done only for genuine manufacturing defects.",
  "Payment to be made as per the agreed payment terms before dispatch of goods.",
  "Interest @ 18% p.a. shall be charged on overdue amounts.",
  "Subject to the jurisdiction of the courts in Tamil Nadu.",
];

// Resolve the payment terms to display for a given company profile. Falls back
// to the product default when the account has not set its own value.
export function resolvePaymentTerms(profile: CompanyProfile | null | undefined): string {
  const configured = profile?.paymentTerms?.trim();
  return configured || DEFAULT_PAYMENT_TERMS;
}

// Resolve the Terms & Conditions block. Returns the numbered clauses when a
// custom value is set; otherwise the default set. Returns an empty array when
// the terms are intentionally left blank (renders no section).
export function resolveInvoiceTerms(profile: CompanyProfile | null | undefined): string[] {
  const configured = profile?.invoiceTerms?.trim();
  if (configured) {
    return configured.split(/\n+/).filter((c) => c.trim().length > 0);
  }
  return DEFAULT_INVOICE_TERMS;
}

// Custom GST / support line shown as informational text on the invoice. Hidden
// entirely when the account has not configured it.
export function resolveGstSupportInfo(profile: CompanyProfile | null | undefined): string {
  return profile?.gstSupportInfo?.trim() ?? "";
}