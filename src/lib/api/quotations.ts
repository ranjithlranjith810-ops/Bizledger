"use client";

import { http } from "@/lib/api-client";
import type { Quotation, CompanyProfile, PricingMode, InvoiceItem } from "@/types";

export interface QuotationBackendItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  gstRate: number;
  sku?: string;
  hsnSac?: string;
}

export interface QuotationBackendInput {
  customerId: string;
  financialYearId: string;
  items: QuotationBackendItemInput[];
  date: string;
  validUntil?: string;
  status: Quotation["status"];
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
  prefix?: string;
  company?: Record<string, unknown> | null;
  sourceEstimateId?: string;
}

export interface QuotationBackendJson {
  id: string;
  businessId: string;
  financialYearId: string;
  quotationNumber: string;
  date: string;
  quotationDate: string;
  validUntil: string | null;
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
  sourceEstimateId: string | null;
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

export interface QuotationCreateContext {
  financialYearId: string;
  prefix?: string;
  company?: CompanyProfile | null;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
}

/** Frontend Quotation -> backend payload. */
export function toBackendInput(
  quotation: Omit<Quotation, "id" | "createdAt">,
  ctx: QuotationCreateContext,
): QuotationBackendInput {
  return {
    customerId: quotation.customerId,
    financialYearId: ctx.financialYearId,
    items: quotation.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Pcs",
      rate: it.unitPrice,
      gstRate: it.gstRate,
      hsnSac: it.hsnSac || undefined,
    })),
    date: quotation.date || new Date().toISOString().split("T")[0],
    validUntil: quotation.validUntil || undefined,
    status: quotation.status,
    pricingMode: quotation.pricingMode,
    notes: quotation.notes || undefined,
    terms: quotation.terms || undefined,
    placeOfSupply: ctx.placeOfSupply || undefined,
    placeOfSupplyCode: ctx.placeOfSupplyCode || undefined,
    prefix: ctx.prefix || "QT",
    company: ctx.company ? { ...ctx.company } : null,
  };
}

/** Backend QuotationJson -> frontend Quotation shape. */
export function fromBackendQuotation(q: QuotationBackendJson): Quotation {
  const cust = (q.customer ?? {}) as Record<string, string>;
  const items: InvoiceItem[] = (q.items ?? []).map((it) => ({
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
    id: q.id,
    quotationNumber: q.quotationNumber,
    customerId: q.customerId ?? "",
    customerName: cust.name ?? "",
    customerGstin: cust.gstin,
    customerAddress: cust.address,
    customerPhone: cust.phone,
    date: (q.date || q.quotationDate || "").split("T")[0],
    validUntil: q.validUntil ? q.validUntil.split("T")[0] : "",
    items,
    subtotal: q.subtotal,
    cgst: q.cgst,
    sgst: q.sgst,
    igst: q.igst,
    totalTax: q.totalTax,
    grandTotal: q.grandTotal,
    status: q.status as Quotation["status"],
    pricingMode: q.pricingMode as PricingMode,
    notes: q.notes ?? undefined,
    terms: q.terms ?? undefined,
    convertedInvoiceId: q.convertedInvoiceId ?? undefined,
    convertedInvoiceNumber: q.convertedInvoiceNumber ?? undefined,
    convertedAt: q.convertedAt ?? undefined,
    createdAt: q.createdAt,
  };
}

export const quotationsApi = {
  list: (businessId: string) =>
    http.get<{ quotations: QuotationBackendJson[]; count: number }>("/api/quotations", {
      businessId,
    }),
  create: (businessId: string, input: QuotationBackendInput) =>
    http.post<{ quotation: QuotationBackendJson }>("/api/quotations", input, {
      businessId,
    }),
  get: (businessId: string, id: string) =>
    http.get<{ quotation: QuotationBackendJson }>(`/api/quotations/${id}`, {
      businessId,
    }),
  update: (businessId: string, id: string, input: Partial<QuotationBackendInput>) =>
    http.patch<{ quotation: QuotationBackendJson }>(`/api/quotations/${id}`, input, {
      businessId,
    }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/quotations/${id}`, { businessId }),
};