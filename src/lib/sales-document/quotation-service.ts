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
import { getBusinessForMember } from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  ConflictError,
} from "@/lib/business/api-error";
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
  buildCustomerSnapshot,
  sellerStateCode,
  rejectProtectedKeys,
  QUOTATION_STATUSES,
} from "@/lib/sales-document/shared";
import type { QuotationStatusT, PricingModeT } from "@/lib/sales-document/shared";
import type { Prisma } from "@/generated/prisma/client";


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
  const ctx = await getBusinessForMember(businessId);
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

  const companySnapshot = buildCompanySnapshot(
    raw.company as Record<string, unknown> | null,
  );
  const customerSnapshot = buildCustomerSnapshot(customer);

  const created = await prisma.$transaction(
    async (tx) => {
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
  await getBusinessForMember(businessId);
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
  await getBusinessForMember(businessId);
  const quotation = await prisma.quotation.findFirst({
    where: { id, businessId },
    include: quotationInclude(),
  });
  if (!quotation) throw new ResourceNotFoundError("Quotation not found");
  return toQuotationJson(quotation);
}

// Identity/numbering and conversion-linkage fields are immutable once minted.
const QUOTATION_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "quotationNumber",
  "createdAt",
  "updatedAt",
  "prefix",
  "quotationPrefix",
  "sourceEstimateId",
  "convertedInvoiceId",
  "convertedInvoiceNumber",
  "convertedAt",
] as const;

/**
 * PATCH — operational edit of a member's quotation (whitelist-only; totals
 * recomputed server-side). Snapshots are historical: the customer snapshot is
 * refreshed only when `customerId` changes, the company snapshot only when
 * `company` is explicitly supplied. Conversion fields are engine-owned.
 */
export async function updateQuotation(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  const ctx = await getBusinessForMember(businessId);
  const business = ctx.business;

  rejectProtectedKeys(raw, QUOTATION_PROTECTED_KEYS);

  const existing = await prisma.quotation.findFirst({
    where: { id, businessId },
    include: quotationInclude(),
  });
  if (!existing) throw new ResourceNotFoundError("Quotation not found");

  const hasItems = raw.items !== undefined;
  const items = hasItems
    ? normalizeItems(raw.items, "quotation")
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

  const totals = computeDocumentTotals(
    items,
    pricingMode,
    sellerStateCode(business),
    placeOfSupplyCode,
  );

  const productIds = [
    ...new Set(items.map((it) => it.productId).filter((v): v is string => v !== null)),
  ];
  const found =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds }, businessId },
          select: { id: true, name: true, sku: true, hsnSac: true, unit: true },
        })
      : [];
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
  }
  const productById = Object.fromEntries(found.map((p) => [p.id, p]));

  const data: Prisma.QuotationUncheckedUpdateInput = {
    taxType: totals.taxType,
    placeOfSupplyCode: totals.placeOfSupplyCode || null,
    subtotal: totals.subtotal,
    taxableAmount: totals.taxableAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    totalTax: totals.totalTax,
    grandTotal: totals.grandTotal,
  };

  if (raw.status !== undefined) {
    data.status = normalizeStatus(str(raw.status) ?? "");
  }
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
    data.placeOfSupply = str(raw.placeOfSupply) ?? null;
  }
  if (raw.quotationDate !== undefined || raw.date !== undefined) {
    const s = str(raw.quotationDate ?? raw.date);
    const d = requiredIsoDate(s, "quotationDate");
    data.quotationDate = d;
  }
  if (raw.validUntil !== undefined) {
    const s = str(raw.validUntil);
    if (s) {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new ValidationError("validUntil is not a valid date");
      data.validUntil = d;
    } else {
      data.validUntil = null;
    }
  }

  // Snapshot policy (same as Invoice): party change refreshes the customer
  // snapshot; explicit `company` refreshes the seller snapshot.
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

  const rewriteItems =
    hasItems ||
    pricingMode !== existing.pricingMode ||
    placeOfSupplyCode !== String(existing.placeOfSupplyCode ?? "").trim();

  const updated = await prisma.quotation.update({
    where: { id },
    data: rewriteItems
      ? {
          ...data,
          items: {
            deleteMany: {},
            create: items.map((it, idx) => {
              const line = totals.lines[idx];
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
    include: quotationInclude(),
  });

  return toQuotationJson(updated);
}

/**
 * DELETE — physical removal allowed ONLY for Draft quotations. An issued
 * quotation (Sent/Accepted/Rejected/Expired) is protected with a 409 (the
 * caller should use Rejected/Expired instead), and a quotation that was
 * converted into an invoice is ALWAYS protected because that would corrupt the
 * conversion history.
 */
export async function deleteQuotation(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await getBusinessForMember(businessId);

  const existing = await prisma.quotation.findFirst({
    where: { id, businessId },
    select: { id: true, status: true, convertedInvoiceId: true },
  });
  if (!existing) throw new ResourceNotFoundError("Quotation not found");

  if (existing.status !== "Draft") {
    throw new ConflictError(
      "Only draft quotations can be deleted; issued quotations must be rejected or expired",
    );
  }
  if (existing.convertedInvoiceId) {
    throw new ConflictError(
      "Quotation has been converted to an invoice and cannot be deleted",
    );
  }

  await prisma.quotation.delete({ where: { id } });
  return { id };
}