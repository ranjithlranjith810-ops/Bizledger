-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'VERIFIED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "plan_catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'month',
    "businessNetworkIncluded" BOOLEAN NOT NULL DEFAULT false,
    "limits" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'month',
    "startedAt" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "planSnapshot" JSONB,
    "razorpaySubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_record" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL,
    "method" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "razorpayEventId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_event" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_subscription_businessId_status_idx" ON "business_subscription"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_record_razorpayEventId_key" ON "payment_record"("razorpayEventId");

-- CreateIndex
CREATE INDEX "payment_record_businessId_createdAt_idx" ON "payment_record"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_record_businessId_status_idx" ON "payment_record"("businessId", "status");

-- CreateIndex
CREATE INDEX "payment_record_orderId_idx" ON "payment_record"("orderId");

-- CreateIndex
CREATE INDEX "payment_record_paymentId_idx" ON "payment_record"("paymentId");

-- CreateIndex
CREATE INDEX "subscription_event_subscriptionId_createdAt_idx" ON "subscription_event"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_eventId_key" ON "webhook_event"("eventId");

-- CreateIndex
CREATE INDEX "webhook_event_eventType_createdAt_idx" ON "webhook_event"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_event_processed_createdAt_idx" ON "webhook_event"("processed", "createdAt");

-- AddForeignKey
ALTER TABLE "business_subscription" ADD CONSTRAINT "business_subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_subscription" ADD CONSTRAINT "business_subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "business_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_event" ADD CONSTRAINT "subscription_event_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "business_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one PENDING or ACTIVE subscription per business. Prisma cannot
-- express a partial unique index in the schema, so it is declared here (raw
-- SQL) to make the one-active-or-pending invariant a hard database guarantee
-- on top of any later service-layer enforcement. CANCELLED/EXPIRED/SUSPENDED
-- history may coexist freely.
CREATE UNIQUE INDEX "business_subscription_one_active_pending" ON "business_subscription"("businessId") WHERE "status" IN ('PENDING', 'ACTIVE');
