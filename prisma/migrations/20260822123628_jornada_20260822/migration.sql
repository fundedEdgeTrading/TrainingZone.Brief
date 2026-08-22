-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('INITIAL', 'M1', 'M3', 'M6', 'M9', 'Y1');

-- CreateEnum
CREATE TYPE "MesocycleStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TRAINER_ADMIN';

-- AlterTable
ALTER TABLE "Center" ADD COLUMN     "defaultGroupCapacity" INTEGER;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "consentAI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentAIAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "AssessmentKind" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL,
    "filledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMetric" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesocycle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "MesocycleStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "safetyCriteria" JSONB NOT NULL,
    "weeklyLayout" JSONB NOT NULL,
    "milestones" JSONB NOT NULL,
    "aiConversation" JSONB,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mesocycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocyclePhase" (
    "id" TEXT NOT NULL,
    "mesocycleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "weekFrom" INTEGER NOT NULL,
    "weekTo" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "MesocyclePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocycleDay" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "warmup" JSONB NOT NULL,

    CONSTRAINT "MesocycleDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocycleBlock" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,

    CONSTRAINT "MesocycleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocycleExercise" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "load" TEXT,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "MesocycleExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_orgId_idx" ON "Assessment"("orgId");

-- CreateIndex
CREATE INDEX "Assessment_memberId_kind_idx" ON "Assessment"("memberId", "kind");

-- CreateIndex
CREATE INDEX "PerformanceMetric_orgId_idx" ON "PerformanceMetric"("orgId");

-- CreateIndex
CREATE INDEX "PerformanceMetric_memberId_key_recordedAt_idx" ON "PerformanceMetric"("memberId", "key", "recordedAt");

-- CreateIndex
CREATE INDEX "Mesocycle_orgId_idx" ON "Mesocycle"("orgId");

-- CreateIndex
CREATE INDEX "Mesocycle_memberId_idx" ON "Mesocycle"("memberId");

-- CreateIndex
CREATE INDEX "MesocyclePhase_mesocycleId_idx" ON "MesocyclePhase"("mesocycleId");

-- CreateIndex
CREATE INDEX "MesocycleDay_phaseId_idx" ON "MesocycleDay"("phaseId");

-- CreateIndex
CREATE INDEX "MesocycleBlock_dayId_idx" ON "MesocycleBlock"("dayId");

-- CreateIndex
CREATE INDEX "MesocycleExercise_blockId_idx" ON "MesocycleExercise"("blockId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_filledByUserId_fkey" FOREIGN KEY ("filledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetric" ADD CONSTRAINT "PerformanceMetric_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetric" ADD CONSTRAINT "PerformanceMetric_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesocyclePhase" ADD CONSTRAINT "MesocyclePhase_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesocycleDay" ADD CONSTRAINT "MesocycleDay_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "MesocyclePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesocycleBlock" ADD CONSTRAINT "MesocycleBlock_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "MesocycleDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesocycleExercise" ADD CONSTRAINT "MesocycleExercise_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "MesocycleBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
