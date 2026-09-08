"use client";

import { http } from "@/lib/api-client";
import type { PurchaseOrder, CompanyProfile, PricingMode, InvoiceItem, PurchaseOrderVendor } from "@/types";

export interface PurchaseOrderBackendItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  gstRate: number;
  sku?: string;
  hsnSac?: string;
}

export interface PurchaseOrderBackendInput {
  financialYearId: string;
  items: PurchaseOrderBackendItemInput[];
  vendor?: Record<string, unknown> | null;
  date?: string;
  poDate?: string;
  deliveryDate?: string;
  deliveryAddress?: string;
  deliveryMode?: string;
  status: PurchaseOrder["status"];
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
  prefix?: string;
  company?: Record<string, unknown> | null;
}

export interface PurchaseOrderBackendJson {
  id: string;
  businessId: string;
  financialYearId: string;
  poNumber: string;
  date: string;
  poDate: string;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  deliveryMode: string | null;
  placeOfSupply: string | null;
  placeOfSupplyCode: string | null;
  taxType: string;
  status: string;
  pricingMode: string;
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  notes: string | null;
  terms: string | null;
  vendor: Record<string, string> | null;
  items: {
    id: string;
    productId: string | null;
    productName: string;
    sku: string | null;
    hsnSac: string | null;
    unit: string | null;
    quantity: number;
    rate: number;
    pricingMode: string;
    gstRate: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    taxAmount: number;
    totalAmount: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderCreateContext {
  financialYearId: string;
  prefix?: string;
  company?: CompanyProfile | null;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
}

/** Frontend PurchaseOrder -> backend payload. */
export function toBackendInput(
  po: Omit<PurchaseOrder, "id" | "createdAt">,
  ctx: PurchaseOrderCreateContext,
): PurchaseOrderBackendInput {
  return {
    financialYearId: ctx.financialYearId,
    items: po.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Pcs",
      rate: it.unitPrice,
      gstRate: it.gstRate,
      hsnSac: it.hsnSac || undefined,
    })),
    vendor: po.vendor ? { ...po.vendor } : null,
    date: po.date || new Date().toISOString().split("T")[0],
    deliveryDate: po.deliveryDate || undefined,
    deliveryAddress: po.deliveryAddress || undefined,
    deliveryMode: po.deliveryMode || undefined,
    status: po.status,
    pricingMode: po.pricingMode,
    notes: po.notes || undefined,
    terms: po.terms || undefined,
    placeOfSupply: ctx.placeOfSupply || undefined,
    placeOfSupplyCode: ctx.placeOfSupplyCode || undefined,
    prefix: ctx.prefix || "PO",
    company: ctx.company ? { ...ctx.company } : null,
  };
}

/** Backend PurchaseOrderJson -> frontend PurchaseOrder shape. */
export function fromBackendPurchaseOrder(p: PurchaseOrderBackendJson): PurchaseOrder {
  const vendor = (p.vendor ?? {}) as Partial<PurchaseOrderVendor>;
  const items: InvoiceItem[] = (p.items ?? []).map((it) => ({
    id: it.id,
    productId: it.productId ?? undefined,
    description: it.productName ?? "Item",
    hsnSac: it.hsnSac ?? undefined,
    quantity: it.quantity,
    unit: it.unit ?? "Pcs",
    unitPrice: it.rate,
    taxableAmount: it.taxableAmount,
    gstRate: it.gstRate,
    taxAmount: it.taxAmount,
    totalAmount: it.totalAmount,
  }));
  return {
    id: p.id,
    poNumber: p.poNumber,
    vendor: {
      name: vendor.name ?? "",
      contactPerson: vendor.contactPerson,
      email: vendor.email,
      phone: vendor.phone,
      gstin: vendor.gstin,
      address: vendor.address,
    },
    date: (p.date || p.poDate || "").split("T")[0],
    deliveryDate: p.deliveryDate ? p.deliveryDate.split("T")[0] : undefined,
    deliveryAddress: p.deliveryAddress ?? undefined,
    deliveryMode: p.deliveryMode ?? undefined,
    items,
    subtotal: p.subtotal,
    cgst: p.cgst,
    sgst: p.sgst,
    igst: p.igst,
    totalTax: p.totalTax,
    grandTotal: p.grandTotal,
    status: p.status as PurchaseOrder["status"],
    pricingMode: p.pricingMode as PricingMode,
    notes: p.notes ?? undefined,
    terms: p.terms ?? undefined,
    createdAt: p.createdAt,
  };
}

export const purchaseOrdersApi = {
  list: (businessId: string) =>
    http.get<{ purchaseOrders: PurchaseOrderBackendJson[]; count: number }>("/api/purchase-orders", {
      businessId,
    }),
  create: (businessId: string, input: PurchaseOrderBackendInput) =>
    http.post<{ purchaseOrder: PurchaseOrderBackendJson }>("/api/purchase-orders", input, {
      businessId,
    }),
  get: (businessId: string, id: string) =>
    http.get<{ purchaseOrder: PurchaseOrderBackendJson }>(`/api/purchase-orders/${id}`, {
      businessId,
    }),
  update: (businessId: string, id: string, input: Partial<PurchaseOrderBackendInput>) =>
    http.patch<{ purchaseOrder: PurchaseOrderBackendJson }>(`/api/purchase-orders/${id}`, input, {
      businessId,
    }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/purchase-orders/${id}`, { businessId }),
};