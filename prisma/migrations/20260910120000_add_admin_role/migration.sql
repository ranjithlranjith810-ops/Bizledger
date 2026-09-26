-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT_ADMIN');

-- AlterTable
ALTER TABLE "platform_admin" ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'SUPER_ADMIN';
