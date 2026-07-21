-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "heightCm" INTEGER;

-- AlterTable
ALTER TABLE "MemberProgressEntry" ADD COLUMN     "muscleMassKg" DOUBLE PRECISION,
ADD COLUMN     "fatMassKg" DOUBLE PRECISION,
ADD COLUMN     "fatFreeMassKg" DOUBLE PRECISION,
ADD COLUMN     "bodyWaterPct" DOUBLE PRECISION,
ADD COLUMN     "boneMassKg" DOUBLE PRECISION,
ADD COLUMN     "visceralFatRating" INTEGER,
ADD COLUMN     "muscleQuality" INTEGER,
ADD COLUMN     "bmrKcal" INTEGER,
ADD COLUMN     "metabolicAge" INTEGER,
ADD COLUMN     "bmi" DOUBLE PRECISION,
ADD COLUMN     "segmental" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "measuredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReferenceRange" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "sex" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "editedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenceRange_orgId_idx" ON "ReferenceRange"("orgId");

-- CreateIndex
CREATE INDEX "ReferenceRange_orgId_metric_idx" ON "ReferenceRange"("orgId", "metric");

-- AddForeignKey
ALTER TABLE "ReferenceRange" ADD CONSTRAINT "ReferenceRange_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceRange" ADD CONSTRAINT "ReferenceRange_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
