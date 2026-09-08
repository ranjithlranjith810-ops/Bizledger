"use client";

import { http } from "@/lib/api-client";
import type { Customer } from "@/types";

export interface CustomerBackendInput {
  name: string;
  code?: string;
  type?: Customer["type"];
  avatarInitials?: string;
  businessType?: string;
  gstStatus?: Customer["gstStatus"];
  gstin?: string;
  panNumber?: string;
  website?: string;
  contactName?: string;
  contactDesignation?: string;
  contactMobile?: string;
  contactEmail?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPincode?: string;
  billingCountry?: string;
  shippingAddressLine1?: string;
  shippingAddressLine2?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPincode?: string;
  shippingCountry?: string;
  sameAsBilling?: boolean;
  stateCode?: string;
  creditLimit?: number;
  paymentTerms?: string;
  notes?: string;
  status?: Customer["status"];
  outstandingBalance?: number;
  totalSales?: number;
  totalInvoices?: number;
  sinceDate?: string;
}

export function toBackendInput(customer: Customer | Omit<Customer, "id">): CustomerBackendInput {
  const contact = customer.primaryContact ?? { name: "", mobile: "" };
  const billing = customer.billingAddress;
  const shipping = customer.shippingAddress;
  return {
    name: customer.name,
    code: customer.code || undefined,
    type: customer.type,
    avatarInitials: customer.avatarInitials || undefined,
    businessType: customer.businessType || undefined,
    gstStatus: customer.gstStatus,
    gstin: customer.gstin || undefined,
    panNumber: customer.panNumber || undefined,
    website: customer.website || undefined,
    contactName: contact.name || undefined,
    contactDesignation: contact.designation || undefined,
    contactMobile: contact.mobile || undefined,
    contactEmail: contact.email || undefined,
    billingAddressLine1: billing?.addressLine1 || undefined,
    billingAddressLine2: billing?.addressLine2 || undefined,
    billingCity: billing?.city || undefined,
    billingState: billing?.state || undefined,
    billingPincode: billing?.pincode || undefined,
    billingCountry: billing?.country || undefined,
    shippingAddressLine1: shipping?.addressLine1 || undefined,
    shippingAddressLine2: shipping?.addressLine2 || undefined,
    shippingCity: shipping?.city || undefined,
    shippingState: shipping?.state || undefined,
    shippingPincode: shipping?.pincode || undefined,
    shippingCountry: shipping?.country || undefined,
    sameAsBilling: customer.sameAsBilling ?? true,
    stateCode: customer.stateCode || undefined,
    creditLimit: customer.creditLimit ?? 0,
    paymentTerms: customer.paymentTerms || undefined,
    notes: customer.notes || undefined,
    status: customer.status,
    outstandingBalance: customer.outstandingBalance ?? 0,
    totalSales: customer.totalSales ?? 0,
    totalInvoices: customer.totalInvoices ?? 0,
    sinceDate: customer.sinceDate || undefined,
  };
}

export const customersApi = {
  list: (businessId: string) =>
    http.get<{ customers: Customer[] }>("/api/customers", { businessId }),
  create: (businessId: string, input: CustomerBackendInput) =>
    http.post<{ customer: Customer }>("/api/customers", input, { businessId }),
  update: (businessId: string, id: string, input: CustomerBackendInput) =>
    http.patch<{ customer: Customer }>(`/api/customers/${id}`, input, { businessId }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/customers/${id}`, { businessId }),
};