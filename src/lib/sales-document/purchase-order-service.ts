// Server-side PurchaseOrder service layer (multi-tenant, historical).
//
// Direction is buyer -> supplier, so instead of a Customer there is a vendor
// SNAPSHOT (the app has no vendor master yet). Items still reference the
// buyer's own Product master (productId is optional + snapshot-backed).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` via getBusinessForMember. The financial year and every
// product are additionally re-verified as belonging to that same business.
//
// HISTORICAL CORRECTNESS: the PO number is minted from the Phase 3B atomic
// DocumentSequence (kind "purchaseOrder", prefix PO by default) inside the same
// transaction as the insert; per-line product snapshots + vendor snapshot are
// captured at creation time. Status is stored as a validated String (the
// frontend value "Partially Received" cannot be a Prisma enum value).

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
  buildVendorSnapshot,
  sellerStateCode,
  rejectProtectedKeys,
  PO_STATUSES,
} from "@/lib/sales-document/shared";
import type { PoStatusT, PricingModeT } from "@/lib/sales-document/shared";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertFinancialYearActive,
  assertDocumentDateInFinancialYear,
  financialYearForBusinessDate,
} from "@/lib/financial-year/financial-year-service";


function normalizeStatus(status: string): PoStatusT {
  if (!(PO_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError("Invalid purchase order status");
  }
  return status as PoStatusT;
}

function normalizePurchaseOrderPayload(raw: Record<string, unknown>) {
  const items = normalizeItems(raw.items, "purchase order");
  return {
    items,
    vendor: (raw.vendor ?? null) as Record<string, unknown> | null,
    status: (str(raw.status) ?? "Draft") as PoStatusT,
    notes: shortText(raw.notes, "notes"),
    terms: shortText(raw.terms, "terms"),
    deliveryAddress: shortText(raw.deliveryAddress, "deliveryAddress"),
    deliveryMode: shortText(raw.deliveryMode, "deliveryMode"),
    placeOfSupply: str(raw.placeOfSupply),
    placeOfSupplyCode: str(raw.placeOfSupplyCode),
    prefix: str(raw.prefix ?? raw.poPrefix) ?? undefined,
  };
}

function toPurchaseOrderJson(p: {
  id: string;
  businessId: string;
  financialYearId: string;
  poNumber: string;
  poDate: Date;
  deliveryDate: Date | null;
  deliveryAddress: string | null;
  deliveryMode: string | null;
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
  vendorSnapshot: unknown;
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
    id: p.id,
    businessId: p.businessId,
    financialYearId: p.financialYearId,
    poNumber: p.poNumber,
    date: p.poDate.toISOString(),
    poDate: p.poDate.toISOString(),
    deliveryDate: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    deliveryAddress: p.deliveryAddress,
    deliveryMode: p.deliveryMode,
    placeOfSupply: p.placeOfSupply,
    placeOfSupplyCode: p.placeOfSupplyCode,
    taxType: p.taxType,
    status: p.status,
    pricingMode: p.pricingMode,
    subtotal: Number(p.subtotal),
    totalDiscount: Number(p.totalDiscount),
    taxableAmount: Number(p.taxableAmount),
    cgst: Number(p.cgst),
    sgst: Number(p.sgst),
    igst: Number(p.igst),
    totalTax: Number(p.totalTax),
    grandTotal: Number(p.grandTotal),
    notes: p.notes,
    terms: p.terms,
    vendor: p.vendorSnapshot,
    items: (p.items ?? []).map((it) => ({
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
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type PurchaseOrderJson = ReturnType<typeof toPurchaseOrderJson>;

function purchaseOrderInclude() {
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
 * Create a purchase order in the member's verified business.
 */
export async function createPurchaseOrder(
  businessIdInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "create");
  const business = ctx.business;

  const pricingMode = normalizePricingMode(
    str(raw.pricingMode) ?? "inclusive",
  );
  const payload = normalizePurchaseOrderPayload(raw);
  const status = normalizeStatus(payload.status);
  const fyId = validateId(raw.financialYearId, "financialYearId is required");
  const poDate = requiredIsoDate(raw.poDate ?? raw.date, "poDate");
  const deliveryDate = optionalIsoDate(raw.deliveryDate, "deliveryDate");

  const vendorSnapshot = buildVendorSnapshot(payload.vendor);

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

  const [fy, found] = await Promise.all([
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
  if (!fy) throw new ResourceNotFoundError("Financial year not found");
  assertFinancialYearActive(fy);
  // F11 — date-owned FY authority (same rule as invoices).
  {
    const derived = await financialYearForBusinessDate(businessId, poDate);
    if (!derived) {
      throw new ValidationError(
        `Purchase order date ${new Date(poDate).toISOString().slice(0, 10)} does not fall within any configured financial year; correct the date or create the financial year first`,
      );
    }
    if (derived.id !== fy.id) {
      throw new ValidationError(
        `The financial year is derived from the purchase order date: it belongs to ${derived.name}, not the requested ${fy.name}`,
      );
    }
  }
  if (found.length !== productIds.length) {
    throw new ResourceNotFoundError("One or more products were not found");
  }
  const productById = Object.fromEntries(found.map((p) => [p.id, p]));

  const created = await prisma.$transaction(
    async (tx) => {
      const allocated = await allocateDocumentNumber(
        businessId,
        fyId,
        "purchaseOrder",
        payload.prefix,
        { db: tx },
      );
      const poNumber = buildDocumentNumber(
        "purchaseOrder",
        fy.name,
        allocated.allocated,
      );

      const po = await tx.purchaseOrder.create({
        data: {
          businessId,
          financialYearId: fyId,
          poNumber,
          poDate,
          deliveryDate,
          deliveryAddress: payload.deliveryAddress,
          deliveryMode: payload.deliveryMode,
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
          vendorSnapshot: vendorSnapshot as Prisma.InputJsonValue,
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
        include: purchaseOrderInclude(),
      });

      return po;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  return toPurchaseOrderJson(created);
}

export async function listPurchaseOrders(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");
  const rows = await prisma.purchaseOrder.findMany({
    where: { businessId },
    orderBy: { poDate: "desc" },
    include: purchaseOrderInclude(),
  });
  return rows.map(toPurchaseOrderJson);
}

export async function getPurchaseOrder(
  businessIdInput: unknown,
  idInput: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "view");
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, businessId },
    include: purchaseOrderInclude(),
  });
  if (!po) throw new ResourceNotFoundError("Purchase order not found");
  return toPurchaseOrderJson(po);
}

// Identity/numbering fields are immutable once minted.
const PO_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "poNumber",
  "createdAt",
  "updatedAt",
  "prefix",
  "poPrefix",
] as const;

/**
 * PATCH — operational edit of a member's purchase order (whitelist-only;
 * totals recomputed server-side). The vendor snapshot is refreshed ONLY when
 * `vendor` is explicitly supplied; otherwise the historical snapshot is kept.
 */
export async function updatePurchaseOrder(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  const ctx = await requireBusinessPermission(businessId, "invoices", "edit");
  const business = ctx.business;

  rejectProtectedKeys(raw, PO_PROTECTED_KEYS);

  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, businessId },
    include: purchaseOrderInclude(),
  });
  if (!existing) throw new ResourceNotFoundError("Purchase order not found");

  const hasItems = raw.items !== undefined;
  const items = hasItems
    ? normalizeItems(raw.items, "purchase order")
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

  const data: Prisma.PurchaseOrderUncheckedUpdateInput = {
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
  if (raw.deliveryAddress !== undefined) {
    const s = shortText(raw.deliveryAddress, "deliveryAddress");
    data.deliveryAddress = s ?? null;
  }
  if (raw.deliveryMode !== undefined) {
    const s = shortText(raw.deliveryMode, "deliveryMode");
    data.deliveryMode = s ?? null;
  }
  if (raw.poDate !== undefined || raw.date !== undefined) {
    const d = requiredIsoDate(str(raw.poDate ?? raw.date), "poDate");
    // F11 — the purchase order's financial-year binding is immutable; a changed
    // date must stay inside it (no cross-FY draft moves).
    await assertDocumentDateInFinancialYear(
      businessId,
      existing.financialYearId,
      d,
      "Purchase order",
    );
    data.poDate = d;
  }
  if (raw.deliveryDate !== undefined) {
    const s = str(raw.deliveryDate);
    if (s) {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new ValidationError("deliveryDate is not a valid date");
      data.deliveryDate = d;
    } else {
      data.deliveryDate = null;
    }
  }

  // Vendor snapshot: refreshed only when explicitly provided.
  if (raw.vendor !== undefined) {
    if (raw.vendor === null || typeof raw.vendor !== "object") {
      throw new ValidationError("vendor must be a vendor snapshot object");
    }
    data.vendorSnapshot = buildVendorSnapshot(
      raw.vendor as Record<string, unknown>,
    ) as Prisma.InputJsonValue;
  }

  const rewriteItems =
    hasItems ||
    pricingMode !== existing.pricingMode ||
    placeOfSupplyCode !== String(existing.placeOfSupplyCode ?? "").trim();

  const updated = await prisma.purchaseOrder.update({
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
    include: purchaseOrderInclude(),
  });

  return toPurchaseOrderJson(updated);
}

/**
 * DELETE — physical removal allowed ONLY for Draft purchase orders. Issued POs
 * (Sent/Accepted/Partially Received/Received) are protected with a 409 — the
 * caller should use Cancelled instead. Cross-tenant or unknown ids stay 404.
 */
export async function deletePurchaseOrder(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, businessId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ResourceNotFoundError("Purchase order not found");

  if (existing.status !== "Draft") {
    throw new ConflictError(
      "Only draft purchase orders can be deleted; issued purchase orders must be cancelled",
    );
  }

  await prisma.purchaseOrder.delete({ where: { id } });
  return { id };
}