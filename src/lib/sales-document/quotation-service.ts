// Server-side Quotation service layer (multi-tenant, historical).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) before touching any data.
// The customer, financial year, every product, and any source Estimate are
// additionally re-verified as belonging to that same business.
//
// HISTORICAL CORRECTNESS: the quotation number is minted from the Phase 3B
// atomic DocumentSequence (kind "quotation", prefix QT by default) inside the
// same transaction as the insert; per-line product snapshots, the customer
// snapshot and the seller snapshot are captured at creation time.
//
// CONVERSIONS: an Estimate may be converted into a NEW quotation
// (`sourceEstimateId`); the estimate is never deleted and only records the
// back-reference (convertedQuotation* / status Accepted). A quotation may be
// converted into a NEW invoice, recorded via convertedInvoice* — one-time only.

import { prisma } from "@/lib/prisma";
import { requireBusinessPermission } from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  ConflictError,
} from "@/lib/business/api-error";
import { assertFeature, assertCreateAllowed } from "@/lib/billing/entitlements-server";
import { allocateDocumentNumber } from "@/lib/sequence/sequence-service";
import { buildDocumentNumber } from "@/lib/invoice";
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
  QUOTATION_STATUSES,
  QUOTATION_STATUS_TRANSITIONS,
  isLegalTransition,
} from "@/lib/sales-document/shared";
import type { QuotationStatusT } from "@/lib/sales-document/shared";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertFinancialYearActive,
  financialYearForBusinessDate,
} from "@/lib/financial-year/financial-year-service";


function normalizeStatus(status: string): QuotationStatusT {
  if (!(QUOTATION_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError("Invalid quotation status");
  }
  return status as QuotationStatusT;
}

function normalizeQuotationPayload(raw: Record<string, unknown>) {
  const customerId = validateId(raw.customerId, "customerId is required");
  const items = normalizeItems(raw.items, "quotation");
  const sourceEstimateIdRaw = str(raw.sourceEstimateId);
  const sourceEstimateId = sourceEstimateIdRaw
    ? validateId(sourceEstimateIdRaw, "Invalid sourceEstimateId")
    : undefined;
  return {
    customerId,
    items,
    sourceEstimateId,
    validUntil: str(raw.validUntil),
    status: (str(raw.status) ?? "Draft") as QuotationStatusT,
    notes: shortText(raw.notes, "notes"),
    terms: shortText(raw.terms, "terms"),
    placeOfSupply: str(raw.placeOfSupply),
    placeOfSupplyCode: str(raw.placeOfSupplyCode),
    prefix: str(raw.prefix ?? raw.quotationPrefix) ?? undefined,
    company: (raw.company ?? null) as Record<string, unknown> | null,
  };
}

function toQuotationJson(q: {
  id: string;
  businessId: string;
  financialYearId: string;
  quotationNumber: string;
  quotationDate: Date;
  validUntil: Date | null;
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
  sourceEstimateId: string | null;
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
    id: q.id,
    businessId: q.businessId,
    financialYearId: q.financialYearId,
    quotationNumber: q.quotationNumber,
    date: q.quotationDate.toISOString(),
    quotationDate: q.quotationDate.toISOString(),
    validUntil: q.validUntil ? q.validUntil.toISOString() : null,
    customerId: q.customerId,
    placeOfSupply: q.placeOfSupply,
    placeOfSupplyCode: q.placeOfSupplyCode,
    taxType: q.taxType,
    status: q.status,
    pricingMode: q.pricingMode,
    subtotal: Number(q.subtotal),
    totalDiscount: Number(q.totalDiscount),
    taxableAmount: Number(q.taxableAmount),
    cgst: Number(q.cgst),
    sgst: Number(q.sgst),
    igst: Number(q.igst),
    totalTax: Number(q.totalTax),
    grandTotal: Number(q.grandTotal),
    notes: q.notes,
    terms: q.terms,
    sourceEstimateId: q.sourceEstimateId,
    convertedInvoiceId: q.convertedInvoiceId,
    convertedInvoiceNumber: q.convertedInvoiceNumber,
    convertedAt: q.convertedAt ? q.convertedAt.toISOString() : null,
    customer: q.customerSnapshot,
    company: q.companySnapshot,
    items: (q.items ?? []).map((it) => ({
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
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

export type QuotationJson = ReturnType<typeof toQuotationJson>;

const QUOTATION_ITEM_SELECT = {
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
} as const;

function quotationInclude() {
  return { items: { select: QUOTATION_ITEM_SELECT } } as const;
}

/**
 * Create a quotation in the member's verified business. Optionally converting a
 * source Estimate (Estimate -> Quotation); the estimate is preserved and only
 * records the conversion reference.
 */
export async function createQuotation(
  businessIdInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "create");
  const business = ctx.business;

  const pricingMode = normalizePricingMode(
    str(raw.pricingMode) ?? "inclusive",
  );
  const payload = normalizeQuotationPayload(raw);
  const status = normalizeStatus(payload.status);
  const fyId = validateId(raw.financialYearId, "financialYearId is required");
  const quotationDate = requiredIsoDate(
    raw.quotationDate ?? raw.date,
    "quotationDate",
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

  const [customer, fy, found, sourceEstimate] = await Promise.all([
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
    payload.sourceEstimateId
      ? prisma.estimate.findFirst({
          where: { id: payload.sourceEstimateId, businessId },
          select: { id: true, status: true, convertedQuotationId: true },
        })
      : Promise.resolve(null),
  ]);
  if (!customer) throw new ResourceNotFoundError("Customer not found");
  if (!fy) throw new ResourceNotFoundError("Financial year not found");
  assertFinancialYearActive(fy);
  // F11 — date-owned FY authority (same rule as invoices).
  {
    const derived = await financialYearForBusinessDate(businessId, quotationDate);
    if (!derived) {
      throw new ValidationError(
        `Quotation date ${new Date(quotationDate).toISOString().slice(0, 10)} does not fall within any configured financial year; correct the date or create the financial year first`,
      );
    }
    if (derived.id !== fy.id) {
      throw new ValidationError(
        `The financial year is derived from the quotation date: it belongs to ${derived.name}, not the requested ${fy.name}`,
      );
    }
  }
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
  }
  if (payload.sourceEstimateId && !sourceEstimate) {
    throw new ResourceNotFoundError("Estimate not found");
  }
  if (sourceEstimate && sourceEstimate.convertedQuotationId) {
    throw new ValidationError(
      "Estimate has already been converted to a quotation",
    );
  }
  const productById = Object.fromEntries(found.map((p) => [p.id, p]));

  const companySnapshot = buildCompanySnapshot(companyProfileRecord(business));
  const customerSnapshot = buildCustomerSnapshot(customer);

  const created = await prisma.$transaction(
    async (tx) => {
      // Phase 9C-4: the registered `quotations` feature gate is enforced
      // server-side inside this transaction (business-row lock → resolve
      // effective plan → deny only when the plan EXPLICITLY sets it false/0).
      await assertFeature(tx, businessId, "quotations");

      // The plan's quotation monthly quota is then enforced numerically in the
      // same transaction (separate usage counter from invoices/estimates/POs),
      // so a plan that enables the quotation feature is still capped at its
      // `quotationsPerMonth` ceiling. Both checks take the Business-row lock.
      await assertCreateAllowed(tx, businessId, "quotations");

      // Conversion guard, AUTHORITATIVE and in-transaction.
      //
      // `assertFeature` above takes the same exclusive Business-row lock as the
      // numeric gate, so competing conversions of one source serialize behind
      // this transaction. The pre-transaction read of the estimate is only a
      // fast path: two concurrent conversions both see
      // `convertedQuotationId = null` there and would both insert a quotation
      // (two documents from one estimate). Re-reading after the lock, in the
      // same transaction that creates the quotation, lets exactly one win —
      // and because the marker is already written in this transaction, the
      // loser is guaranteed to observe it.
      if (sourceEstimate && payload.sourceEstimateId) {
        const lockedEstimate = await tx.estimate.findFirst({
          where: { id: payload.sourceEstimateId, businessId },
          select: { convertedQuotationId: true },
        });
        if (lockedEstimate?.convertedQuotationId) {
          throw new ValidationError(
            "Estimate has already been converted to a quotation",
          );
        }
      }

      const allocated = await allocateDocumentNumber(
        businessId,
        fyId,
        "quotation",
        payload.prefix,
        { db: tx },
      );
      const quotationNumber = buildDocumentNumber(
        "quotation",
        fy.name,
        allocated.allocated,
      );

      const quotation = await tx.quotation.create({
        data: {
          businessId,
          financialYearId: fyId,
          quotationNumber,
          quotationDate,
          validUntil,
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
          sourceEstimateId: payload.sourceEstimateId ?? null,
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
        include: quotationInclude(),
      });

      if (sourceEstimate && payload.sourceEstimateId) {
        await tx.estimate.update({
          where: { id: payload.sourceEstimateId },
          data: {
            status: "Accepted",
            convertedQuotationId: quotation.id,
            convertedQuotationNumber: quotationNumber,
            convertedAt: new Date(),
          },
        });
      }

      return quotation;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  return toQuotationJson(created);
}

export async function listQuotations(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");
  const rows = await prisma.quotation.findMany({
    where: { businessId },
    orderBy: { quotationDate: "desc" },
    include: quotationInclude(),
  });
  return rows.map(toQuotationJson);
}

export async function getQuotation(
  businessIdInput: unknown,
  idInput: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "view");
  const quotation = await prisma.quotation.findFirst({
    where: { id, businessId },
    include: quotationInclude(),
  });
  if (!quotation) throw new ResourceNotFoundError("Quotation not found");
  return toQuotationJson(quotation);
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
const QUOTATION_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "quotationNumber",
  "createdAt",
  "updatedAt",
  "prefix",
  "quotationPrefix",
  "status",
  "sourceEstimateId",
  "convertedInvoiceId",
  "convertedInvoiceNumber",
  "convertedAt",
] as const;

/**
 * PATCH — immutable after creation. A quotation is created-and-frozen: none of
 * its content fields may be edited through the ordinary PATCH. The ONLY
 * post-creation change is the status lifecycle (transitionQuotationStatus). Any
 * payload field supplied here is rejected (400) rather than silently ignored,
 * so a stale edit form surfaces its failure instead of pretending success.
 * An empty PATCH is a harmless no-op returning the current document.
 */
export async function updateQuotation(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  // Identity/conversion/status guard: `status` is a lifecycle fact owned by the
  // status endpoint, never a PATCH-settable field. `quotationNumber` and the
  // conversion markers are engine-owned and immutable.
  rejectProtectedKeys(raw, QUOTATION_PROTECTED_KEYS);

  // Mass-assignment guard: NOTHING is editable on PATCH. Any residual key (i.e.
  // any content field a client tried to change) aborts the request.
  const contentKeys = Object.keys(raw);
  if (contentKeys.length > 0) {
    throw new ValidationError(
      `Quotations are immutable after creation; ${contentKeys.join(", ")} cannot be changed. Only the status can be updated, through the quotation status endpoint.`,
    );
  }

  const existing = await prisma.quotation.findFirst({
    where: { id, businessId },
    include: quotationInclude(),
  });
  if (!existing) throw new ResourceNotFoundError("Quotation not found");

  return toQuotationJson(existing);
}

/**
 * STATUS LIFECYCLE — the only path that changes a quotation's status.
 *
 * Mirrors transitionInvoiceStatus in the Invoice service (the repository's
 * reference implementation): authorize first, then load the document scoped to
 * the authorized business so the CURRENT status is read from the database and
 * never from the request body, validate the requested edge against
 * QUOTATION_STATUS_TRANSITIONS, and only then write. An illegal edge — including
 * any jump out of a terminal status — is rejected with 409 and the row is left
 * exactly as it was.
 *
 * `requestedStatus` is a request to move, not an assignment. `status` remains
 * rejected on the ordinary updateQuotation PATCH body.
 *
 * No edit-lock semantics are introduced; the repository defines none for
 * quotations, so updateQuotation's behaviour is unchanged.
 */
export async function transitionQuotationStatus(
  businessIdInput: unknown,
  idInput: unknown,
  requestedStatus: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  const target = normalizeStatus(str(requestedStatus) ?? "");

  const existing = await prisma.quotation.findFirst({
    where: { id, businessId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ResourceNotFoundError("Quotation not found");

  if (
    !isLegalTransition(QUOTATION_STATUS_TRANSITIONS, existing.status, target)
  ) {
    throw new ConflictError(
      `Quotation cannot transition from ${existing.status} to ${target}`,
    );
  }

  const updated = await prisma.quotation.update({
    where: { id },
    data: { status: target },
    include: quotationInclude(),
  });

  return toQuotationJson(updated);
}

/**
 * DELETE — NEVER. Quotations are not deletable in ANY status, by ANY user,
 * through ANY API.
 *
 * This supersedes the earlier policy, which permitted physical removal of a
 * Draft quotation. A draft has already consumed a QT- number from its
 * DocumentSequence for the pinned financial year, so removing it leaves a
 * permanent gap in an auditable numbering run — and, when the quotation is the
 * source of a conversion, it would also orphan the destination invoice's
 * provenance (`convertedInvoiceId` is SetNull on delete, leaving a dangling
 * `convertedInvoiceNumber`).
 *
 * The route is kept (rather than removed) for API compatibility, but it can
 * only ever reach this rejection: `prisma.quotation.delete` and `deleteMany`
 * are NOT called from anywhere in the application. A quotation that was sent
 * and is no longer wanted is closed with Rejected or Expired, never erased.
 *
 * Authorization is still evaluated FIRST, so an unauthenticated caller gets 401
 * and a caller without `invoices.delete` on the business gets 403. Only an
 * authorized caller reaches the 409.
 */
export async function deleteQuotation(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  throw new ConflictError(
    "Quotations cannot be deleted. Reject or expire the quotation instead.",
  );
}