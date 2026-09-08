-- CreateEnum
CREATE TYPE "DirectoryStatus" AS ENUM ('NOT_LISTED', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED', 'REJECTED');

-- AlterTable
ALTER TABLE "business_member" ADD COLUMN     "designation" TEXT,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "permissions" JSONB,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_directory_profile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "DirectoryStatus" NOT NULL DEFAULT 'NOT_LISTED',
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "companyName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "categories" TEXT[],
    "description" TEXT,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "landmark" TEXT,
    "ownerName" TEXT NOT NULL,
    "primaryPhone" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "gstin" TEXT,
    "gstVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_directory_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_userId_isRead_idx" ON "notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notification_userId_businessId_isRead_idx" ON "notification"("userId", "businessId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "business_directory_profile_businessId_key" ON "business_directory_profile"("businessId");

-- CreateIndex
CREATE INDEX "business_directory_profile_status_isListed_idx" ON "business_directory_profile"("status", "isListed");

-- CreateIndex
CREATE INDEX "business_directory_profile_businessType_idx" ON "business_directory_profile"("businessType");

-- CreateIndex
CREATE INDEX "business_directory_profile_state_idx" ON "business_directory_profile"("state");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_directory_profile" ADD CONSTRAINT "business_directory_profile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
