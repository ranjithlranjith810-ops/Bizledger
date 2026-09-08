// Phase 6A — read-only billing history + payment/invoice detail DTOs.
//
// The billing UI shows ALL payment attempts (VERIFIED / FAILED / CREATED /
// CANCELLED) in one table: verified attempts link to their BillingInvoice /
// Payment Receipt; failed ones never get an invoice number and offer a retry.
// This module is strictly READ-ONLY — nothing here mints, allocates, or mutates.
// Tenancy is enforced by the API layer (requireBusinessRole) BEFORE calling in,
// and every row is scoped to the caller's own businessId.

import "server-only";

import { prisma } from "@/lib/prisma";
import { moneyString } from "@/lib/billing/calculator";
import {
  toBillingInvoiceDto,
  type BillingInvoiceDto,
} from "@/lib/billing/billing-invoice-service";

interface HistoryRow {
  id: string;
  date: string;
  planId: string;
  planName: string;
  billingPeriod: string;
  baseAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  method: string | null;
  orderId: string | null;
  description: string | null;
  /** Safe receipt link data — present only for verified payments. */
  invoice: { id: string; invoiceNumber: string; invoiceDate: string } | null;
}

/**
 * All payment attempts for a business, newest first. Money serialized to 2dp
 * strings; the receipt link is a minimal shape (the full receipt renders on the
 * detail page). Never throws — an empty list is a normal state.
 */
export async function getBillingHistoryDto(businessId: string): Promise<HistoryRow[]> {
  const rows = await prisma.paymentRecord.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      planId: true,
      planName: true,
      billingPeriod: true,
      baseAmount: true,
      gstRate: true,
      gstAmount: true,
      totalAmount: true,
      currency: true,
      status: true,
      method: true,
      orderId: true,
      description: true,
      createdAt: true,
      billingInvoice: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    date: r.createdAt.toISOString(),
    planId: r.planId,
    planName: r.planName,
    billingPeriod: r.billingPeriod,
    baseAmount: moneyString(r.baseAmount),
    gstRate: moneyString(r.gstRate),
    gstAmount: moneyString(r.gstAmount),
    totalAmount: moneyString(r.totalAmount),
    currency: r.currency,
    status: r.status,
    method: r.method,
    orderId: r.orderId,
    description: r.description,
    invoice: r.billingInvoice
      ? {
          id: r.billingInvoice.id,
          invoiceNumber: r.billingInvoice.invoiceNumber,
          invoiceDate: r.billingInvoice.invoiceDate.toISOString(),
        }
      : null,
  }));
}

export interface BillingPaymentDetail {
  payment: {
    id: string;
    planId: string;
    planName: string;
    billingPeriod: string;
    baseAmount: string;
    gstRate: string;
    gstAmount: string;
    totalAmount: string;
    currency: string;
    status: string;
    method: string | null;
    orderId: string | null;
    paymentId: string | null;
    description: string | null;
    createdAt: string;
  };
  invoice: BillingInvoiceDto | null;
}

/**
 * One payment attempt (with its receipt, when one exists) for the detail page.
 * Scoped to the caller's business. Returns null when the payment does not belong
 * to this tenant — the caller maps null to a 404 without disclosing existence.
 */
export async function getBillingPaymentDetailDto(
  businessId: string,
  paymentRecordId: string,
): Promise<BillingPaymentDetail | null> {
  const row = await prisma.paymentRecord.findFirst({
    where: { id: paymentRecordId, businessId },
    select: {
      id: true,
      planId: true,
      planName: true,
      billingPeriod: true,
      baseAmount: true,
      gstRate: true,
      gstAmount: true,
      totalAmount: true,
      currency: true,
      status: true,
      method: true,
      orderId: true,
      paymentId: true,
      description: true,
      createdAt: true,
      billingInvoice: true,
    },
  });
  if (!row) return null;

  const { billingInvoice, ...payment } = row;
  return {
    payment: {
      id: payment.id,
      planId: payment.planId,
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      baseAmount: moneyString(payment.baseAmount),
      gstRate: moneyString(payment.gstRate),
      gstAmount: moneyString(payment.gstAmount),
      totalAmount: moneyString(payment.totalAmount),
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      description: payment.description,
      createdAt: payment.createdAt.toISOString(),
    },
    invoice: billingInvoice ? toBillingInvoiceDto(billingInvoice) : null,
  };
}