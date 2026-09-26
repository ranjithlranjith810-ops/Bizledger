-- AlterTable: add createdById / approvedById to Expense (nullable, backward-compatible)
ALTER TABLE "expense" ADD COLUMN "createdById" TEXT;
ALTER TABLE "expense" ADD COLUMN "approvedById" TEXT;

-- CreateTable: RateLimit (shared sliding-window counter for Better Auth + app-route limiter)
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- Unique on key so ON CONFLICT (key) atomic upsert works for the app-route limiter.
ALTER TABLE "rate_limit" ADD CONSTRAINT "rate_limit_key_key" UNIQUE ("key");
