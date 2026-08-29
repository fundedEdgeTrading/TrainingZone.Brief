-- CreateEnum
CREATE TYPE "AssessmentQuestionType" AS ENUM ('TEXT', 'NUMBER', 'SCALE_1_5');

-- CreateEnum
CREATE TYPE "AssessmentQuestionScope" AS ENUM ('ALL', 'INITIAL', 'REVIEW');

-- AlterEnum
ALTER TYPE "AssessmentKind" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "milestoneKey" TEXT;

-- CreateTable
CREATE TABLE "AssessmentMilestone" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionToggle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestionToggle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentCustomQuestion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "AssessmentQuestionType" NOT NULL,
    "scope" "AssessmentQuestionScope" NOT NULL DEFAULT 'ALL',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentCustomQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentMilestone_orgId_idx" ON "AssessmentMilestone"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentMilestone_orgId_key_key" ON "AssessmentMilestone"("orgId", "key");

-- CreateIndex
CREATE INDEX "AssessmentQuestionToggle_orgId_idx" ON "AssessmentQuestionToggle"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionToggle_orgId_questionKey_key" ON "AssessmentQuestionToggle"("orgId", "questionKey");

-- CreateIndex
CREATE INDEX "AssessmentCustomQuestion_orgId_idx" ON "AssessmentCustomQuestion"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCustomQuestion_orgId_key_key" ON "AssessmentCustomQuestion"("orgId", "key");

-- AddForeignKey
ALTER TABLE "AssessmentMilestone" ADD CONSTRAINT "AssessmentMilestone_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionToggle" ADD CONSTRAINT "AssessmentQuestionToggle_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCustomQuestion" ADD CONSTRAINT "AssessmentCustomQuestion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
