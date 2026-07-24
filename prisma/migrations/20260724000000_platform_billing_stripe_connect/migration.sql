-- CreateEnum
CREATE TYPE "PlatformStatus" AS ENUM ('PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN     "platformStatus" "PlatformStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  ADD COLUMN     "platformStatusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN     "platformPlan" TEXT,
  ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN     "taxId" TEXT,
  ADD COLUMN     "billingEmail" TEXT,
  ADD COLUMN     "billingName" TEXT,
  ADD COLUMN     "platformStripeCustomerId" TEXT,
  ADD COLUMN     "platformStripeSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StripeAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_platformStripeCustomerId_key" ON "Organization"("platformStripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_platformStripeSubscriptionId_key" ON "Organization"("platformStripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeAccount_orgId_key" ON "StripeAccount"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeAccount_accountId_key" ON "StripeAccount"("accountId");

-- AddForeignKey
ALTER TABLE "StripeAccount" ADD CONSTRAINT "StripeAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Orgs sembradas/pre-existentes ya operan: RB-PLAT-007 las deja en ACTIVE en
-- vez de reaplicarles el muro de pago retroactivamente.
UPDATE "Organization" SET "platformStatus" = 'ACTIVE';
