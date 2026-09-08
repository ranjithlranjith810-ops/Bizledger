-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('inclusive', 'exclusive');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('intrastate', 'interstate');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('Paid', 'Pending', 'Overdue', 'Draft', 'Cancelled');

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "placeOfSupply" TEXT,
    "placeOfSupplyCode" TEXT,
    "taxType" "TaxType" NOT NULL DEFAULT 'intrastate',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Draft',
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'inclusive',
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "dueDate" TIMESTAMP(3),
    "ewayBillNumber" TEXT,
    "ewayBillDate" TIMESTAMP(3),
    "customerSnapshot" JSONB,
    "companySnapshot" JSONB,
    "vehicleSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_item" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "hsnSac" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'inclusive',
    "gstRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_businessId_financialYearId_idx" ON "invoice"("businessId", "financialYearId");

-- CreateIndex
CREATE INDEX "invoice_invoiceDate_idx" ON "invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "invoice_status_idx" ON "invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_businessId_invoiceNumber_key" ON "invoice"("businessId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_item_invoiceId_idx" ON "invoice_item"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_item_productId_idx" ON "invoice_item"("productId");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
