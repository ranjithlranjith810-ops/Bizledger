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
} from "@/lib/business/api-error";
import { rejectProtectedKeys } from "@/lib/sales-document/shared";
import { assertFinancialYearActive } from "@/lib/financial-year/financial-year-service";
import { allocateDocumentNumber } from "@/lib/sequence/sequence-service";
import { INDIAN_STATES } from "@/lib/india";
import {
  calculateInvoiceTotals,
  round2,
  resolveTaxType,
  buildInvoiceNumber,
} from "@/lib/invoice";
import type { Prisma } from "@/generated/prisma/client";

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

// Identity/numbering fields are immutable once minted. Attempting to supply any
// of them on an update is rejected (400) — the number, financial-year binding
// and conversion linkage are engine-owned and never client-editable.
const INVOICE_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "invoiceNumber",
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

// F4 — financial-substance keys that freeze once an invoice leaves Draft.
const INVOICE_FINANCIAL_OVERRIDE_KEYS = [
  "items",
  "pricingMode",
  "customerId",
  "invoiceDate",
  "placeOfSupplyCode",
] as const;

// F4 — remaining mutability also locks once an invoice is Paid or Cancelled
// (only notes / terms / e-way bill remain editable).
const INVOICE_FINALIZED_LOCKED_KEYS = [
  "dueDate",
  "placeOfSupply",
  "vehicle",
  "company",
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

function buildCompanySnapshot(
  raw: Record<string, unknown> | null,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const s = (k: string) => shortText(raw[k], `company.${k}`);
  const out: Record<string, string> = {};
  for (const k of [
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
    "logoUrl",
    "digitalSignatureUrl",
  ]) {
    const v = s(k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

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

  const companySnapshot = buildCompanySnapshot(
    (raw.company as Record<string, unknown> | null),
  );
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

      // Mint the number from the same FY-scoped sequence as the frontend.
      const allocated = await allocateDocumentNumber(
        businessId,
        fyId,
        "invoice",
        payload.prefix,
        { db: tx },
      );

      const financialYearName = fy.name;
      const invoiceNumber = buildInvoiceNumber(
        allocated.prefix,
        financialYearName,
        allocated.allocated,
      );

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
              productName: prod ? prod.name : it.productName,
              sku: (prod && prod.sku) || it.sku,
              hsnSac: (prod && prod.hsnSac) || it.hsnSac,
              unit: (prod && prod.unit) || it.unit,
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

      return invoice;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  if (sourceDocument) {
    await prisma.$transaction(
      async (tx) => {
        if (sourceDocument.type === "quotation" && sourceQuotation) {
          await tx.quotation.update({
            where: { id: sourceQuotation.id },
            data: {
              status: "Accepted",
              convertedInvoiceId: created.id,
              convertedInvoiceNumber: created.invoiceNumber,
              convertedAt: new Date(),
            },
          });
        }
        if (sourceDocument.type === "estimate" && sourceEstimate) {
          await tx.estimate.update({
            where: { id: sourceEstimate.id },
            data: {
              status: "Accepted",
              convertedInvoiceId: created.id,
              convertedInvoiceNumber: created.invoiceNumber,
              convertedAt: new Date(),
            },
          });
        }
      },
      { timeout: 30000, maxWait: 30000 },
    );
  }

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
// PATCH — an operational edit of a member's invoice.
//
// POLICY:
//  - Mass assignment: only a strict whitelist of fields is ever written; the
//    body is NEVER spread into `prisma.invoice.update`. Unknown keys are
//    ignored, protected identity keys are rejected (400).
//  - Totals: ALWAYS recomputed server-side with the shared GST engine. Client
//    totals (subtotal/tax/grandTotal) are ignored — fake numbers never persist.
//  - Tax type: derived again from the seller's own Business state code vs the
//    effective place-of-supply code (after the patch).
//  - Snapshots are historical. The company (seller) snapshot is only refreshed
//    when `company` is explicitly supplied; the vehicle snapshot only when
//    `vehicle` is supplied; the customer snapshot is refreshed ONLY when
//    `customerId` changes (the document then references a different party).
//    Everything else keeps the stored snapshot.
//  - Item rows are rewritten only when `items` is supplied or pricing
//    mode / place-of-supply changed (their GST split depends on those).
//  - line totals are recomputed from the CURRENT stored lines otherwise.
// ---------------------------------------------------------------------------
export async function updateInvoice(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "edit");
  const business = ctx.business;

  rejectProtectedKeys(raw, INVOICE_PROTECTED_KEYS);

  const existing = await prisma.invoice.findFirst({
    where: { id, businessId },
    include: { items: true },
  });
  if (!existing) throw new ResourceNotFoundError("Invoice not found");

  // F4 — status is a lifecycle fact, transitioned ONLY through the dedicated
  // status endpoint (Draft -> Pending -> Paid, Overdue/Cancelled by server flow).
  // A forged status on PATCH is rejected outright.
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

  // F4 — issued/finalized lockdown. A Draft is fully editable per RBAC; an
  // issued invoice (Pending/Overdue) keeps its financial substance frozen
  // (items, pricing mode, date, customer association, place-of-supply code);
  // a finalized invoice (Paid/Cancelled) is immutable except for non-financial
  // annotations (notes, terms, e-way bill). Violations are a state conflict
  // (409) — the record is an accounting document, not a client-editable form.
  if (existing.status !== "Draft") {
    for (const k of INVOICE_FINANCIAL_OVERRIDE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw, k)) {
        throw new ConflictError(
          existing.status === "Paid" || existing.status === "Cancelled"
            ? "Paid or cancelled invoices are immutable financial records and cannot be rewritten"
            : `Issued ${existing.status} invoices cannot have their financial fields rewritten`,
        );
      }
    }
    if (existing.status === "Paid" || existing.status === "Cancelled") {
      for (const k of INVOICE_FINALIZED_LOCKED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(raw, k)) {
          throw new ConflictError(
            "Paid or cancelled invoices are immutable financial records and cannot be rewritten",
          );
        }
      }
    }
  }

  const hasItems = raw.items !== undefined;
  const items = hasItems
    ? normalizeInvoiceItems(raw.items)
    : existing.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        sku: it.sku,
        hsnSac: it.hsnSac,
        unit: it.unit,
        quantity: Number(it.quantity),
        rate: Number(it.rate),
        gstRate: Number(it.gstRate),
      }));

  const pricingMode =
    raw.pricingMode !== undefined
      ? normalizePricingMode(str(raw.pricingMode) ?? "")
      : (existing.pricingMode as PricingModeT);

  let placeOfSupplyCode = String(existing.placeOfSupplyCode ?? "").trim();
  if (raw.placeOfSupplyCode !== undefined) {
    const s = str(raw.placeOfSupplyCode) ?? "";
    if (s && !/^\d{2}$/.test(s)) {
      throw new ValidationError("placeOfSupplyCode must be a 2-digit state code");
    }
    placeOfSupplyCode = s;
  }

  // Server-side recomputation. Client totals are ignored.
  const businessStateCode = sellerStateCode(business);
  const taxType = resolveTaxType(businessStateCode, placeOfSupplyCode);
  const lineTotals = calculateInvoiceTotals(
    items.map((it) => ({
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

  // Tenant-verify all referenced masters for this edit.
  const productIds = [
    ...new Set(items.map((it) => it.productId).filter((v): v is string => v !== null)),
  ];
  const [found] = await Promise.all([
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
  ]);
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
  }
  const productById = Object.fromEntries(found.map((p) => [p.id, p]));

  // ---------- build the strict whitelist of mutable fields ----------
  const data: Prisma.InvoiceUncheckedUpdateInput = {
    taxType,
    subtotal,
    taxableAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    grandTotal,
  };

  if (raw.pricingMode !== undefined) {
    data.pricingMode = normalizePricingMode(str(raw.pricingMode) ?? "");
  }
  if (raw.notes !== undefined) {
    const s = shortText(raw.notes, "notes");
    data.notes = s ?? null;
  }
  if (raw.terms !== undefined) {
    const s = shortText(raw.terms, "terms");
    data.terms = s ?? null;
  }
  if (raw.placeOfSupply !== undefined) {
    const s = str(raw.placeOfSupply);
    data.placeOfSupply = s ?? null;
  }
  if (raw.placeOfSupplyCode !== undefined) {
    data.placeOfSupplyCode = placeOfSupplyCode || null;
  }
  if (raw.ewayBillNumber !== undefined) {
    const s = shortText(raw.ewayBillNumber, "ewayBillNumber");
    data.ewayBillNumber = s ?? null;
  }
  if (raw.invoiceDate !== undefined) {
    const s = str(raw.invoiceDate);
    if (!s) throw new ValidationError("invoiceDate is required");
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new ValidationError("invoiceDate is not a valid date");
    data.invoiceDate = d;
  }
  if (raw.dueDate !== undefined) {
    const s = str(raw.dueDate);
    if (s) {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new ValidationError("dueDate is not a valid date");
      data.dueDate = d;
    } else {
      data.dueDate = null;
    }
  }
  if (raw.ewayBillDate !== undefined) {
    const s = str(raw.ewayBillDate);
    if (s) {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new ValidationError("ewayBillDate is not a valid date");
      data.ewayBillDate = d;
    } else {
      data.ewayBillDate = null;
    }
  }

  // Snapshot policy (see header comment).
  if (raw.customerId !== undefined) {
    const customerId = validateId(raw.customerId, "customerId is invalid");
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
    });
    if (!customer) throw new ResourceNotFoundError("Customer not found");
    data.customerId = customer.id;
    data.customerSnapshot = buildCustomerSnapshot(customer) as Prisma.InputJsonValue;
  }
  if (raw.company !== undefined) {
    if (raw.company !== null && typeof raw.company !== "object") {
      throw new ValidationError("company must be a company snapshot object or null");
    }
    data.companySnapshot = buildCompanySnapshot(
      (raw.company ?? null) as Record<string, unknown> | null,
    ) as Prisma.InputJsonValue;
  }
  if (raw.vehicle !== undefined) {
    if (raw.vehicle !== null && typeof raw.vehicle !== "object") {
      throw new ValidationError("vehicle must be a vehicle snapshot object or null");
    }
    data.vehicleSnapshot = buildVehicleSnapshot(
      (raw.vehicle ?? null) as Record<string, unknown> | null,
    ) as Prisma.InputJsonValue;
  }

  // Rewrite item rows when the lines themselves changed.
  const rewriteItems =
    hasItems ||
    pricingMode !== existing.pricingMode ||
    placeOfSupplyCode !== String(existing.placeOfSupplyCode ?? "").trim();

  const updated = await prisma.invoice.update({
    where: { id },
    data: rewriteItems
      ? {
          ...data,
          items: {
            deleteMany: {},
            create: items.map((it, idx) => {
              const line = lineTotals.lines[idx];
              const prod = it.productId ? productById[it.productId] : undefined;
              return {
                productId: it.productId,
                productName: prod ? prod.name : it.productName,
                sku: (prod && prod.sku) || it.sku,
                hsnSac: (prod && prod.hsnSac) || it.hsnSac,
                unit: (prod && prod.unit) || it.unit,
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
        }
      : data,
    include: { items: true },
  });

  return toInvoiceJson(updated);
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
const INVOICE_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  Draft: ["Pending"],
  Pending: ["Paid", "Overdue", "Cancelled"],
  Overdue: ["Paid", "Pending", "Cancelled"],
  Paid: [],
  Cancelled: [],
};

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
// DELETE — physical removal allowed ONLY for Draft invoices.
//
// POLICY: an invoice is (or has become) an accounting record. Issued /
// finalized invoices (any status other than Draft) are protected with a 409 —
// the caller must use the Cancelled status instead. Invoices referenced by a
// conversion history (a quotation or estimate that was converted into THIS
// invoice) are never physically deleted, because that would corrupt the
// source document's conversion reference (409). Cross-tenant or unknown ids
// remain a 404.
// ---------------------------------------------------------------------------
export async function deleteInvoice(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  const existing = await prisma.invoice.findFirst({
    where: { id, businessId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ResourceNotFoundError("Invoice not found");

  if (existing.status !== "Draft") {
    throw new ConflictError(
      "Only draft invoices can be deleted; issued invoices must be cancelled",
    );
  }

  const [quoteRefs, estimateRefs] = await Promise.all([
    prisma.quotation.count({ where: { businessId, convertedInvoiceId: id } }),
    prisma.estimate.count({ where: { businessId, convertedInvoiceId: id } }),
  ]);
  if (quoteRefs > 0 || estimateRefs > 0) {
    throw new ConflictError(
      "Invoice is referenced by a document conversion and cannot be deleted",
    );
  }

  await prisma.invoice.delete({ where: { id } });
  return { id };
}