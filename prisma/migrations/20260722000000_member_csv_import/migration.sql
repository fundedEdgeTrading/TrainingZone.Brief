-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChurnRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "sex" "Sex",
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "churnRisk" "ChurnRisk",
ADD COLUMN     "primaryAspiration" TEXT,
ADD COLUMN     "secondaryAspiration" TEXT,
ADD COLUMN     "lastAccessAt" TIMESTAMP(3),
ADD COLUMN     "lastInteractionAt" TIMESTAMP(3),
ADD COLUMN     "accountCreatedAt" TIMESTAMP(3),
ADD COLUMN     "mywellnessAccount" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalSource" TEXT,
ADD COLUMN     "externalRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_orgId_externalRef_key" ON "Member"("orgId", "externalRef");
