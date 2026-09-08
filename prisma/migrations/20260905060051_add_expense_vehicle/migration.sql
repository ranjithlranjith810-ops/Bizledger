-- CreateTable
CREATE TABLE "vehicle" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "makeModel" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "manufacturingYear" INTEGER NOT NULL,
    "chassisNumber" TEXT,
    "engineNumber" TEXT,
    "assignedRoute" TEXT,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "driverLicense" TEXT,
    "driverLicenseExpiry" TIMESTAMP(3),
    "insurancePolicyNumber" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "fcExpiry" TIMESTAMP(3),
    "pucExpiry" TIMESTAMP(3),
    "currentOdometer" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastServiceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paidFromAccount" TEXT,
    "referenceNumber" TEXT,
    "vendor" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Paid',
    "notes" TEXT,
    "receiptUrl" TEXT,
    "receiptName" TEXT,
    "receiptSize" TEXT,
    "vehicleId" TEXT,
    "vehicleRegistration" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_businessId_status_idx" ON "vehicle"("businessId", "status");

-- CreateIndex
CREATE INDEX "vehicle_status_idx" ON "vehicle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_businessId_registrationNumber_key" ON "vehicle"("businessId", "registrationNumber");

-- CreateIndex
CREATE INDEX "expense_businessId_date_idx" ON "expense"("businessId", "date");

-- CreateIndex
CREATE INDEX "expense_businessId_category_idx" ON "expense"("businessId", "category");

-- CreateIndex
CREATE INDEX "expense_businessId_status_idx" ON "expense"("businessId", "status");

-- CreateIndex
CREATE INDEX "expense_businessId_vehicleId_idx" ON "expense"("businessId", "vehicleId");

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
