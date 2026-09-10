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
  ESTIMATE_STATUSES,
} from "@/lib/sales-document/shared";
import type { EstimateStatusT, PricingModeT } from "@/lib/sales-document/shared";
import type { Prisma } from "@/generated/prisma/client";
import { assertFinancialYearActive } from "@/lib/financial-year/financial-year-service";


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
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
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
const ESTIMATE_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "estimateNumber",
  "createdAt",
  "updatedAt",
  "prefix",
  "estimatePrefix",
  "convertedQuotationId",
  "convertedQuotationNumber",
  "convertedInvoiceId",
  "convertedInvoiceNumber",
  "convertedAt",
] as const;

/**
 * PATCH — operational edit of a member's estimate (whitelist-only; totals
 * recomputed server-side). Same snapshot policy as Invoice/Quotation.
 */
export async function updateEstimate(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "edit");
  const business = ctx.business;

  rejectProtectedKeys(raw, ESTIMATE_PROTECTED_KEYS);

  const existing = await prisma.estimate.findFirst({
    where: { id, businessId },
    include: estimateInclude(),
  });
  if (!existing) throw new ResourceNotFoundError("Estimate not found");

  const hasItems = raw.items !== undefined;
  const items = hasItems
    ? normalizeItems(raw.items, "estimate")
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

  const data: Prisma.EstimateUncheckedUpdateInput = {
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
  if (raw.scope !== undefined) {
    const s = shortText(raw.scope, "scope");
    data.scope = s ?? null;
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
  if (raw.estimateDate !== undefined || raw.date !== undefined) {
    const d = requiredIsoDate(str(raw.estimateDate ?? raw.date), "estimateDate");
    data.estimateDate = d;
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

  // Snapshot policy (same as Invoice/Quotation).
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

  const updated = await prisma.estimate.update({
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
    include: estimateInclude(),
  });

  return toEstimateJson(updated);
}

/**
 * DELETE — physical removal allowed ONLY for Draft estimates. Issued estimates
 * are 409; estimates converted into a quotation or invoice are ALWAYS
 * protected (409) because deleting them would corrupt the conversion chain.
 */
export async function deleteEstimate(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  const existing = await prisma.estimate.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      status: true,
      convertedQuotationId: true,
      convertedInvoiceId: true,
    },
  });
  if (!existing) throw new ResourceNotFoundError("Estimate not found");

  if (existing.status !== "Draft") {
    throw new ConflictError(
      "Only draft estimates can be deleted; issued estimates must be rejected or expired",
    );
  }
  if (existing.convertedQuotationId || existing.convertedInvoiceId) {
    throw new ConflictError(
      "Estimate has been converted to another document and cannot be deleted",
    );
  }

  await prisma.estimate.delete({ where: { id } });
  return { id };
}