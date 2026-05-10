-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('pending', 'completed', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'openrouter_api_key';
ALTER TYPE "IntegrationProvider" ADD VALUE 'figma_token';

-- AlterTable
ALTER TABLE "Credits" ALTER COLUMN "balance" SET DEFAULT 50;

-- AlterTable
ALTER TABLE "GitHubToken" ADD COLUMN     "iv" TEXT;

-- CreateTable
CREATE TABLE "DocCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "libraryName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCache" (
    "id" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyLogo" TEXT,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "salaryRange" TEXT,
    "jobType" TEXT NOT NULL,
    "location" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "units" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocCache_cacheKey_key" ON "DocCache"("cacheKey");

-- CreateIndex
CREATE INDEX "DocCache_cacheKey_idx" ON "DocCache"("cacheKey");

-- CreateIndex
CREATE INDEX "DocCache_expiresAt_idx" ON "DocCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobCache_remoteId_key" ON "JobCache"("remoteId");

-- CreateIndex
CREATE INDEX "JobCache_category_idx" ON "JobCache"("category");

-- CreateIndex
CREATE INDEX "JobCache_cachedAt_idx" ON "JobCache"("cachedAt");

-- CreateIndex
CREATE INDEX "JobCache_postedAt_idx" ON "JobCache"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_stripeSessionId_key" ON "CreditPurchase"("stripeSessionId");

-- CreateIndex
CREATE INDEX "CreditPurchase_userId_idx" ON "CreditPurchase"("userId");

-- CreateIndex
CREATE INDEX "CreditPurchase_stripeSessionId_idx" ON "CreditPurchase"("stripeSessionId");
