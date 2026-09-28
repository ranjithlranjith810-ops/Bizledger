"use client";

import { http } from "@/lib/api-client";
import { localDateString } from "@/lib/dates";
import type { Estimate, CompanyProfile, PricingMode, InvoiceItem } from "@/types";

export interface EstimateBackendItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  gstRate: number;
  sku?: string;
  hsnSac?: string;
}

export interface EstimateBackendInput {
  customerId: string;
  financialYearId: string;
  items: EstimateBackendItemInput[];
  date: string;
  validUntil?: string;
  scope?: string;
  status: Estimate["status"];
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
  prefix?: string;
  company?: Record<string, unknown> | null;
}

export interface EstimateBackendJson {
  id: string;
  businessId: string;
  financialYearId: string;
  estimateNumber: string;
  date: string;
  estimateDate: string;
  validUntil: string | null;
  scope: string | null;
  customerId: string | null;
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
  convertedQuotationId: string | null;
  convertedQuotationNumber: string | null;
  convertedInvoiceId: string | null;
  convertedInvoiceNumber: string | null;
  convertedAt: string | null;
  customer: Record<string, string> | null;
  company: Record<string, string> | null;
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

export interface EstimateCreateContext {
  financialYearId: string;
  prefix?: string;
  company?: CompanyProfile | null;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
}

/** Frontend Estimate -> backend payload. */
export function toBackendInput(
  estimate: Omit<Estimate, "id" | "createdAt">,
  ctx: EstimateCreateContext,
): EstimateBackendInput {
  return {
    customerId: estimate.customerId,
    financialYearId: ctx.financialYearId,
    items: estimate.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Pcs",
      rate: it.unitPrice,
      gstRate: it.gstRate,
      hsnSac: it.hsnSac || undefined,
    })),
    date: estimate.date || localDateString(),
    validUntil: estimate.validUntil || undefined,
    scope: estimate.scope || undefined,
    status: estimate.status,
    pricingMode: estimate.pricingMode,
    notes: estimate.notes || undefined,
    terms: estimate.terms || undefined,
    placeOfSupply: ctx.placeOfSupply || undefined,
    placeOfSupplyCode: ctx.placeOfSupplyCode || undefined,
    prefix: ctx.prefix || "EST",
    company: ctx.company ? { ...ctx.company } : null,
  };
}

/** Backend EstimateJson -> frontend Estimate shape. */
export function fromBackendEstimate(e: EstimateBackendJson): Estimate {
  const cust = (e.customer ?? {}) as Record<string, string>;
  const items: InvoiceItem[] = (e.items ?? []).map((it) => ({
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
    id: e.id,
    estimateNumber: e.estimateNumber,
    customerId: e.customerId ?? "",
    customerName: cust.name ?? "",
    customerGstin: cust.gstin,
    customerAddress: cust.address,
    customerPhone: cust.phone,
    date: (e.date || e.estimateDate || "").split("T")[0],
    validUntil: e.validUntil ? e.validUntil.split("T")[0] : undefined,
    scope: e.scope ?? undefined,
    items,
    subtotal: e.subtotal,
    cgst: e.cgst,
    sgst: e.sgst,
    igst: e.igst,
    totalTax: e.totalTax,
    grandTotal: e.grandTotal,
    status: e.status as Estimate["status"],
    pricingMode: e.pricingMode as PricingMode,
    notes: e.notes ?? undefined,
    terms: e.terms ?? undefined,
    convertedQuotationId: e.convertedQuotationId ?? undefined,
    convertedQuotationNumber: e.convertedQuotationNumber ?? undefined,
    convertedInvoiceId: e.convertedInvoiceId ?? undefined,
    convertedInvoiceNumber: e.convertedInvoiceNumber ?? undefined,
    convertedAt: e.convertedAt ?? undefined,
    createdAt: e.createdAt,
  };
}

export const estimatesApi = {
  list: (businessId: string) =>
    http.get<{ estimates: EstimateBackendJson[]; count: number }>("/api/estimates", {
      businessId,
    }),
  create: (businessId: string, input: EstimateBackendInput) =>
    http.post<{ estimate: EstimateBackendJson }>("/api/estimates", input, {
      businessId,
    }),
  get: (businessId: string, id: string) =>
    http.get<{ estimate: EstimateBackendJson }>(`/api/estimates/${id}`, {
      businessId,
    }),
  update: (businessId: string, id: string, input: Partial<EstimateBackendInput>) =>
    http.patch<{ estimate: EstimateBackendJson }>(`/api/estimates/${id}`, input, {
      businessId,
    }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/estimates/${id}`, { businessId }),
};