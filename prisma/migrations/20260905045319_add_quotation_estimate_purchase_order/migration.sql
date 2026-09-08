-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired');

-- CreateTable
CREATE TABLE "quotation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "customerId" TEXT,
    "placeOfSupply" TEXT,
    "placeOfSupplyCode" TEXT,
    "taxType" "TaxType" NOT NULL DEFAULT 'intrastate',
    "status" "QuotationStatus" NOT NULL DEFAULT 'Draft',
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
    "sourceEstimateId" TEXT,
    "convertedInvoiceId" TEXT,
    "convertedInvoiceNumber" TEXT,
    "convertedAt" TIMESTAMP(3),
    "customerSnapshot" JSONB,
    "companySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_item" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
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

    CONSTRAINT "quotation_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "estimateDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "scope" TEXT,
    "customerId" TEXT,
    "placeOfSupply" TEXT,
    "placeOfSupplyCode" TEXT,
    "taxType" "TaxType" NOT NULL DEFAULT 'intrastate',
    "status" "EstimateStatus" NOT NULL DEFAULT 'Draft',
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
    "convertedQuotationId" TEXT,
    "convertedQuotationNumber" TEXT,
    "convertedInvoiceId" TEXT,
    "convertedInvoiceNumber" TEXT,
    "convertedAt" TIMESTAMP(3),
    "customerSnapshot" JSONB,
    "companySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_item" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
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

    CONSTRAINT "estimate_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "deliveryAddress" TEXT,
    "deliveryMode" TEXT,
    "placeOfSupply" TEXT,
    "placeOfSupplyCode" TEXT,
    "taxType" "TaxType" NOT NULL DEFAULT 'intrastate',
    "status" TEXT NOT NULL DEFAULT 'Draft',
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
    "vendorSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_item" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
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

    CONSTRAINT "purchase_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_businessId_financialYearId_idx" ON "quotation"("businessId", "financialYearId");

-- CreateIndex
CREATE INDEX "quotation_quotationDate_idx" ON "quotation"("quotationDate");

-- CreateIndex
CREATE INDEX "quotation_status_idx" ON "quotation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_businessId_quotationNumber_key" ON "quotation"("businessId", "quotationNumber");

-- CreateIndex
CREATE INDEX "quotation_item_quotationId_idx" ON "quotation_item"("quotationId");

-- CreateIndex
CREATE INDEX "quotation_item_productId_idx" ON "quotation_item"("productId");

-- CreateIndex
CREATE INDEX "estimate_businessId_financialYearId_idx" ON "estimate"("businessId", "financialYearId");

-- CreateIndex
CREATE INDEX "estimate_estimateDate_idx" ON "estimate"("estimateDate");

-- CreateIndex
CREATE INDEX "estimate_status_idx" ON "estimate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_businessId_estimateNumber_key" ON "estimate"("businessId", "estimateNumber");

-- CreateIndex
CREATE INDEX "estimate_item_estimateId_idx" ON "estimate_item"("estimateId");

-- CreateIndex
CREATE INDEX "estimate_item_productId_idx" ON "estimate_item"("productId");

-- CreateIndex
CREATE INDEX "purchase_order_businessId_financialYearId_idx" ON "purchase_order"("businessId", "financialYearId");

-- CreateIndex
CREATE INDEX "purchase_order_poDate_idx" ON "purchase_order"("poDate");

-- CreateIndex
CREATE INDEX "purchase_order_status_idx" ON "purchase_order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_businessId_poNumber_key" ON "purchase_order"("businessId", "poNumber");

-- CreateIndex
CREATE INDEX "purchase_order_item_purchaseOrderId_idx" ON "purchase_order_item"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_item_productId_idx" ON "purchase_order_item"("productId");

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_sourceEstimateId_fkey" FOREIGN KEY ("sourceEstimateId") REFERENCES "estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_convertedInvoiceId_fkey" FOREIGN KEY ("convertedInvoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_item" ADD CONSTRAINT "quotation_item_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_item" ADD CONSTRAINT "quotation_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_convertedQuotationId_fkey" FOREIGN KEY ("convertedQuotationId") REFERENCES "quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_convertedInvoiceId_fkey" FOREIGN KEY ("convertedInvoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item" ADD CONSTRAINT "estimate_item_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item" ADD CONSTRAINT "estimate_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
