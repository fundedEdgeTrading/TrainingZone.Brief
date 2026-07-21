-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('SIN_CONTACTAR', 'SEGUIMIENTO', 'CON_FECHA_VALORACION', 'CERRADO', 'NO_CERRADO');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('TASK', 'ALERT', 'INFO');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SUGERIDA', 'PENDIENTE_DIRECCION', 'APROBADA', 'RECHAZADA', 'COMUNICADA');

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('GROUP', 'PERSONAL_TRAINING', 'ONLINE');

-- CreateEnum
CREATE TYPE "WorkoutProgramStatus" AS ENUM ('DRAFT', 'PENDING_TRAINER', 'ACTIVE', 'COMPLETED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'STRIPE';

-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'ONLINE';

-- DropForeignKey
ALTER TABLE "HealthRecord" DROP CONSTRAINT "HealthRecord_memberId_fkey";

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "directedByUserId" TEXT,
ADD COLUMN     "selfBookable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HealthRecord" ADD COLUMN     "leadId" TEXT,
ALTER COLUMN "memberId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "originLeadId" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "trainerId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "soldByUserId" TEXT,
ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateTable
CREATE TABLE "ClientGoal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT,
    "label" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChannel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoCloseReason" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoCloseReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "postalCode" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "hasTrainedBefore" BOOLEAN NOT NULL,
    "hasTrainedNote" TEXT,
    "channel" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'SIN_CONTACTAR',
    "ownerUserId" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noCloseReason" TEXT,
    "convertedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeClockEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "clockIn" TEXT NOT NULL,
    "clockOut" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProposal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizedOffer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "proposedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "signals" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SUGERIDA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalizedOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerRating" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "score" INTEGER,
    "strengths" TEXT,
    "improvements" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckinScheduleConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serviceKind" "ServiceKind" NOT NULL,
    "goalCheckinDays" INTEGER NOT NULL DEFAULT 30,
    "trainerRatingDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutProgram" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdByAI" BOOLEAN NOT NULL DEFAULT true,
    "confirmedByUserId" TEXT,
    "status" "WorkoutProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfAssessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "structured" JSONB,
    "aiRecommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelfAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderKind" TEXT NOT NULL,
    "senderUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientGoal_orgId_idx" ON "ClientGoal"("orgId");

-- CreateIndex
CREATE INDEX "ClientGoal_memberId_idx" ON "ClientGoal"("memberId");

-- CreateIndex
CREATE INDEX "LeadChannel_orgId_idx" ON "LeadChannel"("orgId");

-- CreateIndex
CREATE INDEX "NoCloseReason_orgId_idx" ON "NoCloseReason"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedMemberId_key" ON "Lead"("convertedMemberId");

-- CreateIndex
CREATE INDEX "Lead_orgId_idx" ON "Lead"("orgId");

-- CreateIndex
CREATE INDEX "Lead_centerId_idx" ON "Lead"("centerId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "LeadNote_orgId_idx" ON "LeadNote"("orgId");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_idx" ON "LeadNote"("leadId");

-- CreateIndex
CREATE INDEX "Notification_orgId_idx" ON "Notification"("orgId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_idx" ON "Notification"("recipientUserId");

-- CreateIndex
CREATE INDEX "Notification_resolvedAt_idx" ON "Notification"("resolvedAt");

-- CreateIndex
CREATE INDEX "TimeClockEntry_orgId_idx" ON "TimeClockEntry"("orgId");

-- CreateIndex
CREATE INDEX "TimeClockEntry_userId_idx" ON "TimeClockEntry"("userId");

-- CreateIndex
CREATE INDEX "StaffProposal_orgId_idx" ON "StaffProposal"("orgId");

-- CreateIndex
CREATE INDEX "PersonalizedOffer_orgId_idx" ON "PersonalizedOffer"("orgId");

-- CreateIndex
CREATE INDEX "PersonalizedOffer_memberId_idx" ON "PersonalizedOffer"("memberId");

-- CreateIndex
CREATE INDEX "TrainerRating_orgId_idx" ON "TrainerRating"("orgId");

-- CreateIndex
CREATE INDEX "TrainerRating_trainerUserId_idx" ON "TrainerRating"("trainerUserId");

-- CreateIndex
CREATE INDEX "CheckinScheduleConfig_orgId_idx" ON "CheckinScheduleConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckinScheduleConfig_orgId_serviceKind_key" ON "CheckinScheduleConfig"("orgId", "serviceKind");

-- CreateIndex
CREATE INDEX "WorkoutProgram_orgId_idx" ON "WorkoutProgram"("orgId");

-- CreateIndex
CREATE INDEX "WorkoutProgram_memberId_idx" ON "WorkoutProgram"("memberId");

-- CreateIndex
CREATE INDEX "SelfAssessment_orgId_idx" ON "SelfAssessment"("orgId");

-- CreateIndex
CREATE INDEX "SelfAssessment_memberId_idx" ON "SelfAssessment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_memberId_key" ON "Conversation"("memberId");

-- CreateIndex
CREATE INDEX "Conversation_orgId_idx" ON "Conversation"("orgId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "HealthRecord_leadId_idx" ON "HealthRecord"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_originLeadId_key" ON "Member"("originLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_stripeCustomerId_key" ON "Member"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Member_trainerId_idx" ON "Member"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_originLeadId_fkey" FOREIGN KEY ("originLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGoal" ADD CONSTRAINT "ClientGoal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGoal" ADD CONSTRAINT "ClientGoal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_directedByUserId_fkey" FOREIGN KEY ("directedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_soldByUserId_fkey" FOREIGN KEY ("soldByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChannel" ADD CONSTRAINT "LeadChannel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoCloseReason" ADD CONSTRAINT "NoCloseReason_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedMemberId_fkey" FOREIGN KEY ("convertedMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProposal" ADD CONSTRAINT "StaffProposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProposal" ADD CONSTRAINT "StaffProposal_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedOffer" ADD CONSTRAINT "PersonalizedOffer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedOffer" ADD CONSTRAINT "PersonalizedOffer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedOffer" ADD CONSTRAINT "PersonalizedOffer_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedOffer" ADD CONSTRAINT "PersonalizedOffer_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckinScheduleConfig" ADD CONSTRAINT "CheckinScheduleConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutProgram" ADD CONSTRAINT "WorkoutProgram_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutProgram" ADD CONSTRAINT "WorkoutProgram_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutProgram" ADD CONSTRAINT "WorkoutProgram_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfAssessment" ADD CONSTRAINT "SelfAssessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfAssessment" ADD CONSTRAINT "SelfAssessment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

