-- AlterTable: add companyProfileJson to Business (nullable, backward-compatible)
-- Stores the full company profile payload (bank/UPI/terms/prefix/logo etc.)
-- that has no dedicated Business column. The profile round-trips as a single
-- JSON blob so new fields need no migration.
ALTER TABLE "business" ADD COLUMN "companyProfileJson" JSONB;