-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('business', 'individual');

-- CreateEnum
CREATE TYPE "CustomerGstStatus" AS ENUM ('registered', 'composite', 'unregistered', 'consumer');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('Active', 'Pending', 'Overdue', 'Inactive');

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "name" TEXT NOT NULL,
    "avatarInitials" TEXT NOT NULL,
    "businessType" TEXT,
    "gstStatus" "CustomerGstStatus" NOT NULL,
    "gstin" TEXT,
    "panNumber" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactDesignation" TEXT,
    "contactMobile" TEXT,
    "contactEmail" TEXT,
    "billingAddressLine1" TEXT,
    "billingAddressLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPincode" TEXT,
    "billingCountry" TEXT,
    "shippingAddressLine1" TEXT,
    "shippingAddressLine2" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingPincode" TEXT,
    "shippingCountry" TEXT,
    "sameAsBilling" BOOLEAN NOT NULL DEFAULT true,
    "stateCode" TEXT,
    "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'Active',
    "outstandingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentAmount" DECIMAL(65,30),
    "lastPaymentDate" TIMESTAMP(3),
    "lastPaymentMethod" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sinceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "unit" TEXT NOT NULL DEFAULT 'Pcs',
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stockQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hsnSac" TEXT,
    "gstRate" DECIMAL(65,30) NOT NULL DEFAULT 18,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_businessId_idx" ON "customer"("businessId");

-- CreateIndex
CREATE INDEX "customer_businessId_name_idx" ON "customer"("businessId", "name");

-- CreateIndex
CREATE INDEX "customer_businessId_gstin_idx" ON "customer"("businessId", "gstin");

-- CreateIndex
CREATE INDEX "customer_businessId_status_idx" ON "customer"("businessId", "status");

-- CreateIndex
CREATE INDEX "product_businessId_idx" ON "product"("businessId");

-- CreateIndex
CREATE INDEX "product_businessId_name_idx" ON "product"("businessId", "name");

-- CreateIndex
CREATE INDEX "product_businessId_category_idx" ON "product"("businessId", "category");

-- CreateIndex
CREATE INDEX "product_businessId_hsnSac_idx" ON "product"("businessId", "hsnSac");

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
