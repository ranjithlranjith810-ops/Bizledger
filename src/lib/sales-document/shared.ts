// Shared server-side helpers for the Quotation / Estimate / PurchaseOrder
// services. Reuses the single GST engine (src/lib/invoice.ts) and the Phase 3B
// atomic sequence service — nothing in here recomputes GST arithmetic or
// numbering. Validation and snapshot rules mirror the Invoice service so every
// sales document family behaves identically at the API boundary.

import { ValidationError } from "@/lib/business/api-error";
import { checkImageDataUrl } from "@/lib/image-data-url";
import { INDIAN_STATES } from "@/lib/india";
import { calculateInvoiceTotals, round2, resolveTaxType } from "@/lib/invoice";

export const MAX_STRING = 1000;
export const MAX_ITEMS = 100;

// India GST slabs currently used by the app (relative GST rate %).
export const GST_RATES: number[] = [0, 0.25, 3, 5, 12, 18, 28];

export const PRICING_MODES = ["inclusive", "exclusive"] as const;
export type PricingModeT = (typeof PRICING_MODES)[number];

export const QUOTATION_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
] as const;

export const ESTIMATE_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
] as const;

export const PO_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Partially Received",
  "Received",
  "Cancelled",
] as const;

export type QuotationStatusT = (typeof QUOTATION_STATUSES)[number];
export type EstimateStatusT = (typeof ESTIMATE_STATUSES)[number];
export type PoStatusT = (typeof PO_STATUSES)[number];

// ------------------------------------------------------------------ primitives
export function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function shortText(v: unknown, field: string): string | undefined {
  const s = str(v);
  if (s && s.length > MAX_STRING) throw new ValidationError(`${field} is too long`);
  return s;
}

export function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

/**
 * PATCH safety guard: every document's identity/numbering/conversion fields are
 * immutable once created. Any attempt to supply them on an update is rejected
 * (400) rather than silently ignored, so callers can never drift the database
 * into an inconsistent accounting state. Unknown (non-protected) keys are
 * ignored downstream.
 */
export function rejectProtectedKeys(raw: Record<string, unknown>, keys: readonly string[]) {
  for (const k of keys) {
    if (raw[k] !== undefined) {
      throw new ValidationError(`Field '${k}' is immutable and cannot be changed`);
    }
  }
}

export function validateId(id: unknown, field = "Missing resource id"): string {
  const v = str(id);
  if (!v) throw new ValidationError(field);
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

export function validateMoney(v: unknown, field: string): number {
  const n = num(v);
  if (n == null) throw new ValidationError(`${field} is required`);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field} must be a non-negative number`);
  return n;
}

export function requiredIsoDate(v: unknown, field: string): Date {
  const raw = str(v);
  if (!raw) throw new ValidationError(`${field} is required`);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`);
  return d;
}

export function optionalIsoDate(v: unknown, field: string): Date | null {
  const raw = str(v);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`);
  return d;
}

export function normalizePricingMode(pricingMode: string): PricingModeT {
  if (!(PRICING_MODES as readonly string[]).includes(pricingMode)) {
    throw new ValidationError("Invalid pricing mode. Must be inclusive or exclusive");
  }
  return pricingMode as PricingModeT;
}

// ----------------------------------------------------------------- ancestor helpers
export function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ? String(p).trim() : "")).filter(Boolean).join(", ");
}

// Resolve the seller's canonical 2-digit GST state code from the Business row.
// Prefer the explicit `stateCode` column; fall back to a state *name* via the
// INDIAN_STATES registry. Never trusts the client for tax decisions.
export function sellerStateCode(business: {
  stateCode: string | null;
  state: string | null;
}): string {
  const explicit = String(business.stateCode ?? "").trim();
  if (explicit) return explicit;
  const raw = String(business.state ?? "").trim();
  const bare = raw.replace(/\s*\(\d+\)\s*$/, "").trim();
  const matched = INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === bare.toLowerCase(),
  );
  return matched ? matched.code : "";
}

// ------------------------------------------------------------------- item model
export interface NormalizedItem {
  productId: string | null;
  productName: string;
  sku: string | null;
  hsnSac: string | null;
  unit: string | null;
  quantity: number;
  rate: number;
  gstRate: number;
}

export function normalizeItems(
  rawItems: unknown,
  label: string,
): NormalizedItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ValidationError(`At least one ${label} item is required`);
  }
  if (rawItems.length > MAX_ITEMS) {
    throw new ValidationError(`${label} cannot have more than ${MAX_ITEMS} items`);
  }
  return rawItems.map((it, idx) => {
    const item = (it ?? {}) as Record<string, unknown>;
    const prefix = `items[${idx}]`;
    const productIdRaw = str(item.productId);
    const description = shortText(item.description ?? item.productName, `${prefix}.description`) ?? "";
    if (!description) throw new ValidationError(`${prefix}.description is required`);
    const quantity = num(item.quantity);
    if (quantity == null || quantity <= 0) {
      throw new ValidationError(`${prefix}.quantity must be greater than 0`);
    }
    if (quantity > 1_000_000) throw new ValidationError(`${prefix}.quantity is too large`);
    const rate = validateMoney(item.rate, `${prefix}.rate`);
    if (rate > 100_000_000) throw new ValidationError(`${prefix}.rate is too large`);
    const gstRaw = num(item.gstRate);
    if (gstRaw == null) throw new ValidationError(`${prefix}.gstRate is required`);
    if (!GST_RATES.includes(gstRaw)) {
      throw new ValidationError(`${prefix}.gstRate must be one of: ${GST_RATES.join(", ")}`);
    }
    const unit = str(item.unit) ?? "Pcs";
    const sku = shortText(item.sku, `${prefix}.sku`) ?? null;
    const hsnSac = shortText(item.hsnSac, `${prefix}.hsnSac`) ?? null;

    return {
      productId: productIdRaw ? validateId(productIdRaw, `${prefix}.productId is invalid`) : null,
      productName: description,
      sku,
      hsnSac,
      unit,
      quantity,
      rate,
      gstRate: gstRaw,
    };
  });
}

// ---------------------------------------------------------------- GST + totals
export interface ComputeTotalsResult {
  taxType: "intrastate" | "interstate";
  placeOfSupplyCode: string;
  lines: ReturnType<typeof calculateInvoiceTotals>["lines"];
  subtotal: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
}

// Server-side recomputation of document totals with the shared GST engine.
// Client-sent totals are never trusted. Tax type is derived from the seller's
// state code (own Business row) vs the place-of-supply code.
export function computeDocumentTotals(
  items: NormalizedItem[],
  pricingMode: PricingModeT,
  businessStateCode: string,
  placeOfSupplyCodeInput: unknown,
): ComputeTotalsResult {
  const placeOfSupplyCode = String(placeOfSupplyCodeInput ?? "").trim();
  if (placeOfSupplyCode && !/^\d{2}$/.test(placeOfSupplyCode)) {
    throw new ValidationError("placeOfSupplyCode must be a 2-digit state code");
  }
  const taxType = resolveTaxType(businessStateCode, placeOfSupplyCode);
  const totals = calculateInvoiceTotals(
    items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.rate,
      gstRate: it.gstRate,
      pricingMode,
    })),
    pricingMode,
    taxType,
  );
  return {
    taxType,
    placeOfSupplyCode,
    lines: totals.lines,
    subtotal: round2(totals.subtotal),
    taxableAmount: round2(totals.subtotal),
    cgst: round2(totals.cgst),
    sgst: round2(totals.sgst),
    igst: round2(totals.igst),
    totalTax: round2(totals.totalTax),
    grandTotal: round2(totals.grandTotal),
  };
}

// ---------------------------------------------------------------- snapshots
/**
 * The seller (company) fields captured on a document, split by how each is
 * validated. The image pair is stored as an inline base64 data URL (see
 * src/lib/image-data-url.ts) and is deliberately NOT run through the generic
 * MAX_STRING short-text cap.
 */
const COMPANY_SNAPSHOT_TEXT_FIELDS = [
  "companyName",
  "businessType",
  "ownerName",
  "mobile",
  "email",
  "website",
  "streetAddress",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "country",
  "gstin",
  "pan",
  "udyamNo",
  "bankName",
  "accountNumber",
  "ifscCode",
  "upiId",
  "invoiceTerms",
  "paymentTerms",
  "gstSupportInfo",
] as const;

const COMPANY_SNAPSHOT_IMAGE_FIELDS = ["logoUrl", "digitalSignatureUrl"] as const;

/**
 * The AUTHORITATIVE company profile for a business, read from the row the
 * server already loaded for the permission check.
 *
 * Document snapshots are built from this instead of from a client-supplied
 * `company` object, for the same reason customer snapshots are built from the
 * customer master row: the persisted document must record who the seller
 * actually is, so a caller cannot forge companyName / gstin / address /
 * signature on a create request.
 */
export function companyProfileRecord(business: {
  companyProfileJson?: unknown;
} | null | undefined): Record<string, unknown> | null {
  const json = business?.companyProfileJson;
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  return json as Record<string, unknown>;
}

/**
 * Build the historical seller (company) snapshot from the JSON the caller
 * supplies - which for every document service is `companyProfileRecord(business)`,
 * i.e. the authoritative stored profile. Purely a render snapshot - it never
 * feeds tax decisions.
 */
export function buildCompanySnapshot(
  raw: Record<string, unknown> | null,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const k of COMPANY_SNAPSHOT_TEXT_FIELDS) {
    const v = shortText(raw[k], `company.${k}`);
    if (v !== undefined) out[k] = v;
  }
  // Image payloads: validated as image data URLs and passed through verbatim.
  for (const k of COMPANY_SNAPSHOT_IMAGE_FIELDS) {
    const { value, error } = checkImageDataUrl(raw[k]);
    if (error) throw new ValidationError(`company.${k} ${error}`);
    if (value !== undefined) out[k] = value;
  }
  return out;
}

export function buildCustomerSnapshot(customer: {
  name: string;
  gstin: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPincode: string | null;
  billingCountry: string | null;
  contactMobile: string | null;
  stateCode: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string | null) => {
    const s = v ? String(v).trim() : "";
    if (s) out[k] = s;
  };
  set("name", customer.name);
  set("gstin", customer.gstin);
  const address = joinAddress([
    customer.billingAddressLine1,
    customer.billingAddressLine2,
    customer.billingCity,
    customer.billingState,
    customer.billingPincode,
  ]);
  if (address) out["address"] = address;
  set("city", customer.billingCity);
  set("state", customer.billingState);
  set("pincode", customer.billingPincode);
  set("country", customer.billingCountry);
  set("stateCode", customer.stateCode);
  set("phone", customer.contactMobile);
  return out;
}

export function buildVendorSnapshot(
  raw: Record<string, unknown> | null,
): Record<string, string> {
  if (!raw || typeof raw !== "object") throw new ValidationError("vendor is required");
  const s = (k: string) => shortText(raw[k], `vendor.${k}`);
  const name = s("name");
  if (!name) throw new ValidationError("vendor.name is required");
  const out: Record<string, string> = { name };
  for (const k of ["contactPerson", "email", "phone", "gstin", "address"]) {
    const v = s(k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}