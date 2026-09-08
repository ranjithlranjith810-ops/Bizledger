-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('invoice', 'quotation', 'estimate', 'purchaseOrder');

-- CreateTable
CREATE TABLE "financial_year" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequence" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_year_businessId_idx" ON "financial_year"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_year_businessId_name_key" ON "financial_year"("businessId", "name");

-- CreateIndex
CREATE INDEX "document_sequence_businessId_financialYearId_idx" ON "document_sequence"("businessId", "financialYearId");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequence_businessId_financialYearId_kind_key" ON "document_sequence"("businessId", "financialYearId", "kind");

-- AddForeignKey
ALTER TABLE "financial_year" ADD CONSTRAINT "financial_year_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one ACTIVE financial year per business. Prisma cannot express a
-- partial unique index in the schema, so it is declared here (raw SQL) to make
-- the single-active invariant a hard database guarantee on top of the service-
-- layer transactional enforcement.
CREATE UNIQUE INDEX "financial_year_one_active_per_business" ON "financial_year"("businessId") WHERE "isActive";
