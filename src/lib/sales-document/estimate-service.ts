// Server-side Estimate service layer (multi-tenant, historical).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) before touching any data.
// The customer, financial year and every product are additionally re-verified
// as belonging to that same business.
//
// HISTORICAL CORRECTNESS: the estimate number is minted from the Phase 3B
// atomic DocumentSequence (kind "estimate", prefix EST by default) inside the
// same transaction as the insert; per-line product snapshots, the customer
// snapshot and the seller snapshot are captured at creation time.
//
// CONVERSIONS: an Estimate may be converted into a NEW quotation or a NEW
// invoice (handled by the Quotation / Invoice services). The estimate itself is
// never deleted; the converting service records convertedQuotation* /
// convertedInvoice* + status Accepted on it and this service only reads those
// fields back out for rendering.

import { prisma } from "@/lib/prisma";
import { requireBusinessPermission } from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  ConflictError,
} from "@/lib/business/api-error";
import { allocateDocumentNumber } from "@/lib/sequence/sequence-service";
import { buildDocumentNumber } from "@/lib/invoice";
import { assertCreateAllowed } from "@/lib/billing/entitlements-server";
import {
  str,
  shortText,
  validateBusinessId,
  validateId,
  requiredIsoDate,
  optionalIsoDate,
  normalizePricingMode,
  normalizeItems,
  computeDocumentTotals,
  buildCompanySnapshot,
  companyProfileRecord,
  buildCustomerSnapshot,
  sellerStateCode,
  rejectProtectedKeys,
    ESTIMATE_STATUSES,
    ESTIMATE_STATUS_TRANSITIONS,
    isLegalTransition,
  } from "@/lib/sales-document/shared";
import type { EstimateStatusT } from "@/lib/sales-document/shared";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertFinancialYearActive,
  financialYearForBusinessDate,
} from "@/lib/financial-year/financial-year-service";


function normalizeStatus(status: string): EstimateStatusT {
  if (!(ESTIMATE_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError("Invalid estimate status");
  }
  return status as EstimateStatusT;
}

function normalizeEstimatePayload(raw: Record<string, unknown>) {
  const customerId = validateId(raw.customerId, "customerId is required");
  const items = normalizeItems(raw.items, "estimate");
  return {
    customerId,
    items,
    validUntil: str(raw.validUntil),
    scope: shortText(raw.scope, "scope"),
    status: (str(raw.status) ?? "Draft") as EstimateStatusT,
    notes: shortText(raw.notes, "notes"),
    terms: shortText(raw.terms, "terms"),
    placeOfSupply: str(raw.placeOfSupply),
    placeOfSupplyCode: str(raw.placeOfSupplyCode),
    prefix: str(raw.prefix ?? raw.estimatePrefix) ?? undefined,
    company: (raw.company ?? null) as Record<string, unknown> | null,
  };
}

function toEstimateJson(e: {
  id: string;
  businessId: string;
  financialYearId: string;
  estimateNumber: string;
  estimateDate: Date;
  validUntil: Date | null;
  scope: string | null;
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
  convertedQuotationId: string | null;
  convertedQuotationNumber: string | null;
  convertedInvoiceId: string | null;
  convertedInvoiceNumber: string | null;
  convertedAt: Date | null;
  customerSnapshot: unknown;
  companySnapshot: unknown;
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
    id: e.id,
    businessId: e.businessId,
    financialYearId: e.financialYearId,
    estimateNumber: e.estimateNumber,
    date: e.estimateDate.toISOString(),
    estimateDate: e.estimateDate.toISOString(),
    validUntil: e.validUntil ? e.validUntil.toISOString() : null,
    scope: e.scope,
    customerId: e.customerId,
    placeOfSupply: e.placeOfSupply,
    placeOfSupplyCode: e.placeOfSupplyCode,
    taxType: e.taxType,
    status: e.status,
    pricingMode: e.pricingMode,
    subtotal: Number(e.subtotal),
    totalDiscount: Number(e.totalDiscount),
    taxableAmount: Number(e.taxableAmount),
    cgst: Number(e.cgst),
    sgst: Number(e.sgst),
    igst: Number(e.igst),
    totalTax: Number(e.totalTax),
    grandTotal: Number(e.grandTotal),
    notes: e.notes,
    terms: e.terms,
    convertedQuotationId: e.convertedQuotationId,
    convertedQuotationNumber: e.convertedQuotationNumber,
    convertedInvoiceId: e.convertedInvoiceId,
    convertedInvoiceNumber: e.convertedInvoiceNumber,
    convertedAt: e.convertedAt ? e.convertedAt.toISOString() : null,
    customer: e.customerSnapshot,
    company: e.companySnapshot,
    items: (e.items ?? []).map((it) => ({
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
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export type EstimateJson = ReturnType<typeof toEstimateJson>;

function estimateInclude() {
  return {
    items: {
      select: {
        id: true,
        productId: true,
        productName: true,
        sku: true,
        hsnSac: true,
        unit: true,
        quantity: true,
        rate: true,
        gstRate: true,
        taxableAmount: true,
        cgst: true,
        sgst: true,
        igst: true,
        taxAmount: true,
        totalAmount: true,
        pricingMode: true,
      },
    },
  } as const;
}

/**
 * Create an estimate in the member's verified business.
 */
export async function createEstimate(
  businessIdInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "create");
  const business = ctx.business;

  const pricingMode = normalizePricingMode(
    str(raw.pricingMode) ?? "inclusive",
  );
  const payload = normalizeEstimatePayload(raw);
  const status = normalizeStatus(payload.status);
  const fyId = validateId(raw.financialYearId, "financialYearId is required");
  const estimateDate = requiredIsoDate(
    raw.estimateDate ?? raw.date,
    "estimateDate",
  );
  const validUntil = optionalIsoDate(payload.validUntil, "validUntil");

  const businessStateCode = sellerStateCode(business);
  const totals = computeDocumentTotals(
    payload.items,
    pricingMode,
    businessStateCode,
    payload.placeOfSupplyCode,
  );

  const productIds = [
    ...new Set(payload.items.map((it) => it.productId).filter((v): v is string => v !== null)),
  ];

  const [customer, fy, found] = await Promise.all([
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
  ]);
  if (!customer) throw new ResourceNotFoundError("Customer not found");
  if (!fy) throw new ResourceNotFoundError("Financial year not found");
  assertFinancialYearActive(fy);
  // F11 — date-owned FY authority (same rule as invoices).
  {
    const derived = await financialYearForBusinessDate(businessId, estimateDate);
    if (!derived) {
      throw new ValidationError(
        `Estimate date ${new Date(estimateDate).toISOString().slice(0, 10)} does not fall within any configured financial year; correct the date or create the financial year first`,
      );
    }
    if (derived.id !== fy.id) {
      throw new ValidationError(
        `The financial year is derived from the estimate date: it belongs to ${derived.name}, not the requested ${fy.name}`,
      );
    }
  }
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
  }
  const productById = Object.fromEntries(found.map((p) => [p.id, p]));

  const companySnapshot = buildCompanySnapshot(companyProfileRecord(business));
  const customerSnapshot = buildCustomerSnapshot(customer);

  const created = await prisma.$transaction(
    async (tx) => {
      // The plan's estimate monthly quota is enforced server-side inside this
      // transaction (business-row lock → calendar-month count → check) BEFORE
      // the number is allocated and the record inserted.
      await assertCreateAllowed(tx, businessId, "estimates");
      const allocated = await allocateDocumentNumber(
        businessId,
        fyId,
        "estimate",
        payload.prefix,
        { db: tx },
      );
      const estimateNumber = buildDocumentNumber(
        "estimate",
        fy.name,
        allocated.allocated,
      );

      const estimate = await tx.estimate.create({
        data: {
          businessId,
          financialYearId: fyId,
          estimateNumber,
          estimateDate,
          validUntil,
          scope: payload.scope,
          customerId: customer.id,
          placeOfSupply: payload.placeOfSupply,
          placeOfSupplyCode: totals.placeOfSupplyCode || null,
          taxType: totals.taxType,
          status,
          pricingMode,
          subtotal: totals.subtotal,
          totalDiscount: 0,
          taxableAmount: totals.taxableAmount,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          totalTax: totals.totalTax,
          grandTotal: totals.grandTotal,
          notes: payload.notes,
          terms: payload.terms,
          customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
          companySnapshot: companySnapshot as Prisma.InputJsonValue,
          items: {
            create: payload.items.map((it, idx) => {
              const line = totals.lines[idx];
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
        include: estimateInclude(),
      });

      return estimate;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  return toEstimateJson(created);
}

export async function listEstimates(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");
  const rows = await prisma.estimate.findMany({
    where: { businessId },
    orderBy: { estimateDate: "desc" },
    include: estimateInclude(),
  });
  return rows.map(toEstimateJson);
}

export async function getEstimate(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "view");
  const estimate = await prisma.estimate.findFirst({
    where: { id, businessId },
    include: estimateInclude(),
  });
  if (!estimate) throw new ResourceNotFoundError("Estimate not found");
  return toEstimateJson(estimate);
}

// Identity/numbering and conversion-linkage fields are immutable once minted.
//
// `status` is deliberately NOT PATCH-settable, matching the Invoice rule
// (INVOICE_PROTECTED_KEYS + the explicit status rejection in updateInvoice):
// status is a lifecycle fact, not a form field. Accepting an arbitrary
// client-chosen status on PATCH would let a caller assert "Accepted" or
// "Rejected" with no corresponding event having occurred, and — because the
// status also decided whether the old DELETE policy would allow removal —
// would couple a forged status to record destruction.
const ESTIMATE_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "estimateNumber",
  "createdAt",
  "updatedAt",
  "prefix",
  "estimatePrefix",
  "status",
  "convertedQuotationId",
  "convertedQuotationNumber",
  "convertedInvoiceId",
  "convertedInvoiceNumber",
  "convertedAt",
] as const;

/**
 * PATCH — immutable after creation. An estimate is created-and-frozen: none of
 * its content fields may be edited through the ordinary PATCH. The ONLY
 * post-creation change is the status lifecycle (transitionEstimateStatus). Any
 * payload field supplied here is rejected (400) rather than silently ignored,
 * so a stale edit form surfaces its failure instead of pretending success.
 * An empty PATCH is a harmless no-op returning the current document.
 */
export async function updateEstimate(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  // Identity/conversion/status guard: `status` is a lifecycle fact owned by the
  // status endpoint, never a PATCH-settable field. `estimateNumber` and the
  // conversion markers are engine-owned and immutable.
  rejectProtectedKeys(raw, ESTIMATE_PROTECTED_KEYS);

  // Mass-assignment guard: NOTHING is editable on PATCH. Any residual key (i.e.
  // any content field a client tried to change) aborts the request.
  const contentKeys = Object.keys(raw);
  if (contentKeys.length > 0) {
    throw new ValidationError(
      `Estimates are immutable after creation; ${contentKeys.join(", ")} cannot be changed. Only the status can be updated, through the estimate status endpoint.`,
    );
  }

  const existing = await prisma.estimate.findFirst({
    where: { id, businessId },
    include: estimateInclude(),
  });
  if (!existing) throw new ResourceNotFoundError("Estimate not found");

  return toEstimateJson(existing);
}

/**
 * STATUS LIFECYCLE — the only path that changes an estimate's status.
 *
 * Mirrors transitionInvoiceStatus in the Invoice service, which is the
 * repository's existing reference implementation:
 *   1. authorize the caller against `businessId` BEFORE reading any document,
 *      so a foreign tenant cannot probe for existence;
 *   2. load the document scoped to that business — the CURRENT status comes
 *      from the database row, never from the request body;
 *   3. validate the requested edge against ESTIMATE_STATUS_TRANSITIONS;
 *   4. apply the single status write and return the authoritative document.
 *
 * `requestedStatus` means "please move to this status", NOT "set the column to
 * this value": an illegal edge (including any jump out of a terminal status)
 * is rejected with 409 and the row is left untouched.
 *
 * No edit-lock semantics are added here. The repository defines no per-status
 * field lockdown for estimates, so updateEstimate's behaviour is unchanged.
 */
export async function transitionEstimateStatus(
  businessIdInput: unknown,
  idInput: unknown,
  requestedStatus: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  const target = normalizeStatus(str(requestedStatus) ?? "");

  // Authoritative current status, scoped to the authorized business.
  const existing = await prisma.estimate.findFirst({
    where: { id, businessId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ResourceNotFoundError("Estimate not found");

  if (!isLegalTransition(ESTIMATE_STATUS_TRANSITIONS, existing.status, target)) {
    throw new ConflictError(
      `Estimate cannot transition from ${existing.status} to ${target}`,
    );
  }

  const updated = await prisma.estimate.update({
    where: { id },
    data: { status: target },
    include: estimateInclude(),
  });

  return toEstimateJson(updated);
}

/**
 * DELETE — NEVER. Estimates are not deletable in ANY status, by ANY user,
 * through ANY API.
 *
 * This supersedes the earlier policy, which permitted physical removal of a
 * Draft estimate. A draft has already consumed an EST- number from its
 * DocumentSequence for the pinned financial year, so removing it leaves a
 * permanent gap in an auditable numbering run — and, when the estimate is the
 * source of a conversion, it would also orphan the destination document's
 * provenance.
 *
 * The route is kept (rather than removed) for API compatibility, but it can
 * only ever reach this rejection: `prisma.estimate.delete` and `deleteMany` are
 * NOT called from anywhere in the application. An estimate that was sent and is
 * no longer wanted is closed with Rejected or Expired, never erased.
 *
 * Authorization is still evaluated FIRST, so an unauthenticated caller gets 401
 * and a caller without `invoices.delete` on the business gets 403. Only an
 * authorized caller reaches the 409.
 */
export async function deleteEstimate(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  throw new ConflictError(
    "Estimates cannot be deleted. Reject or expire the estimate instead.",
  );
}