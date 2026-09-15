-- Costuras del lote 3 · Ola 0 (S2) · docs/hu/E14.md
--
-- TODO el cambio de esquema del lote en UNA migración, para que las nueve
-- pistas que arrancan después no se pisen editando `prisma/schema.prisma` a la
-- vez. A partir de aquí el esquema vuelve a quedar CONGELADO: quien lo
-- necesite, lo pide al integrador.
--
--   M4  Member.frozenAt / freezeReasonId / cancelReasonId + los catálogos
--       FreezeReason y CancelReason (patrón LeadChannel/NoCloseReason, pero con
--       clave ajena en vez de texto copiado: ver el comentario del modelo).
--       El enum MemberState NO se toca — los cuatro tipos de persona ya estaban
--       ahí y fusionarlos rompería HU-ST-14.
--   E1  MemberTagDefinition + MemberTag (lo que tiene ahora) + MemberTagEvent
--       (la traza de cada puesta y cada RETIRADA). La distinción automática /
--       manual es un enum, no un convenio de nombres.
--   E2  Flow, FlowCondition, FlowStep, FlowEnrollment (LA COLA) y FlowEmailLog
--       (EL REGISTRO DE ENVÍOS), más Organization.flowsPausedAt (pausa global)
--       y Organization.flowsTestEmail (modo borrador).
--   R1  ReferralCode, ReferralReward y ReferralProgramConfig, más
--       Lead.referredByMemberId / referralCodeId. El embudo NO se duplica y el
--       estado del referido NO se guarda: se deriva del lead.
--   M5  MemberFormInvite. Es lo único fuera del inventario del encargo y va con
--       su justificación escrita en el modelo: `Invitation.memberId` es @unique
--       y no admite leads, así que no servía sin relajar una garantía del alta
--       de cuentas.
--   M3  Organization.autoTaskWeeklyCapPerUser, el tope de tareas automáticas
--       por persona y semana. La columna la abre esta migración porque es la
--       única ventana del lote; el número definitivo lo decide M3.
--
-- LAS CINCO REGLAS DE SEGURIDAD DE LOS FLUJOS SON ESQUEMA, NO CÓDIGO:
--   1. Máx. 1 email por socio y semana entre TODOS los flujos → índice
--      "FlowEmailLog_memberId_sentAt_idx", y la fila se inserta en la misma
--      transacción que el envío, que es lo que reserva el hueco.
--   2. Nada entre 22:00 y 8:00 → FlowEnrollment.nextRunAt guarda CUÁNDO LE
--      TOCA, no "mándalo ya", y la hora es la del centro (Center.timezone, que
--      ya existe).
--   3. No repetir el mismo flujo hasta 90 días después → índice
--      "FlowEnrollment_memberId_flowId_enrolledAt_idx".
--   4. Pausa global → Organization.flowsPausedAt.
--   5. Modo borrador → FlowStatus.DRAFT + Organization.flowsTestEmail +
--      FlowEmailLog.testMode.
--   Los topes (1 por semana, 90 días) NO son columnas configurables a
--   propósito: una regla de seguridad que se afloja desde una pantalla deja de
--   ser una regla de seguridad.
--
-- Invariantes del trimestre que esta migración NO toca, a propósito:
--   · `sessionsRemaining` no se mueve aquí: sigue exigiendo asiento en
--     `SessionLedger`. La recompensa en sesiones de un referido se LIBERA como
--     tarea a administración; quien la aplique pasa por el camino de siempre.
--   · El trigger `auditlog_append_only` (E10-14) se queda como está. No se
--     afloja.
--   · Ningún `Price` ni cupón de Stripe se borra. Nada de aquí habla con
--     Stripe: la recompensa no toca recibos.
--   · Todo lo que es de un centro lleva `centerId` y se puede acotar con
--     `isCenterInScope`. Lo que es de un socio se acota por el socio.

-- CreateEnum
CREATE TYPE "MemberTagKind" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "MemberTagAction" AS ENUM ('ADDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "FlowTriggerType" AS ENUM ('MEMBER_JOINED', 'FIRST_SESSION_DONE', 'SESSIONS_ABSENCE', 'PACK_BALANCE_BELOW', 'PAYMENT_FAILED', 'MEMBER_STATE_CHANGED', 'DATE_ANNIVERSARY', 'DATE_BIRTHDAY', 'FORM_ANSWERED', 'RATING_BELOW');

-- CreateEnum
CREATE TYPE "FlowConditionType" AS ENUM ('CENTER', 'PLAN_TYPE', 'TAG', 'TENURE', 'TRAINER');

-- CreateEnum
CREATE TYPE "FlowActionType" AS ENUM ('SEND_EMAIL', 'SEND_FORM', 'ADD_TAG', 'REMOVE_TAG', 'CREATE_TASK', 'CHANGE_STATE', 'NOTIFY_DIRECTOR');

-- CreateEnum
CREATE TYPE "FlowBranch" AS ENUM ('MAIN', 'ON_CLICK', 'ON_REPLY', 'ON_NO_REPLY');

-- CreateEnum
CREATE TYPE "FlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "FlowGoalKind" AS ENUM ('TRAINED_AGAIN', 'RENEWED', 'FORM_COMPLETED', 'PAYMENT_RECOVERED', 'REFERRAL_SENT');

-- CreateEnum
CREATE TYPE "FlowEnrollmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReferralRewardKind" AS ENUM ('FIXED_AMOUNT', 'FREE_SESSIONS');

-- CreateEnum
CREATE TYPE "ReferralRewardBeneficiary" AS ENUM ('REFERRER', 'REFERRED');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING_VALIDATION', 'VALIDATED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referralCodeId" TEXT,
ADD COLUMN     "referredByMemberId" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "cancelReasonId" TEXT,
ADD COLUMN     "freezeReasonId" TEXT,
ADD COLUMN     "frozenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoTaskWeeklyCapPerUser" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "flowsPausedAt" TIMESTAMP(3),
ADD COLUMN     "flowsTestEmail" TEXT;

-- CreateTable
CREATE TABLE "FreezeReason" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreezeReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelReason" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancelReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTagDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "MemberTagKind" NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberTagDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT,
    "ruleKey" TEXT,

    CONSTRAINT "MemberTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTagEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "action" "MemberTagAction" NOT NULL,
    "ruleKey" TEXT,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberTagEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FlowStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "FlowTriggerType" NOT NULL,
    "triggerConfig" JSONB,
    "goalKind" "FlowGoalKind",
    "seedKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowCondition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "stepId" TEXT,
    "type" "FlowConditionType" NOT NULL,
    "config" JSONB NOT NULL,
    "negated" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FlowCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowStep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "branch" "FlowBranch" NOT NULL DEFAULT 'MAIN',
    "position" INTEGER NOT NULL,
    "waitDays" INTEGER NOT NULL DEFAULT 0,
    "actionType" "FlowActionType" NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "branchAfterDays" INTEGER,

    CONSTRAINT "FlowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowEnrollment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "FlowEnrollmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "currentBranch" "FlowBranch" NOT NULL DEFAULT 'MAIN',
    "currentStepPosition" INTEGER NOT NULL DEFAULT -1,
    "nextRunAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "goalMetAt" TIMESTAMP(3),

    CONSTRAINT "FlowEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowEmailLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "stepId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT NOT NULL,
    "templateKey" TEXT,
    "toEmail" TEXT NOT NULL,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),

    CONSTRAINT "FlowEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "referrerMemberId" TEXT NOT NULL,
    "beneficiaryMemberId" TEXT,
    "beneficiary" "ReferralRewardBeneficiary" NOT NULL,
    "kind" "ReferralRewardKind" NOT NULL,
    "amountCents" INTEGER,
    "sessions" INTEGER,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "paidByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralProgramConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "referrerKind" "ReferralRewardKind" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "referrerAmountCents" INTEGER,
    "referrerSessions" INTEGER,
    "referredKind" "ReferralRewardKind",
    "referredAmountCents" INTEGER,
    "referredSessions" INTEGER,
    "exMemberCooldownDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralProgramConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFormInvite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "memberId" TEXT,
    "leadId" TEXT,
    "kind" "AssessmentKind" NOT NULL DEFAULT 'INITIAL',
    "milestoneKey" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentByUserId" TEXT,
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assessmentId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberFormInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreezeReason_orgId_idx" ON "FreezeReason"("orgId");

-- CreateIndex
CREATE INDEX "CancelReason_orgId_idx" ON "CancelReason"("orgId");

-- CreateIndex
CREATE INDEX "MemberTagDefinition_orgId_idx" ON "MemberTagDefinition"("orgId");

-- CreateIndex
CREATE INDEX "MemberTagDefinition_orgId_kind_active_idx" ON "MemberTagDefinition"("orgId", "kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTagDefinition_orgId_key_key" ON "MemberTagDefinition"("orgId", "key");

-- CreateIndex
CREATE INDEX "MemberTag_orgId_idx" ON "MemberTag"("orgId");

-- CreateIndex
CREATE INDEX "MemberTag_memberId_idx" ON "MemberTag"("memberId");

-- CreateIndex
CREATE INDEX "MemberTag_tagDefinitionId_idx" ON "MemberTag"("tagDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTag_memberId_tagDefinitionId_key" ON "MemberTag"("memberId", "tagDefinitionId");

-- CreateIndex
CREATE INDEX "MemberTagEvent_orgId_idx" ON "MemberTagEvent"("orgId");

-- CreateIndex
CREATE INDEX "MemberTagEvent_memberId_createdAt_idx" ON "MemberTagEvent"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberTagEvent_tagDefinitionId_createdAt_idx" ON "MemberTagEvent"("tagDefinitionId", "createdAt");

-- CreateIndex
CREATE INDEX "Flow_orgId_idx" ON "Flow"("orgId");

-- CreateIndex
CREATE INDEX "Flow_centerId_idx" ON "Flow"("centerId");

-- CreateIndex
CREATE INDEX "Flow_orgId_status_idx" ON "Flow"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Flow_orgId_seedKey_key" ON "Flow"("orgId", "seedKey");

-- CreateIndex
CREATE INDEX "FlowCondition_orgId_idx" ON "FlowCondition"("orgId");

-- CreateIndex
CREATE INDEX "FlowCondition_flowId_idx" ON "FlowCondition"("flowId");

-- CreateIndex
CREATE INDEX "FlowCondition_stepId_idx" ON "FlowCondition"("stepId");

-- CreateIndex
CREATE INDEX "FlowStep_orgId_idx" ON "FlowStep"("orgId");

-- CreateIndex
CREATE INDEX "FlowStep_flowId_idx" ON "FlowStep"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowStep_flowId_branch_position_key" ON "FlowStep"("flowId", "branch", "position");

-- CreateIndex
CREATE INDEX "FlowEnrollment_orgId_idx" ON "FlowEnrollment"("orgId");

-- CreateIndex
CREATE INDEX "FlowEnrollment_centerId_idx" ON "FlowEnrollment"("centerId");

-- CreateIndex
CREATE INDEX "FlowEnrollment_status_nextRunAt_idx" ON "FlowEnrollment"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "FlowEnrollment_memberId_flowId_enrolledAt_idx" ON "FlowEnrollment"("memberId", "flowId", "enrolledAt");

-- CreateIndex
CREATE INDEX "FlowEnrollment_flowId_status_idx" ON "FlowEnrollment"("flowId", "status");

-- CreateIndex
CREATE INDEX "FlowEmailLog_orgId_idx" ON "FlowEmailLog"("orgId");

-- CreateIndex
CREATE INDEX "FlowEmailLog_centerId_idx" ON "FlowEmailLog"("centerId");

-- CreateIndex
CREATE INDEX "FlowEmailLog_memberId_sentAt_idx" ON "FlowEmailLog"("memberId", "sentAt");

-- CreateIndex
CREATE INDEX "FlowEmailLog_flowId_sentAt_idx" ON "FlowEmailLog"("flowId", "sentAt");

-- CreateIndex
CREATE INDEX "FlowEmailLog_enrollmentId_idx" ON "FlowEmailLog"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowEmailLog_orgId_idempotencyKey_key" ON "FlowEmailLog"("orgId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_memberId_key" ON "ReferralCode"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_orgId_idx" ON "ReferralCode"("orgId");

-- CreateIndex
CREATE INDEX "ReferralCode_centerId_idx" ON "ReferralCode"("centerId");

-- CreateIndex
CREATE INDEX "ReferralReward_orgId_idx" ON "ReferralReward"("orgId");

-- CreateIndex
CREATE INDEX "ReferralReward_centerId_idx" ON "ReferralReward"("centerId");

-- CreateIndex
CREATE INDEX "ReferralReward_orgId_status_idx" ON "ReferralReward"("orgId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_referrerMemberId_status_idx" ON "ReferralReward"("referrerMemberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_leadId_beneficiary_key" ON "ReferralReward"("leadId", "beneficiary");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProgramConfig_centerId_key" ON "ReferralProgramConfig"("centerId");

-- CreateIndex
CREATE INDEX "ReferralProgramConfig_orgId_idx" ON "ReferralProgramConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFormInvite_token_key" ON "MemberFormInvite"("token");

-- CreateIndex
CREATE INDEX "MemberFormInvite_orgId_idx" ON "MemberFormInvite"("orgId");

-- CreateIndex
CREATE INDEX "MemberFormInvite_centerId_idx" ON "MemberFormInvite"("centerId");

-- CreateIndex
CREATE INDEX "MemberFormInvite_memberId_sentAt_idx" ON "MemberFormInvite"("memberId", "sentAt");

-- CreateIndex
CREATE INDEX "MemberFormInvite_leadId_sentAt_idx" ON "MemberFormInvite"("leadId", "sentAt");

-- CreateIndex
CREATE INDEX "MemberFormInvite_expiresAt_idx" ON "MemberFormInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "Lead_referredByMemberId_status_idx" ON "Lead"("referredByMemberId", "status");

-- CreateIndex
CREATE INDEX "Member_freezeReasonId_idx" ON "Member"("freezeReasonId");

-- CreateIndex
CREATE INDEX "Member_cancelReasonId_idx" ON "Member"("cancelReasonId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_freezeReasonId_fkey" FOREIGN KEY ("freezeReasonId") REFERENCES "FreezeReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_cancelReasonId_fkey" FOREIGN KEY ("cancelReasonId") REFERENCES "CancelReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referredByMemberId_fkey" FOREIGN KEY ("referredByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreezeReason" ADD CONSTRAINT "FreezeReason_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelReason" ADD CONSTRAINT "CancelReason_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTagDefinition" ADD CONSTRAINT "MemberTagDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTag" ADD CONSTRAINT "MemberTag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTag" ADD CONSTRAINT "MemberTag_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTag" ADD CONSTRAINT "MemberTag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "MemberTagDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTag" ADD CONSTRAINT "MemberTag_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTagEvent" ADD CONSTRAINT "MemberTagEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTagEvent" ADD CONSTRAINT "MemberTagEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTagEvent" ADD CONSTRAINT "MemberTagEvent_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "MemberTagDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTagEvent" ADD CONSTRAINT "MemberTagEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowCondition" ADD CONSTRAINT "FlowCondition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowCondition" ADD CONSTRAINT "FlowCondition_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowCondition" ADD CONSTRAINT "FlowCondition_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "FlowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowStep" ADD CONSTRAINT "FlowStep_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowStep" ADD CONSTRAINT "FlowStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEnrollment" ADD CONSTRAINT "FlowEnrollment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEnrollment" ADD CONSTRAINT "FlowEnrollment_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEnrollment" ADD CONSTRAINT "FlowEnrollment_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEnrollment" ADD CONSTRAINT "FlowEnrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEmailLog" ADD CONSTRAINT "FlowEmailLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEmailLog" ADD CONSTRAINT "FlowEmailLog_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEmailLog" ADD CONSTRAINT "FlowEmailLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEmailLog" ADD CONSTRAINT "FlowEmailLog_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEmailLog" ADD CONSTRAINT "FlowEmailLog_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "FlowEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowEmailLog" ADD CONSTRAINT "FlowEmailLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "FlowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerMemberId_fkey" FOREIGN KEY ("referrerMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_beneficiaryMemberId_fkey" FOREIGN KEY ("beneficiaryMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramConfig" ADD CONSTRAINT "ReferralProgramConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramConfig" ADD CONSTRAINT "ReferralProgramConfig_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFormInvite" ADD CONSTRAINT "MemberFormInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFormInvite" ADD CONSTRAINT "MemberFormInvite_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFormInvite" ADD CONSTRAINT "MemberFormInvite_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFormInvite" ADD CONSTRAINT "MemberFormInvite_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFormInvite" ADD CONSTRAINT "MemberFormInvite_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Garantías que no caben en `schema.prisma` y que por eso se escriben aquí.
-- Mismo criterio que el CHECK de `Organization.dunningGraceDays` (HU-ST-18): lo
-- que sostiene una invariante se comprueba en la base de datos, no solo en el
-- formulario que hoy escribe la fila.
-- ---------------------------------------------------------------------------

-- M3 · Un tope de 0 apagaría el motor de tareas entero en silencio, y uno
-- negativo es un dato imposible. El techo de 200 es el "no puede ser lo que
-- quieras": por encima de eso no hay tope, hay una columna sin sentido.
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_autoTaskWeeklyCapPerUser_range"
  CHECK ("autoTaskWeeklyCapPerUser" BETWEEN 1 AND 200);

-- R1 · La ventana del excliente (antifraude 1) reparte dinero. Un valor
-- negativo la invertiría; sin techo, un cero mal puesto abriría el programa a
-- cualquier baja de ayer.
ALTER TABLE "ReferralProgramConfig"
  ADD CONSTRAINT "ReferralProgramConfig_exMemberCooldownDays_range"
  CHECK ("exMemberCooldownDays" BETWEEN 0 AND 1095);

-- R1 · La recompensa es de importe fijo O de sesiones, nunca de las dos cosas y
-- nunca de ninguna: una fila sin importe ni sesiones es una tarea a
-- administración que no dice qué hay que pagar.
ALTER TABLE "ReferralReward"
  ADD CONSTRAINT "ReferralReward_amount_xor_sessions"
  CHECK (
    ("kind" = 'FIXED_AMOUNT'  AND "amountCents" IS NOT NULL AND "amountCents" > 0 AND "sessions" IS NULL)
    OR
    ("kind" = 'FREE_SESSIONS' AND "sessions"    IS NOT NULL AND "sessions"    > 0 AND "amountCents" IS NULL)
  );

-- M5 · Un envío de formulario es para un socio O para un lead. Sin esto, una
-- fila con los dos nulos sería un enlace que no lleva a ninguna ficha, y una
-- con los dos rellenos, una respuesta que cae en dos sitios.
ALTER TABLE "MemberFormInvite"
  ADD CONSTRAINT "MemberFormInvite_member_xor_lead"
  CHECK (("memberId" IS NULL) <> ("leadId" IS NULL));

-- E2 · Una espera negativa manda el correo antes de que dispare el flujo.
ALTER TABLE "FlowStep"
  ADD CONSTRAINT "FlowStep_waitDays_nonnegative"
  CHECK ("waitDays" >= 0 AND ("branchAfterDays" IS NULL OR "branchAfterDays" > 0));

-- E2 · `branchAfterDays` solo tiene sentido en la rama ON_NO_REPLY: es los días
-- que se espera respuesta antes de darla por no recibida.
ALTER TABLE "FlowStep"
  ADD CONSTRAINT "FlowStep_branchAfterDays_only_on_no_reply"
  CHECK ("branchAfterDays" IS NULL OR "branch" = 'ON_NO_REPLY');
