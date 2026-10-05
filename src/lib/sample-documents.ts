// Static, deterministic SAMPLE data used by the in-app "View sample & learn"
// preview. Every sample document is rendered through the SAME production PDF
// engine (renderGstInvoicePdf / renderDocumentPdf) — never a mock or a second
// engine — and is branded BizLedger so it can never be mistaken for a customer
// document. All identifiers (GSTIN, PAN, numbers) are fake demo values.
//
// The sample is PURE data: no database writes, no sequence allocation, no
// entitlement or counters, no emails/webhooks/payment. Rendering happens in the
// browser and nothing is downloaded automatically.

import type {
  CompanyProfile,
  Invoice,
  InvoiceItem,
  PricingMode,
} from "@/types";
import { calculateInvoiceTotals, calculateLineTotals } from "@/lib/invoice";
import type { DocPdfItem, RenderDocumentPdfOptions } from "@/lib/print/document-pdf";

export const SAMPLE_PREVIEW_LABEL = "SAMPLE PREVIEW";
export const SAMPLE_NOT_REAL_LABEL = "NOT A REAL DOCUMENT";

/** Notice embedded in the rendered sample itself (in addition to the page badges). */
export const SAMPLE_PDF_NOTICE =
  "SAMPLE PREVIEW — NOT A REAL DOCUMENT. This sample carries no legal effect and cannot be used as a tax document.";

export const SAMPLE_CUSTOMER_NAME = "Sample Customer";
export const SAMPLE_PRODUCT_NAME = "BizLedger Accounting Plan";
export const SAMPLE_PRODUCT_HSN = "998314";
export const SAMPLE_PRODUCT_RATE = 1999;
export const SAMPLE_PRODUCT_GST_RATE = 18;
export const SAMPLE_QUANTITY = 1;

// Clearly fake demo identifiers. The GSTIN uses the "AABCB" PAN pattern reserved
// nowhere real (the app's own demo conventions) so it can never be mistaken for
// a live registration.
export const SAMPLE_DEMO_GSTIN = "33AABCB1234F1Z5";
export const SAMPLE_DEMO_PAN = "AABCB1234F";
export const SAMPLE_INVOICE_NUMBER = "INV/SAMPLE/0001";
export const SAMPLE_QUOTATION_NUMBER = "QT/SAMPLE/0001";
export const SAMPLE_ESTIMATE_NUMBER = "EST/SAMPLE/0001";
export const SAMPLE_PO_NUMBER = "PO/SAMPLE/0001";
export const SAMPLE_VENDOR_NAME = "Sample Supplier";
export const SAMPLE_DATE = "2026-06-01";
export const SAMPLE_DUE_DATE = "2026-06-16";

function sampleLine(rate = SAMPLE_PRODUCT_RATE): InvoiceItem {
  const line = calculateLineTotals(
    { quantity: SAMPLE_QUANTITY, unitPrice: rate, gstRate: SAMPLE_PRODUCT_GST_RATE },
    "inclusive",
    "intrastate",
  );
  return {
    id: "sample-product-line",
    productId: undefined,
    description: SAMPLE_PRODUCT_NAME,
    hsnSac: SAMPLE_PRODUCT_HSN,
    quantity: SAMPLE_QUANTITY,
    unit: "Unit",
    unitPrice: rate,
    taxableAmount: line.taxable,
    gstRate: SAMPLE_PRODUCT_GST_RATE,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmount,
  };
}

/** BizLedger-branded sample company profile (fake, demo only). */
export function sampleCompanyProfile(): CompanyProfile {
  return {
    companyName: "BizLedger Technologies",
    businessType: "Software & IT Services",
    ownerName: "BizLedger Demo",
    mobile: "9000000000",
    email: "demo@bizledger.example",
    website: "bizledger.example",
    streetAddress: "No. 45, Anna Salai, Teynampet",
    addressLine1: "No. 45, Anna Salai, Teynampet",
    city: "Chennai",
    state: "Tamil Nadu (33)",
    pincode: "600002",
    country: "India",
    gstin: SAMPLE_DEMO_GSTIN,
    pan: SAMPLE_DEMO_PAN,
    gstRegistered: "registered",
    bankName: "HDFC Bank",
    accountNumber: "50100234567890",
    ifscCode: "HDFC0000001",
    upiId: "bizledger-demo@upi",
    invoiceTerms:
      "Sample terms — no legal effect.\nThis is a demo document.\nNot valid for tax purposes.",
    paymentTerms: "Immediate (NEFT/RTGS/CHEQUE)",
    gstSupportInfo: "Demo GST support line: 1800-000-0000",
    invoicePrefix: "INV",
    invoiceStartingNumber: 1,
  };
}

/** Full sample Invoice shaped exactly like a persisted invoice (intsrastate TN). */
export function sampleInvoice(): Invoice {
  const pricingMode: PricingMode = "inclusive";
  const items = [sampleLine()];
  const totals = calculateInvoiceTotals(
    [
      {
        quantity: SAMPLE_QUANTITY,
        unitPrice: SAMPLE_PRODUCT_RATE,
        gstRate: SAMPLE_PRODUCT_GST_RATE,
      },
    ],
    pricingMode,
    "intrastate",
  );
  return {
    id: "sample-invoice",
    invoiceNumber: SAMPLE_INVOICE_NUMBER,
    customerId: "sample-customer",
    customerName: SAMPLE_CUSTOMER_NAME,
    customerGstin: SAMPLE_DEMO_GSTIN,
    customerAddress:
      "No. 12, Gandhi Main Road, Chennai, Tamil Nadu - 600001",
    customerPhone: "9000000001",
    date: SAMPLE_DATE,
    dueDate: SAMPLE_DUE_DATE,
    placeOfSupply: "Tamil Nadu (33)",
    placeOfSupplyCode: "33",
    items,
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    totalTax: totals.totalTax,
    grandTotal: totals.grandTotal,
    status: "Pending",
    pricingMode,
    notes: SAMPLE_PDF_NOTICE,
  };
}

function sampleDocItems(): DocPdfItem[] {
  const line = sampleLine();
  return [
    {
      description: line.description,
      hsnSac: line.hsnSac,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      taxableAmount: line.taxableAmount,
      gstRate: line.gstRate,
      totalAmount: line.totalAmount,
    },
  ];
}

function sampleTotals() {
  return calculateInvoiceTotals(
    [
      {
        quantity: SAMPLE_QUANTITY,
        unitPrice: SAMPLE_PRODUCT_RATE,
        gstRate: SAMPLE_PRODUCT_GST_RATE,
      },
    ],
    "inclusive",
    "intrastate",
  );
}

/** RenderDocumentPdfOptions for the quotation / estimate sample preview. */
export function sampleSalesDocumentPdf(
  kind: "quotation" | "estimate",
): RenderDocumentPdfOptions {
  const isQuote = kind === "quotation";
  const totals = sampleTotals();
  return {
    banner: isQuote ? "Quotation" : "Estimate",
    subtitle: isQuote ? "Sample Quotation" : "Sample Estimate",
    docNumber: isQuote ? SAMPLE_QUOTATION_NUMBER : SAMPLE_ESTIMATE_NUMBER,
    metaRows: [
      { label: isQuote ? "Quotation Date" : "Estimate Date", value: SAMPLE_DATE },
      { label: "Valid Until", value: SAMPLE_DUE_DATE },
      { label: "Price Type", value: "GST Inclusive" },
    ],
    party: {
      title: isQuote ? "Quotation For" : "Estimate For",
      name: SAMPLE_CUSTOMER_NAME,
      address: "No. 12, Gandhi Main Road, Chennai, Tamil Nadu - 600001",
      gstin: SAMPLE_DEMO_GSTIN,
    },
    items: sampleDocItems(),
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.grandTotal,
    notes: isQuote
      ? "Sample quotation — no legal effect."
      : "Sample estimate — approximate, no legal effect.",
    terms: "Sample terms — no legal effect.",
    footerNote: SAMPLE_PDF_NOTICE,
  };
}

/** RenderDocumentPdfOptions for the purchase order sample preview. */
export function samplePurchaseOrderPdf(): RenderDocumentPdfOptions {
  const totals = sampleTotals();
  return {
    banner: "Purchase Order",
    subtitle: "Sample Purchase Order",
    docNumber: SAMPLE_PO_NUMBER,
    metaRows: [
      { label: "PO Date", value: SAMPLE_DATE },
      { label: "Delivery Date", value: SAMPLE_DUE_DATE },
      { label: "Delivery Mode", value: "Road (Truck)" },
    ],
    party: {
      title: "Supplier",
      name: SAMPLE_VENDOR_NAME,
      address: "GST Road, Guindy, Chennai, Tamil Nadu - 600032",
      gstin: SAMPLE_DEMO_GSTIN,
      phone: "9000000002",
    },
    deliveryBlock: {
      deliveryDate: SAMPLE_DUE_DATE,
      deliveryAddress: "No. 45, Anna Salai, Teynampet, Chennai - 600002",
      deliveryMode: "Road (Truck)",
    },
    items: sampleDocItems(),
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.grandTotal,
    notes: "Sample purchase order — no legal effect.",
    terms: "Sample terms — no legal effect.",
    footerNote: SAMPLE_PDF_NOTICE,
  };
}