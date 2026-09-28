"use client";

import { http } from "@/lib/api-client";
import { localDateString } from "@/lib/dates";
import type { Invoice, CompanyProfile, PricingMode } from "@/types";

export interface InvoiceBackendItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  gstRate: number;
  sku?: string;
  hsnSac?: string;
}

export interface InvoiceBackendInput {
  customerId: string;
  financialYearId: string;
  items: InvoiceBackendItemInput[];
  invoiceDate: string;
  status: Invoice["status"];
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
  prefix?: string;
  company?: Record<string, unknown> | null;
  vehicle?: {
    vehicleNumber?: string;
    driverName?: string;
    status?: string;
  } | null;
  dueDate?: string;
  ewayBillNumber?: string;
  ewayBillDate?: string;
  sourceDocument?: { type: "quotation" | "estimate"; id: string };
}

export interface InvoiceBackendItem {
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
}

export interface InvoiceBackendJson {
  id: string;
  businessId: string;
  financialYearId: string;
  invoiceNumber: string;
  invoiceDate: string;
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
  dueDate: string | null;
  ewayBillNumber: string | null;
  ewayBillDate: string | null;
  customer: Record<string, string> | null;
  company: Record<string, string> | null;
  vehicle: Record<string, string> | null;
  items: InvoiceBackendItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceCreateContext {
  financialYearId: string;
  prefix?: string;
  company?: CompanyProfile | null;
}

/** Frontend Invoice (built by the create modal / conversion) -> backend payload. */
export function toBackendInput(
  invoice: Omit<Invoice, "id">,
  ctx: InvoiceCreateContext,
): InvoiceBackendInput {
  return {
    customerId: invoice.customerId,
    financialYearId: ctx.financialYearId,
    items: invoice.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Pcs",
      rate: it.unitPrice,
      gstRate: it.gstRate,
      hsnSac: it.hsnSac || undefined,
    })),
    invoiceDate: invoice.date || localDateString(),
    status: invoice.status,
    pricingMode: invoice.pricingMode,
    notes: invoice.notes || undefined,
    terms: ctx.company?.invoiceTerms || undefined,
    placeOfSupply: invoice.placeOfSupply || undefined,
    placeOfSupplyCode: invoice.placeOfSupplyCode || undefined,
    prefix: ctx.prefix || "INV",
    company: ctx.company ? { ...ctx.company } : null,
    vehicle: invoice.vehicle || null,
    dueDate: invoice.dueDate || undefined,
    ewayBillNumber: invoice.ewayBillNumber || undefined,
    ewayBillDate: invoice.ewayBillDate || undefined,
  };
}

/** Backend InvoiceJson -> frontend Invoice shape. */
export function fromBackendInvoice(inv: InvoiceBackendJson): Invoice {
  const cust = (inv.customer ?? {}) as Record<string, string>;
  const veh = (inv.vehicle ?? {}) as Record<string, string>;
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId ?? "",
    customerName: cust.name ?? "",
    customerGstin: cust.gstin,
    customerAddress: cust.address,
    customerPhone: cust.phone,
    date: (inv.invoiceDate || "").split("T")[0],
    dueDate: inv.dueDate ? inv.dueDate.split("T")[0] : "",
    placeOfSupply: inv.placeOfSupply ?? undefined,
    placeOfSupplyCode: inv.placeOfSupplyCode ?? undefined,
    vehicle:
      veh.vehicleNumber || veh.driverName
        ? {
            vehicleNumber: veh.vehicleNumber,
            driverName: veh.driverName,
            status: veh.status,
          }
        : undefined,
    items: (inv.items ?? []).map((it) => ({
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
    })),
    subtotal: inv.subtotal,
    cgst: inv.cgst,
    sgst: inv.sgst,
    igst: inv.igst,
    totalTax: inv.totalTax,
    grandTotal: inv.grandTotal,
    status: inv.status as Invoice["status"],
    pricingMode: inv.pricingMode as PricingMode,
    notes: inv.notes ?? undefined,
    ewayBillNumber: inv.ewayBillNumber ?? undefined,
    ewayBillDate: inv.ewayBillDate ? inv.ewayBillDate.split("T")[0] : undefined,
  };
}

export const invoicesApi = {
  list: (businessId: string) =>
    http.get<{ invoices: InvoiceBackendJson[]; count: number }>("/api/invoices", {
      businessId,
    }),
  create: (businessId: string, input: InvoiceBackendInput) =>
    http.post<{ invoice: InvoiceBackendJson }>("/api/invoices", input, {
      businessId,
    }),
  get: (businessId: string, id: string) =>
    http.get<{ invoice: InvoiceBackendJson }>(`/api/invoices/${id}`, {
      businessId,
    }),
  update: (businessId: string, id: string, input: Partial<InvoiceBackendInput>) =>
    http.patch<{ invoice: InvoiceBackendJson }>(`/api/invoices/${id}`, input, {
      businessId,
    }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/invoices/${id}`, { businessId }),
};