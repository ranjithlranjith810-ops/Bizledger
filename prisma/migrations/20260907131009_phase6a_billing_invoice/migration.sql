-- CreateTable
CREATE TABLE "billing_sequence" (
    "id" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'BL',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "orderId" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "supplierSnapshot" JSONB NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_sequence_fiscalYear_key" ON "billing_sequence"("fiscalYear");

-- CreateIndex
CREATE INDEX "billing_invoice_businessId_createdAt_idx" ON "billing_invoice"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_paymentId_key" ON "billing_invoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_invoiceNumber_key" ON "billing_invoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "business_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
