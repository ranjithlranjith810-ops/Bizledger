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
  buildVendorSnapshot,
  sellerStateCode,
  rejectProtectedKeys,
  PO_STATUSES,
  PURCHASE_ORDER_STATUS_TRANSITIONS,
  isLegalTransition,
} from "@/lib/sales-document/shared";
import type { PoStatusT } from "@/lib/sales-document/shared";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertFinancialYearActive,
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
      // The plan's purchase-order monthly quota is enforced server-side inside
      // this transaction (business-row lock → calendar-month count → check)
      // BEFORE the number is allocated and the record inserted.
      await assertCreateAllowed(tx, businessId, "purchaseOrders");
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
//
// `status` is deliberately NOT PATCH-settable, matching the Invoice rule
// (INVOICE_PROTECTED_KEYS + the explicit status rejection in updateInvoice):
// status is a lifecycle fact, not a form field. Accepting an arbitrary
// client-chosen status on PATCH would let a caller assert "Received" — the
// state that represents goods having physically arrived — with no such event
// having occurred, and — because the status also decided whether the old DELETE
// policy would allow removal — would couple a forged status to record
// destruction.
const PO_PROTECTED_KEYS = [
  "id",
  "businessId",
  "financialYearId",
  "poNumber",
  "createdAt",
  "updatedAt",
  "prefix",
  "poPrefix",
  "status",
] as const;

/**
 * PATCH — immutable after creation. A purchase order is created-and-frozen:
 * none of its content fields may be edited through the ordinary PATCH. The ONLY
 * post-creation change is the status lifecycle (transitionPurchaseOrderStatus).
 * Any payload field supplied here is rejected (400) rather than silently
 * ignored, so a stale edit form surfaces its failure instead of pretending
 * success. An empty PATCH is a harmless no-op returning the current document.
 */
export async function updatePurchaseOrder(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  // Identity/status guard: `status` is a lifecycle fact owned by the status
  // endpoint, never a PATCH-settable field. `poNumber` is engine-owned and
  // immutable.
  rejectProtectedKeys(raw, PO_PROTECTED_KEYS);

  // Mass-assignment guard: NOTHING is editable on PATCH. Any residual key (i.e.
  // any content field a client tried to change) aborts the request.
  const contentKeys = Object.keys(raw);
  if (contentKeys.length > 0) {
    throw new ValidationError(
      `Purchase orders are immutable after creation; ${contentKeys.join(", ")} cannot be changed. Only the status can be updated, through the purchase order status endpoint.`,
    );
  }

  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, businessId },
    include: purchaseOrderInclude(),
  });
  if (!existing) throw new ResourceNotFoundError("Purchase order not found");

  return toPurchaseOrderJson(existing);
}

/**
 * STATUS LIFECYCLE — the only path that changes a purchase order's status.
 *
 * Follows transitionInvoiceStatus (the Invoice service is the repository's
 * reference implementation): authorize against `businessId` before reading the
 * document, load the PO scoped to that business so the CURRENT status comes
 * from the database rather than the request, validate the requested edge
 * against PURCHASE_ORDER_STATUS_TRANSITIONS, and only then write.
 *
 * `requestedStatus` is a request to transition, not a column assignment. The
 * ordinary updatePurchaseOrder PATCH still rejects `status` outright.
 *
 * The six statuses are the ones the schema comment already documents
 * ("Draft | Sent | Accepted | Partially Received | Received | Cancelled"); this
 * adds no new status and no new business meaning. The matrix mirrors the other
 * documents: Draft -> Sent, then Sent -> any later status, and every status after
 * Draft is terminal (no receiving progression).
 *
 * No edit-lock semantics are introduced: the repository defines no per-status
 * lockdown for purchase orders, so updatePurchaseOrder is unchanged.
 */
export async function transitionPurchaseOrderStatus(
  businessIdInput: unknown,
  idInput: unknown,
  requestedStatus: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  const target = normalizeStatus(str(requestedStatus) ?? "");

  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, businessId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ResourceNotFoundError("Purchase order not found");

  if (
    !isLegalTransition(PURCHASE_ORDER_STATUS_TRANSITIONS, existing.status, target)
  ) {
    throw new ConflictError(
      `Purchase order cannot transition from ${existing.status} to ${target}`,
    );
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: target },
    include: purchaseOrderInclude(),
  });

  return toPurchaseOrderJson(updated);
}

/**
 * DELETE — NEVER. Purchase orders are not deletable in ANY status, by ANY
 * user, through ANY API.
 *
 * This supersedes the earlier policy, which permitted physical removal of a
 * Draft PO. A draft has already consumed a PO- number from its
 * DocumentSequence for the pinned financial year, so removing it leaves a
 * permanent gap in an auditable numbering run.
 *
 * The route is kept (rather than removed) for API compatibility, but it can
 * only ever reach this rejection: `prisma.purchaseOrder.delete` and
 * `deleteMany` are NOT called from anywhere in the application. A PO that is no
 * longer wanted is closed with Cancelled, never erased.
 *
 * Authorization is still evaluated FIRST, so an unauthenticated caller gets 401
 * and a caller without `invoices.delete` on the business gets 403. Only an
 * authorized caller reaches the 409.
 */
export async function deletePurchaseOrder(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "delete");

  throw new ConflictError(
    "Purchase orders cannot be deleted. Cancel the purchase order instead.",
  );
}