// Server-side Invoice service layer (multi-tenant, historical).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) before touching any data.
// The `businessId` is a REQUESTED TARGET only — the verified membership is the
// source of truth for the tenant scope. The customer, financial year and every
// product are additionally re-verified as belonging to that same business, so a
// caller can never attach another tenant's customer/product/FY to an invoice.
//
// HISTORICAL CORRECTNESS: The invoice is the accounting record. The number is
// minted from the Phase 3B atomic sequence service and stored permanently; the
// per-line product snapshots, the customer snapshot, and the company (seller)
// snapshot are captured at creation time so later edits to Product/Customer/
// Business settings never silently rewrite an issued invoice.
//
// TAX / GST: Totals are RECOMPUTED server-side using the exact same GST engine
// the frontend uses (src/lib/invoice.ts) — client-sent totals are never
// trusted. Tax type (CGST+SGST vs IGST) is derived from the seller's state code
// (Business.stateCode) vs the place-of-supply state code.

import { prisma } from "@/lib/prisma";
import { requireBusinessPermission } from "@/lib/business/business-service";
import { assertCreateAllowed } from "@/lib/billing/entitlements-server";
import {
  ValidationError,
  ResourceNotFoundError,
  ConflictError,
  DuplicateResourceError,
} from "@/lib/business/api-error";
import {
  buildCompanySnapshot,
  companyProfileRecord,
  rejectProtectedKeys,
} from "@/lib/sales-document/shared";
import {
  assertFinancialYearActive,
  financialYearForBusinessDate,
} from "@/lib/financial-year/financial-year-service";
import {
  allocateDocumentNumber,
  parseTrailingSequence,
  reserveSequenceAtLeast,
} from "@/lib/sequence/sequence-service";
import { drawDownInvoiceStock } from "@/lib/inventory/stock";
import { INVOICE_STATUS_TRANSITIONS as SHARED_INVOICE_STATUS_TRANSITIONS } from "@/lib/sales-document/status-transitions";
import { INDIAN_STATES } from "@/lib/india";
import {
  calculateInvoiceTotals,
  round2,
  resolveTaxType,
  buildInvoiceNumber,
  normalizeManualInvoiceNumber,
} from "@/lib/invoice";
import { Prisma } from "@/generated/prisma/client";

const MAX_STRING = 1000;
const MAX_ITEMS = 100;

const INVOICE_STATUSES = [
  "Paid",
  "Pending",
  "Overdue",
  "Draft",
  "Cancelled",
] as const;

// F4 — statuses a NEW invoice may be born with. "Paid" (a real payment event)
// and "Cancelled" (a closure decision) are recorded through explicit server-side
// transitions (`transitionInvoiceStatus`), never chosen by the client at create
// time. The workflow is Draft -> Pending -> Paid, with Overdue/Cancelled reached
// only by server-authorized lifecycle operations.
const INVOICE_CREATEABLE_STATUSES = ["Draft", "Pending", "Overdue"] as const;

const PRICING_MODES = ["inclusive", "exclusive"] as const;

// India GST slabs currently used by the app (relative GST rate %). Forbidding
// arbitrary rates keeps master data and invoice lines coherent.
const GST_RATES: number[] = [0, 0.25, 3, 5, 12, 18, 28];

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

function validateId(id: unknown, field = "Missing resource id"): string {
  const v = str(id);
  if (!v) throw new ValidationError(field);
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

function shortText(v: unknown, field: string): string | undefined {
  const s = str(v);
  if (s && s.length > MAX_STRING) throw new ValidationError(`${field} is too long`);
  return s;
}

// Join the customer billing address the same way the frontend renders it on an
// invoice ("addr1, city, state, pincode"), falling back to available parts.
function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ? String(p).trim() : "")).filter(Boolean).join(", ");
}

type InvoiceStatusT = (typeof INVOICE_STATUSES)[number];
type PricingModeT = (typeof PRICING_MODES)[number];

export interface InvoiceItemInput {
  productId?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  gstRate?: number;
}

interface NormalizedItem {
  productId: string | null;
  productName: string;
  sku: string | null;
  hsnSac: string | null;
  unit: string | null;
  quantity: number;
  rate: number;
  gstRate: number;
}

function validateMoney(v: unknown, field: string): number {
  const n = num(v);
  if (n == null) throw new ValidationError(`${field} is required`);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field} must be a non-negative number`);
  return n;
}

// Identity and accounting fields are immutable once minted (id, tenant binding,
// financial-year binding, prefix, conversion linkage). Attempting to supply any
// of them on the ordinary PATCH is rejected (400) — those are engine-owned and
// never client-editable.
//
// `invoiceNumber` and `items` are intentionally NOT in this list: under the
// document-edit rule they are the ONLY post-creation fields a business may
// change, through a strict allowlist inside updateInvoice (the database's
// business-scoped unique constraint on (businessId, invoiceNumber) is the
// concurrency backstop for renumbering). Editing a line may change the product
// (swap in another product from the tenant's master), the quantity, or the
// price — never the HSN/SAC, unit, GST rate, discount or snapshot fields, which
// are re-derived from the product master (or kept frozen for custom lines) and
// recalculated by the GST engine. Everything else — customer, dates, notes/
// terms, place of supply, e-way bill, company snapshot — is created-and-frozen.
const INVOICE_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "createdAt",
  "updatedAt",
  "prefix",
  "invoicePrefix",
  "sourceDocument",
] as const;

// F4 — keys whose values are engine-computed (never client-supplied).
const INVOICE_TOTAL_KEYS = [
  "subtotal",
  "totalDiscount",
  "taxableAmount",
  "cgst",
  "sgst",
  "igst",
  "totalTax",
  "grandTotal",
] as const;

// --------------------------------------------------------------------------
// Input normalization + per-line GST computation (mirrors src/lib/invoice.ts)
// --------------------------------------------------------------------------
function normalizeInvoiceItems(rawItems: unknown): NormalizedItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ValidationError("At least one invoice item is required");
  }
  if (rawItems.length > MAX_ITEMS) {
    throw new ValidationError(`Invoice cannot have more than ${MAX_ITEMS} items`);
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

function normalizeInvoicePayload(raw: Record<string, unknown>) {
  const customerId = validateId(raw.customerId, "customerId is required");

  const items = normalizeInvoiceItems(raw.items);

  return {
    customerId,
    items,
    invoiceDate: str(raw.invoiceDate),
    status: (str(raw.status) ?? "Pending") as InvoiceStatusT,
    notes: shortText(raw.notes, "notes"),
  notesTerms: shortText(raw.terms, "terms"),
  placeOfSupply: str(raw.placeOfSupply),
  placeOfSupplyCode: str(raw.placeOfSupplyCode),
  prefix: str(raw.invoicePrefix ?? raw.prefix) ?? undefined,
  invoiceNumber: str(raw.invoiceNumber) ?? undefined,
  company: (raw.company ?? null) as Record<string, unknown> | null,
  vehicle: (raw.vehicle ?? null) as Record<string, unknown> | null,
    dueDate: str(raw.dueDate),
    ewayBillNumber: shortText(raw.ewayBillNumber, "ewayBillNumber"),
    ewayBillDate: str(raw.ewayBillDate),
  };
}

// Build the historical seller (company) snapshot. Accepts the snapshot the
// frontend already holds (CompanyProfile-equivalent); never depends on the
// mutable Business row alone because the richer profile (bank/UPI/terms/prefix)
// lives client-side today.
// Resolve the seller's canonical 2-digit GST state code from the Business row.
// Prefer the explicit `stateCode` column; fall back to a state *name* (plain or
// formatted "Tamil Nadu (33)") via the INDIAN_STATES registry. Never trusts the
// client for tax decisions.
function sellerStateCode(business: {
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

// The seller (company) snapshot is built by the shared helper imported above
// (buildCompanySnapshot + companyProfileRecord from @/lib/sales-document/shared)
// so the Invoice, Quotation and Estimate services cannot drift apart. It is fed
// the authoritative stored profile, never a client-supplied object, and it
// validates logoUrl / digitalSignatureUrl as image data URLs rather than
// through the short-text cap.

// Build the customer snapshot from the CURRENT customer master row (server-side,
// authoritative, tenant-scoped). Includes every field the invoice PDF renders.
function buildCustomerSnapshot(customer: {
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

function buildVehicleSnapshot(raw: Record<string, unknown> | null): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const s = (k: string) => shortText(raw[k], `vehicle.${k}`);
  const out: Record<string, string> = {};
  for (const k of ["vehicleNumber", "driverName", "status"]) {
    const v = s(k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Persist a financial-year lookup + the full invoice intentionally. Keeps
// response helpers and DB writes in one place.
function toInvoiceJson(i: {
  id: string;
  businessId: string;
  financialYearId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerId: string | null;
  placeOfSupply: string | null;
  placeOfSupplyCode: string | null;
  taxType: string;
  status: string;
  pricingMode: string;
  subtotal: Prisma.Decimal | number;
  totalDiscount: Prisma.Decimal | number;
  taxableAmount: Prisma.Decimal | number;
  cgst: Prisma.Decimal | number;
  sgst: Prisma.Decimal | number;
  igst: Prisma.Decimal | number;
  totalTax: Prisma.Decimal | number;
  grandTotal: Prisma.Decimal | number;
  notes: string | null;
  terms: string | null;
  dueDate: Date | null;
  ewayBillNumber: string | null;
  ewayBillDate: Date | null;
  customerSnapshot: unknown;
  companySnapshot: unknown;
  vehicleSnapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
  items?: {
    id: string;
    productId: string | null;
    productName: string;
    sku: string | null;
    hsnSac: string | null;
    unit: string | null;
    quantity: Prisma.Decimal | number;
    rate: Prisma.Decimal | number;
    gstRate: Prisma.Decimal | number;
    taxableAmount: Prisma.Decimal | number;
    cgst: Prisma.Decimal | number;
    sgst: Prisma.Decimal | number;
    igst: Prisma.Decimal | number;
    taxAmount: Prisma.Decimal | number;
    totalAmount: Prisma.Decimal | number;
    pricingMode: string;
  }[];
}) {
  return {
    id: i.id,
    businessId: i.businessId,
    financialYearId: i.financialYearId,
    invoiceNumber: i.invoiceNumber,
    invoiceDate: i.invoiceDate.toISOString(),
    customerId: i.customerId,
    placeOfSupply: i.placeOfSupply,
    placeOfSupplyCode: i.placeOfSupplyCode,
    taxType: i.taxType,
    status: i.status,
    pricingMode: i.pricingMode,
    subtotal: Number(i.subtotal),
    totalDiscount: Number(i.totalDiscount),
    taxableAmount: Number(i.taxableAmount),
    cgst: Number(i.cgst),
    sgst: Number(i.sgst),
    igst: Number(i.igst),
    totalTax: Number(i.totalTax),
    grandTotal: Number(i.grandTotal),
    notes: i.notes,
    terms: i.terms,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    ewayBillNumber: i.ewayBillNumber,
    ewayBillDate: i.ewayBillDate ? i.ewayBillDate.toISOString() : null,
    customer: i.customerSnapshot,
    company: i.companySnapshot,
    vehicle: i.vehicleSnapshot,
    items: (i.items ?? []).map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      sku: it.sku,
      hsnSac: it.hsnSac,
      unit: it.unit,
      quantity: Number(it.quantity),
      rate: Number(it.rate),
      pricingMode: it.pricingMode,
      gstRate: Number(it.gstRate),
      taxableAmount: Number(it.taxableAmount),
      cgst: Number(it.cgst),
      sgst: Number(it.sgst),
      igst: Number(it.igst),
      taxAmount: Number(it.taxAmount),
      totalAmount: Number(it.totalAmount),
    })),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export type InvoiceJson = ReturnType<typeof toInvoiceJson>;

function normalizeStatus(status: string): InvoiceStatusT {
  if (!(INVOICE_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError("Invalid invoice status");
  }
  return status as InvoiceStatusT;
}

function normalizePricingMode(pricingMode: string): PricingModeT {
  if (!(PRICING_MODES as readonly string[]).includes(pricingMode)) {
    throw new ValidationError("Invalid pricing mode. Must be inclusive or exclusive");
  }
  return pricingMode as PricingModeT;
}

// Conversion reference (sourceDocument.type/id): when creating an invoice from
// a source quotation or estimate, the source document is updated IN THE SAME
// TRANSACTION (one-time conversion reference + Accepted status). The estimate /
// quotation itself is never deleted or otherwise mutated — it stays fully
// renderable. The frontend stores the relationship on the source document, so
// the created invoice carries no back-reference.
function normalizeSourceDocument(
  input: unknown,
): { type: "quotation" | "estimate"; id: string } | null {
  if (input == null) return null;
  const obj = (input ?? {}) as Record<string, unknown>;
  const type = str(obj.type);
  const id = str(obj.id);
  if (type !== "quotation" && type !== "estimate") {
    throw new ValidationError("sourceDocument.type must be quotation or estimate");
  }
  return { type, id: validateId(id, "sourceDocument.id is invalid") };
}

/**
 * Create an invoice in the member's verified business.
 *
 * Atomicity: number allocation and invoice+items insert happen inside ONE
 * transaction. If the transaction fails, the transaction rolls back and the
 * sequence does NOT advance (no gap, no duplicate). This is the strongest
 * policy — better than gap-tolerant allocation — while remaining fully
 * backwards compatible with the existing sequence API.
 */
export async function createInvoice(
  businessIdInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "create");
  const business = ctx.business;

  const pricingMode = normalizePricingMode(
    str(raw.pricingMode) ?? "inclusive",
  );
  const payload = normalizeInvoicePayload(raw);

  // Validate enum-ish values that need the payload.
  const status = normalizeStatus(payload.status);
  // F4: an invoice cannot be born Paid or Cancelled. "Mark as paid" is a real
  // payment lifecycle event performed server-side via `transitionInvoiceStatus`.
  if (!(INVOICE_CREATEABLE_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError(
      "Invoices cannot be created directly as Paid or Cancelled",
    );
  }
  const fyId = validateId(raw.financialYearId, "financialYearId is required");
  const sourceDocument = normalizeSourceDocument(raw.sourceDocument);

  const invoiceDate = payload.invoiceDate;
  if (!invoiceDate) throw new ValidationError("invoiceDate is required");
  const dateObj = new Date(invoiceDate);
  if (Number.isNaN(dateObj.getTime())) throw new ValidationError("invoiceDate is not a valid date");

  // Normalize the seller state code from the Business row (own record, not the
  // client form) and the place of supply from the payload. Only numeric codes
  // drive the tax decision.
  const businessStateCode = sellerStateCode(business);
  const placeOfSupplyCode = String(payload.placeOfSupplyCode ?? "").trim();
  if (placeOfSupplyCode && !/^\d{2}$/.test(placeOfSupplyCode)) {
    throw new ValidationError("placeOfSupplyCode must be a 2-digit state code");
  }
  const taxType = resolveTaxType(businessStateCode, placeOfSupplyCode);

  // Server-side recomputation of totals. Client totals are ignored.
  const lineTotals = calculateInvoiceTotals(
    payload.items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.rate,
      gstRate: it.gstRate,
      pricingMode,
    })),
    pricingMode,
    taxType,
  );

  const subtotal = round2(lineTotals.subtotal);
  const cgst = round2(lineTotals.cgst);
  const sgst = round2(lineTotals.sgst);
  const igst = round2(lineTotals.igst);
  const totalTax = round2(lineTotals.totalTax);
  const grandTotal = round2(lineTotals.grandTotal);
  const taxableAmount = round2(lineTotals.subtotal);

  // Product ids referenced by the item lines (productId lines pull their
  // snapshot from the product master at create time).
  const productIds = [
    ...new Set(payload.items.map((it) => it.productId).filter((v): v is string => v !== null)),
  ];

  // Verify tenant ownership of all referenced masters inside the transaction.
  // Reads are parallelized and the interactive-transaction budget is raised:
  // allocation + insert spans several WAN round-trips on hosted Postgres and
  // the 5s Prisma default would abort long-running (or cold) creates.
  // Verify tenant ownership of all referenced masters (reads).
  // Reads live OUTSIDE the transaction so the transaction connection is held as
  // briefly as possible (allocation + insert only) — long-lived interactive
  // transactions starve the pool under concurrency on hosted Postgres. The
  // allocation + invoice insert remain a single atomic unit; the unique
  // (businessId, invoiceNumber) constraint is the backstop against duplicates.
  const [customer, fy, found, sourceQuotation, sourceEstimate] = await Promise.all([
    prisma.customer.findFirst({ where: { id: payload.customerId, businessId } }),
    prisma.financialYear.findFirst({ where: { id: fyId, businessId } }),
    productIds.length > 0
      ? prisma.product.findMany({
          where: { id: { in: productIds }, businessId },
          select: { id: true, name: true, sku: true, hsnSac: true, unit: true },
        })
      : Promise.resolve([] as {
          id: string;
          name: string;
          sku: string | null;
          hsnSac: string | null;
          unit: string | null;
        }[]),
    sourceDocument?.type === "quotation"
      ? prisma.quotation.findFirst({
          where: { id: sourceDocument.id, businessId },
          select: { id: true, status: true, convertedInvoiceId: true },
        })
      : Promise.resolve(null),
    sourceDocument?.type === "estimate"
      ? prisma.estimate.findFirst({
          where: { id: sourceDocument.id, businessId },
          select: { id: true, status: true, convertedInvoiceId: true },
        })
      : Promise.resolve(null),
  ]);
  if (!customer) throw new ResourceNotFoundError("Customer not found");
  if (!fy) throw new ResourceNotFoundError("Financial year not found");
  assertFinancialYearActive(fy);
  // F11 — date-owned FY authority: derive the FY from the invoice date and
  // verify it matches the client-supplied financialYearId. Never silently
  // replace the requested year; a mismatch is rejected with a 400.
  {
    const derived = await financialYearForBusinessDate(businessId, dateObj);
    if (!derived) {
      throw new ValidationError(
        `Invoice date ${invoiceDate} does not fall within any configured financial year; correct the invoice date or create the financial year first`,
      );
    }
    if (derived.id !== fy.id) {
      throw new ValidationError(
        `The financial year is derived from the invoice date: ${invoiceDate} belongs to ${derived.name}, not the requested ${fy.name}`,
      );
    }
  }
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
  }
  if (sourceDocument?.type === "quotation") {
    if (!sourceQuotation) throw new ResourceNotFoundError("Quotation not found");
    if (sourceQuotation.convertedInvoiceId) {
      throw new ValidationError(
        "Quotation has already been converted to an invoice",
      );
    }
  }
  if (sourceDocument?.type === "estimate") {
    if (!sourceEstimate) throw new ResourceNotFoundError("Estimate not found");
    if (sourceEstimate.convertedInvoiceId) {
      throw new ValidationError(
        "Estimate has already been converted to an invoice",
      );
    }
  }
  const productById = Object.fromEntries(found.map((p) => [p.id, p]));

  const companySnapshot = buildCompanySnapshot(companyProfileRecord(business));
  const customerSnapshot = buildCustomerSnapshot(customer);
  const vehicleSnapshot = buildVehicleSnapshot(
    payload.vehicle as Record<string, unknown> | null,
  );

  const created = await prisma.$transaction(
    async (tx) => {
      // F3: the plan's invoice ceiling is enforced server-side inside this
      // transaction (business-row lock → rolling-period count → check) BEFORE
      // the number is allocated and the record inserted.
      await assertCreateAllowed(tx, businessId, "invoices");

      // Conversion guard, AUTHORITATIVE and in-transaction.
      //
      // `assertCreateAllowed` above takes an exclusive lock on the Business row,
      // so every other governed create for this business is serialized behind
      // this transaction. Re-reading the SOURCE document here — after the lock,
      // inside the same transaction that inserts the invoice — is what makes
      // "already converted" a real invariant.
      //
      // The pre-transaction read above is only a fast path: two concurrent
      // conversions of the SAME source both observe `convertedInvoiceId = null`
      // there, and (before the marker was written in this transaction) both
      // would insert an invoice and consume two quota slots. Re-checking under
      // the lock lets exactly one win; the loser gets the same 400 it would
      // have received sequentially.
      if (sourceDocument) {
        if (sourceDocument.type === "quotation" && sourceQuotation) {
          const lockedQuotation = await tx.quotation.findFirst({
            where: { id: sourceQuotation.id, businessId },
            select: { convertedInvoiceId: true },
          });
          if (lockedQuotation?.convertedInvoiceId) {
            throw new ValidationError(
              "Quotation has already been converted to an invoice",
            );
          }
        }
        if (sourceDocument.type === "estimate" && sourceEstimate) {
          const lockedEstimate = await tx.estimate.findFirst({
            where: { id: sourceEstimate.id, businessId },
            select: { convertedInvoiceId: true },
          });
          if (lockedEstimate?.convertedInvoiceId) {
            throw new ValidationError(
              "Estimate has already been converted to an invoice",
            );
          }
        }
      }

      // Stock draw-down — AUTHORITATIVE, server-side, and in the SAME
      // transaction as the invoice insert below. Duplicate lines are aggregated
      // and each product is drawn with one conditional UPDATE, so concurrent
      // invoices cannot both take the last unit and stock can never go
      // negative. A rejection must throw so the transaction aborts and undoes
      // any decrements already applied in this loop.
      const drawDown = await drawDownInvoiceStock(
        tx,
        businessId,
        payload.items,
        productById,
      );
      if (!drawDown.ok) {
        throw new ValidationError(drawDown.message);
      }

      // Number allocation. The server is the ONLY authority for an
      // auto-generated number: it is minted here, inside the same transaction
      // as the insert, from the FY-scoped sequence. A client preview is never
      // trusted and never sent in auto mode.
      //
      // A number is only honoured when the user explicitly asked for one
      // (invoiceNumberMode === "manual" upstream). It is normalized and checked
      // for business-scoped uniqueness; a collision is a 409 and the number is
      // never silently swapped for a different one. When a manual number is
      // used the counter is still advanced past it, so a later auto create
      // cannot hand out a number that is already taken.
      const requested = payload.invoiceNumber;
      let invoiceNumber: string;
      if (requested !== undefined && String(requested).trim() !== "") {
        const parsedManual = normalizeManualInvoiceNumber(requested);
        if (!parsedManual.ok) throw new ValidationError(parsedManual.error);
        invoiceNumber = parsedManual.value;

        const clash = await tx.invoice.findFirst({
          where: { businessId, invoiceNumber },
          select: { id: true },
        });
        if (clash) {
          throw new DuplicateResourceError(
            `Invoice number "${invoiceNumber}" is already in use in this business`,
          );
        }

        // Advance the counter beyond a manually chosen number so the next auto
        // allocation cannot collide with it. Best-effort: a manual number far
        // outside the sequence still cannot be reissued, because the unique
        // (businessId, invoiceNumber) constraint is the backstop.
        const manualSeq = parseTrailingSequence(invoiceNumber);
        if (manualSeq !== null) {
          await reserveSequenceAtLeast(tx, businessId, fyId, "invoice", manualSeq, payload.prefix);
        }
      } else {
        const allocated = await allocateDocumentNumber(
          businessId,
          fyId,
          "invoice",
          payload.prefix,
          { db: tx },
        );
        invoiceNumber = buildInvoiceNumber(
          allocated.prefix,
          fy.name,
          allocated.allocated,
        );
      }

      const invoice = await tx.invoice.create({
      data: {
        businessId,
        financialYearId: fyId,
        invoiceNumber,
        invoiceDate: dateObj,
        customerId: customer.id,
        placeOfSupply: payload.placeOfSupply,
        placeOfSupplyCode: placeOfSupplyCode || null,
        taxType,
        status,
        pricingMode,
        subtotal,
        totalDiscount: 0,
        taxableAmount,
        cgst,
        sgst,
        igst,
        totalTax,
        grandTotal,
        notes: payload.notes,
        terms: payload.notesTerms,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        ewayBillNumber: payload.ewayBillNumber,
        ewayBillDate: payload.ewayBillDate ? new Date(payload.ewayBillDate) : null,
        customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
        companySnapshot: companySnapshot as Prisma.InputJsonValue,
        vehicleSnapshot: vehicleSnapshot as Prisma.InputJsonValue,
        items: {
          create: payload.items.map((it, idx) => {
            const line = lineTotals.lines[idx];
            const prod = it.productId ? productById[it.productId] : undefined;
            return {
              productId: it.productId,
              productName: it.productName || (prod ? prod.name : it.productName),
              sku: it.sku || (prod ? prod.sku : null),
              hsnSac: it.hsnSac || (prod ? prod.hsnSac : null),
              unit: it.unit || (prod ? prod.unit : "Pcs"),
              quantity: it.quantity,
              rate: it.rate,
              pricingMode,
              gstRate: it.gstRate,
              taxableAmount: line.taxable,
              cgst: line.cgst,
              sgst: line.sgst,
              igst: line.igst,
              taxAmount: line.taxAmount,
              totalAmount: line.totalAmount,
            };
          }),
        },
      },
        include: { items: true },
      });

      // The conversion marker is written in the SAME transaction as the insert.
      // That is what makes the in-transaction guard above authoritative: the
      // marker becomes visible atomically with the invoice, and is already
      // committed by the time the Business-row lock is released, so a competing
      // conversion that acquires the lock next is guaranteed to observe it.
      // (It was previously a second, separate transaction, leaving a window in
      // which a duplicate invoice could be created with no marker at all.)
      if (sourceDocument?.type === "quotation" && sourceQuotation) {
        await tx.quotation.update({
          where: { id: sourceQuotation.id },
          data: {
            status: "Accepted",
            convertedInvoiceId: invoice.id,
            convertedInvoiceNumber: invoice.invoiceNumber,
            convertedAt: new Date(),
          },
        });
      }
      if (sourceDocument?.type === "estimate" && sourceEstimate) {
        await tx.estimate.update({
          where: { id: sourceEstimate.id },
          data: {
            status: "Accepted",
            convertedInvoiceId: invoice.id,
            convertedInvoiceNumber: invoice.invoiceNumber,
            convertedAt: new Date(),
          },
        });
      }

      return invoice;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  return toInvoiceJson(created);
}

/**
 * List invoices for the member's verified business, newest first.
 */
export async function listInvoices(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const rows = await prisma.invoice.findMany({
    where: { businessId },
    orderBy: { invoiceDate: "desc" },
    include: { items: true },
  });
  return rows.map(toInvoiceJson);
}

/**
 * Get one invoice by id within the member's verified business. 404 for
 * other-tenant or nonexistent ids (no disclosure).
 */
export async function getInvoice(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const invoice = await prisma.invoice.findFirst({
    where: { id, businessId },
    include: { items: true },
  });
  if (!invoice) throw new ResourceNotFoundError("Invoice not found");
  return toInvoiceJson(invoice);
}

// ---------------------------------------------------------------------------
// PATCH — the allowed post-creation edits: the invoice NUMBER and the PRODUCT /
// QUANTITY / PRICE of its lines.
//
// An invoice is created-and-frozen EXCEPT for this strict allowlist:
//   - `invoiceNumber` — the display number, validated by the pure, shared
//     invoice-number validator, business-scoped unique (database constraint is
//     the concurrency backstop, P2002 -> 409 DuplicateResourceError), and
//     applied without touching any other column.
//   - `items` — a line-for-line replacement of the EXISTING items (same length,
//     same product/custom structure). Each element may change the product
//     (swap in another product from the tenant's own master), the quantity, or
//     the price. The HSN/SAC, unit, GST rate and description are NEVER taken
//     from the client: for product-backed lines they are re-snapshotted from
//     the product master; for custom lines (no product) the frozen snapshot is
//     preserved and only quantity/price may change. All invoice and per-line
//     totals are recomputed by the GST engine using the invoice's stored
//     pricing mode and tax type.
//
// Status is a lifecycle fact owned by the dedicated /status endpoint; totals
// are engine-computed and never accepted from the client. Every other field
// (customer, dates, financial year, tax settings, discount, notes/terms, place
// of supply, e-way bill, snapshots) is rejected rather than silently ignored,
// so a stale edit form surfaces its failure instead of pretending success.
// ---------------------------------------------------------------------------
function normalizeInvoiceUpdateItems(
  rawItems: unknown,
  existingItems: {
    productId: string | null;
    productName: string;
    sku: string | null;
    hsnSac: string | null;
    unit: string | null;
    gstRate: Prisma.Decimal | number;
  }[],
): NormalizedItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ValidationError("At least one invoice item is required");
  }
  if (rawItems.length > MAX_ITEMS) {
    throw new ValidationError(`Invoice cannot have more than ${MAX_ITEMS} items`);
  }
  // Editing never restructures the invoice: lines map 1:1 to the stored ones,
  // so custom lines (no product) cannot be reordered, merged, or product-ified
  // behind the engine's back. Only product / quantity / price change on a line.
  if (rawItems.length !== existingItems.length) {
    throw new ValidationError(
      "The number of items cannot change when editing an invoice; modify the product, quantity or price of the existing lines",
    );
  }
  return rawItems.map((it, idx) => {
    const item = (it ?? {}) as Record<string, unknown>;
    const prefix = `items[${idx}]`;
    const prior = existingItems[idx];
    const productIdRaw = str(item.productId);
    const productId = productIdRaw
      ? validateId(productIdRaw, `${prefix}.productId is invalid`)
      : null;

    // A line cannot flip between a product-backed line and a custom line; the
    // snapshot fields of a custom line are frozen (only quantity/price change).
    if (Boolean(productId) !== Boolean(prior.productId)) {
      throw new ValidationError(
        `${prefix}.productId cannot change whether a line refers to a product; edit the existing ${prior.productId ? "product" : "custom"} line in place instead`,
      );
    }

    const quantity = num(item.quantity);
    if (quantity == null || quantity <= 0) {
      throw new ValidationError(`${prefix}.quantity must be greater than 0`);
    }
    if (quantity > 1_000_000) throw new ValidationError(`${prefix}.quantity is too large`);
    const rate = validateMoney(item.rate, `${prefix}.rate`);
    if (rate > 100_000_000) throw new ValidationError(`${prefix}.rate is too large`);

    if (productId == null) {
      return {
        productId: null,
        productName: prior.productName,
        sku: prior.sku ?? null,
        hsnSac: prior.hsnSac ?? null,
        unit: prior.unit ?? "Pcs",
        quantity,
        rate,
        gstRate: Number(prior.gstRate),
      };
    }
    // Product-backed line: tax fields are re-snapshotted from the master below
    // after the tenant-scoped product lookup.
    return {
      productId,
      productName: "",
      sku: null,
      hsnSac: null,
      unit: "Pcs",
      quantity,
      rate,
      gstRate: 0,
    };
  });
}

export async function updateInvoice(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  rejectProtectedKeys(raw, INVOICE_PROTECTED_KEYS);

  // F4 — status is a lifecycle fact, transitioned ONLY through the dedicated
  // status endpoint. A forged status on PATCH is rejected outright.
  if (raw.status !== undefined) {
    throw new ValidationError(
      "Invoice status must be changed via the invoice status endpoint",
    );
  }

  // F4 — totals are ALWAYS recomputed server-side by the GST engine; a client can
  // never rewrite the stored financial outcome of an invoice.
  for (const k of INVOICE_TOTAL_KEYS) {
    if (raw[k] !== undefined) {
      throw new ValidationError(
        "Invoice totals are computed by the server and cannot be supplied",
      );
    }
  }

  // Mass-assignment guard: `invoiceNumber` and `items` are the ONLY fields the
  // client may send on an update. Everything else is a content edit and is
  // rejected (400) instead of being dropped, so callers cannot drift the
  // database. Passing `items` as a non-array is also rejected (not treated as
  // "no edit").
  const allowedEditKeys = new Set(["invoiceNumber", "items"]);
  const contentKeys = Object.keys(raw).filter(
    (k) => !allowedEditKeys.has(k),
  );
  if (contentKeys.length > 0) {
    throw new ValidationError(
      `Invoices are immutable after creation; only the invoice number and product lines (product, quantity, price) can be edited (field${contentKeys.length === 1 ? "" : "s"}: ${contentKeys.join(", ")})`,
    );
  }
  if (raw.items !== undefined && !Array.isArray(raw.items)) {
    throw new ValidationError("items must be an array of invoice lines");
  }

  // Load the record scoped to the authorized business (404 for foreign/unknown,
  // no existence disclosure). An empty PATCH is a harmless no-op.
  const existing = await prisma.invoice.findFirst({
    where: { id, businessId },
    include: { items: true },
  });
  if (!existing) throw new ResourceNotFoundError("Invoice not found");

  const hasNumber = raw.invoiceNumber !== undefined;
  const hasItems = raw.items !== undefined;
  if (!hasNumber && !hasItems) return toInvoiceJson(existing);

  let nextNumber = existing.invoiceNumber;
  if (hasNumber) {
    const parsed = normalizeManualInvoiceNumber(raw.invoiceNumber);
    if (!parsed.ok) throw new ValidationError(parsed.error);
    nextNumber = parsed.value;
  }

  // Business-scoped uniqueness. The explicit pre-check gives a clear user error
  // for the common sequential-UI case; the database unique constraint on
  // (businessId, invoiceNumber) is the authoritative backstop for the race.
  if (nextNumber !== existing.invoiceNumber) {
    const duplicate = await prisma.invoice.findFirst({
      where: { id: { not: id }, businessId, invoiceNumber: nextNumber },
      select: { id: true },
    });
    if (duplicate) {
      throw new DuplicateResourceError(
        "An invoice with this number already exists in this business",
      );
    }
  }

  // Pure no-op: same number and no items edit -> no write at all.
  if (nextNumber === existing.invoiceNumber && !hasItems) {
    return toInvoiceJson(existing);
  }

  // Product/quantity/price edits produce a FULL server-side recomputation of
  // every line total and the invoice totals with the shared GST engine, using
  // the invoice's STORED pricing mode and tax type (both are frozen). The
  // client never supplies snapshot fields or totals.
  let itemEdit: {
    createRows: Prisma.InvoiceItemCreateWithoutInvoiceInput[];
    subtotal: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    grandTotal: number;
  } | null = null;
  if (hasItems) {
    const normalizedItems = normalizeInvoiceUpdateItems(
      raw.items,
      existing.items,
    );
    const productIds = [
      ...new Set(
        normalizedItems
          .map((it) => it.productId)
          .filter((v): v is string => v !== null),
      ),
    ];
    const found = await prisma.product.findMany({
      where: { id: { in: productIds }, businessId },
      select: {
        id: true,
        name: true,
        sku: true,
        hsnSac: true,
        unit: true,
        gstRate: true,
      },
    });
    if (productIds.length > 0 && found.length !== productIds.length) {
      throw new ResourceNotFoundError("One or more products were not found");
    }
    const productById = new Map(found.map((p) => [p.id, p]));

    // Tax settings are frozen: the stored pricing mode and the stored tax type
    // (itself derived at create time from seller state vs place of supply)
    // drive the recalculation. Product GST rates come from the master.
    const pricingMode = existing.pricingMode as PricingModeT;
    const taxType = String(existing.taxType || "intrastate") as ReturnType<
      typeof resolveTaxType
    >;

    const lines = normalizedItems.map((it) => {
      if (!it.productId) {
        return { ...it };
      }
      const prod = productById.get(it.productId);
      if (!prod) {
        throw new ResourceNotFoundError("One or more products were not found");
      }
      return {
        ...it,
        productName: prod.name,
        sku: prod.sku ?? null,
        hsnSac: prod.hsnSac ?? null,
        unit: prod.unit ?? "Pcs",
        gstRate: Number(prod.gstRate),
      };
    });

    const lineTotals = calculateInvoiceTotals(
      lines.map((it) => ({
        quantity: it.quantity,
        unitPrice: it.rate,
        gstRate: it.gstRate,
      })),
      pricingMode,
      taxType,
    );

    const createRows = lines.map((it, idx) => {
      const line = lineTotals.lines[idx];
      return {
        productId: it.productId,
        productName: it.productName || "ITEM",
        sku: it.sku,
        hsnSac: it.hsnSac,
        unit: it.unit || "Pcs",
        quantity: it.quantity,
        rate: it.rate,
        pricingMode,
        gstRate: it.gstRate,
        taxableAmount: line.taxable,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        taxAmount: line.taxAmount,
        totalAmount: line.totalAmount,
      };
    });

    itemEdit = {
      createRows,
      subtotal: round2(lineTotals.subtotal),
      taxableAmount: round2(lineTotals.subtotal),
      cgst: round2(lineTotals.cgst),
      sgst: round2(lineTotals.sgst),
      igst: round2(lineTotals.igst),
      totalTax: round2(lineTotals.totalTax),
      grandTotal: round2(lineTotals.grandTotal),
    };
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const data = {
          ...(nextNumber !== existing.invoiceNumber
            ? { invoiceNumber: nextNumber }
            : {}),
          ...(itemEdit
            ? {
                subtotal: itemEdit.subtotal,
                taxableAmount: itemEdit.taxableAmount,
                cgst: itemEdit.cgst,
                sgst: itemEdit.sgst,
                igst: itemEdit.igst,
                totalTax: itemEdit.totalTax,
                grandTotal: itemEdit.grandTotal,
                items: {
                  deleteMany: {},
                  create: itemEdit.createRows,
                },
              }
            : {}),
        };
        return tx.invoice.update({
          where: { id },
          // Strict allowlist: the update data is built ONLY from the validated
          // number and the recomputed items — never a spread of the request body.
          data,
          include: { items: true },
        });
      },
      { timeout: 30000, maxWait: 30000 },
    );
    return toInvoiceJson(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new DuplicateResourceError(
        "An invoice with this number already exists in this business",
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// PATCH .../status — the ONLY server-side lifecycle path that changes invoice
// status (F4). The browser can never write the status field directly:
//
//   Draft    -> Pending     (issue)
//   Pending  -> Paid        (record payment)
//   Pending  -> Overdue     (aging, server/compliance flow)
//   Pending  -> Cancelled   (void an unpaid issued invoice)
//   Overdue  -> Paid        (record payment)
//   Overdue  -> Pending     (reopen after missed window)
//   Overdue  -> Cancelled   (void an unpaid overdue invoice)
//   Paid     -> (terminal)  no transitions
//   Cancelled-> (terminal)  no transitions
//
// Transitions are server-authoritative: an allowed edge only ever moves the
// status FORWARD on the lifecycle and requires `invoices.edit` — the same gate
// that guards editing any invoice. Unpermitted edges are a 409 (state conflict).
// ---------------------------------------------------------------------------
// The matrix itself is imported from the shared, dependency-free module so the
// Invoice status select in the UI and this service read one definition and
// cannot drift. Its VALUES are unchanged from the previous local literal.
const INVOICE_STATUS_TRANSITIONS: Record<string, readonly string[]> =
  SHARED_INVOICE_STATUS_TRANSITIONS;

export async function transitionInvoiceStatus(
  businessIdInput: unknown,
  idInput: unknown,
  requestedStatus: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  const target = normalizeStatus(str(requestedStatus) ?? "");

  const existing = await prisma.invoice.findFirst({
    where: { id, businessId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ResourceNotFoundError("Invoice not found");

  const allowed = INVOICE_STATUS_TRANSITIONS[existing.status];
  if (!allowed.includes(target)) {
    throw new ConflictError(
      `Invoice cannot transition from ${existing.status} to ${target}`,
    );
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: target },
    include: { items: true },
  });

  return toInvoiceJson(updated);
}

// ---------------------------------------------------------------------------
// DELETE — NEVER. Invoices are accounting records and are not deletable in
// ANY status, by ANY user, through ANY API.
//
// This supersedes the earlier policy, which permitted physical removal of a
// Draft invoice. A draft is still a numbered, financial-year-scoped document
// that has already consumed an invoice number from its DocumentSequence, so
// removing it leaves a permanent gap in an auditable numbering run.
//
// The route is kept (rather than removed) for API compatibility, but it can
// only ever reach this rejection: `prisma.invoice.delete` and `deleteMany` are
// NOT called from anywhere in the application. Correcting a mistake is done by
// the status lifecycle (Draft -> Pending -> Paid / Cancelled), never by
// erasing the row.
//
// Authorization is still evaluated FIRST, so an unauthenticated caller gets
// 401 and a caller without `invoices.delete` on the business gets 403 — the
// same as before. Only an authorized caller reaches the 409.
// ---------------------------------------------------------------------------
export async function deleteInvoice(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  throw new ConflictError(
    "Invoices cannot be deleted. Correct the invoice with its status (for example, cancel it) instead.",
  );
}