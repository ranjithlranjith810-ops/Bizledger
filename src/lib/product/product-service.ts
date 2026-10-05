// Server-side Product service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) before touching data. The
// `businessId` is a REQUESTED TARGET validated against the authenticated user's
// own BusinessMember; all queries are scoped to the verified business, so a
// caller can never read or write another tenant's products. Product names are
// business-scoped and NOT globally unique.

import { prisma } from "@/lib/prisma";
import { requireBusinessPermission } from "@/lib/business/business-service";
import { withEntitlementCheck } from "@/lib/billing/entitlements-server";
import {
  ValidationError,
  ResourceNotFoundError,
} from "@/lib/business/api-error";
import type { Prisma } from "@/generated/prisma/client";

const MAX_LENGTH = 500;
const MAX_UNIT_PRICE = 99_999_999_999.99;
const MAX_STOCK_QTY = 1_000_000_000;
const MAX_SKU = 100;
const MAX_CATEGORY = 100;
const MAX_UNIT = 20;

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

/** Present monetary/quantity fields must be finite, non-negative and bounded;
 * absent fields stay undefined. Anything else is a sanitized 400 (no silent
 * coercion of junk/negative values to 0). */
function boundedNum(v: unknown, label: string, max: number): number | undefined {
  if (v == null) return undefined;
  const n = num(v);
  if (n === undefined) throw new ValidationError(`${label} must be a number`);
  if (n < 0) throw new ValidationError(`${label} cannot be negative`);
  if (n > max) throw new ValidationError(`${label} is unreasonably large`);
  return n;
}

function strCap(v: unknown, max: number, label: string): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (s.length > max) throw new ValidationError(`${label} is too long`);
  return s;
}

function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

function validateId(id: unknown): string {
  const v = str(id);
  if (!v) throw new ValidationError("Missing resource id");
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

function normalizeProductInput(raw: Record<string, unknown>, partial = false) {
  // Resolve a custom category the same way the frontend AddProductModal does:
  // when the user picks "Other" (or a blank category) and types a custom value,
  // the custom value is stored as the final `category`.
  const rawCategory = str(raw.category);
  const rawCustom = str(raw.customCategory);
  const isOther = rawCategory === "Other" || !rawCategory;
  const resolvedCategory =
    isOther && rawCustom ? rawCustom : (rawCategory ?? "General");

  const name = str(raw.name);
  if (partial) {
    if (name !== undefined && name === "") {
      throw new ValidationError("Product name cannot be empty");
    }
    if (name !== undefined && name.length > MAX_LENGTH) {
      throw new ValidationError("Product name is too long");
    }
  } else {
    if (!name) throw new ValidationError("Product name is required");
    if (name.length > MAX_LENGTH) throw new ValidationError("Product name is too long");
  }

  const gstRate = num(raw.gstRate);
  if (gstRate != null && (gstRate < 0 || gstRate > 100)) {
    throw new ValidationError("GST rate must be between 0 and 100");
  }
  const unitPrice = boundedNum(raw.unitPrice, "Unit price", MAX_UNIT_PRICE);
  const stockQuantity = boundedNum(raw.stockQuantity, "Stock quantity", MAX_STOCK_QTY);
  const hsnSac = str(raw.hsnSac);
  if (hsnSac && !/^\d{2,8}$/.test(hsnSac)) {
    // Match frontend validateHsnSAC: 2-8 numeric digits, optional.
    throw new ValidationError("HSN/SAC code must be 2 to 8 digits (numeric)");
  }

  const sku = strCap(raw.sku, MAX_SKU, "SKU");
  const category =
    resolvedCategory === undefined
      ? undefined
      : strCap(resolvedCategory, MAX_CATEGORY, "Category");
  const unit = strCap(raw.unit, MAX_UNIT, "Unit");

  const out: Record<string, unknown> = {};
  if (name !== undefined) out.name = name;
  if (sku !== undefined || !partial) out.sku = sku;
  if (rawCategory !== undefined || rawCustom !== undefined || !partial) {
    out.category = partial && (rawCategory === undefined && rawCustom === undefined)
      ? undefined
      : category;
  }
  if (raw.unit !== undefined || !partial) out.unit = unit ?? "Pcs";
  if (raw.unitPrice !== undefined || !partial) out.unitPrice = unitPrice ?? 0;
  if (raw.stockQuantity !== undefined || !partial) out.stockQuantity = stockQuantity ?? 0;
  if (raw.hsnSac !== undefined || !partial) out.hsnSac = hsnSac ? hsnSac.toUpperCase() : undefined;
  if (raw.gstRate !== undefined || !partial) out.gstRate = gstRate ?? 18;

  // Filter undefined entries so PATCH only touches provided fields.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean as {
    name?: string;
    sku?: string;
    category?: string;
    unit?: string;
    unitPrice?: number;
    stockQuantity?: number;
    hsnSac?: string;
    gstRate?: number;
  };
}

function toProductJson(p: {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: Prisma.Decimal | number;
  stockQuantity: Prisma.Decimal | number;
  hsnSac: string | null;
  gstRate: Prisma.Decimal | number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    unit: p.unit,
    unitPrice: Number(p.unitPrice),
    stockQuantity: Number(p.stockQuantity),
    hsnSac: p.hsnSac,
    gstRate: Number(p.gstRate),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type ProductJson = ReturnType<typeof toProductJson>;

/**
 * Create a product in the member's verified business. SKU is auto-generated
 * when blank, matching the frontend behaviour.
 */
export async function createProduct(businessIdInput: unknown, raw: Record<string, unknown>) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "create");
  const data = normalizeProductInput(raw);
  const { name } = data;
  if (!name) throw new ValidationError("Product name is required");

  // F3: plan ceiling for products enforced server-side inside ONE transaction.
  const created = await withEntitlementCheck(businessId, "products", (tx) =>
    tx.product.create({
      data: {
        businessId,
        ...data,
        name,
        sku: data.sku ?? `SKU-${Date.now().toString().slice(-6)}`,
      },
    }),
  );

  return toProductJson(created);
}

/**
 * List products for the member's verified business, with optional
 * case-insensitive partial search across the same fields the frontend searches
 * (name, sku, hsnSac, category). Empty/whitespace query returns all products.
 */
export async function listProducts(businessIdInput: unknown, opts: { q?: string }) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const q = String(opts?.q ?? "").trim().toLowerCase();
  if (q.length > 200) throw new ValidationError("Search query is too long");

  const where: Prisma.ProductWhereInput = { businessId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { hsnSac: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toProductJson);
}

/**
 * Get one product by id within the member's verified business.
 */
export async function getProduct(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const product = await prisma.product.findFirst({ where: { id, businessId } });
  if (!product) throw new ResourceNotFoundError("Product not found");
  return toProductJson(product);
}

/**
 * Update a product within the member's verified business.
 */
export async function updateProduct(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  const existing = await prisma.product.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Product not found");

  const data = normalizeProductInput(raw, true);
  const updated = await prisma.product.update({
    where: { id },
    data,
  });

  return toProductJson(updated);
}

/**
 * Delete a product within the member's verified business.
 */
export async function deleteProduct(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "edit");

  const existing = await prisma.product.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Product not found");

  await prisma.product.delete({ where: { id } });
  return { id };
}
