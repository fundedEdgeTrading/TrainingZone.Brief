-- Costuras del servidor · Lote 2, ola 1 (S1) · docs/hu/E4.md, E1.md, E5.md
--
-- TODO el cambio de esquema del lote en UNA migración, para que las siete
-- pistas que arrancan después no se pisen editando `prisma/schema.prisma` a la
-- vez. A partir de aquí el esquema vuelve a quedar CONGELADO: quien lo
-- necesite, lo pide al integrador.
--
--   HU-ST-12  SepaMandate (referencia, últimos 4 del IBAN, estado) +
--             SubscriptionStatus.PENDING_CONFIRMATION (primer cobro asíncrono)
--   HU-ST-18  Organization.dunningGraceDays (D-S5: 7 por defecto, 0-60 con
--             CHECK) + Member.delinquentSince
--   HU-ST-20  Payment: refundedAmountCents, refundedByUserId, stripeCreditNoteId
--   HU-ST-21  PaymentDispute (importe, evidence_details.due_by, resultado)
--   HU-ST-23  Payment: bruto/comisión/neto + balance transaction + StripePayout
--             (con arrival_date) y los cobros que lo componen
--   HU-ST-27  StripeCoupon (espejo de la cuenta conectada) + Payment.couponId y
--             discountAmountCents
--   E1-10     AccessAttempt: contador de intentos fallidos por email y por IP.
--             Tabla de ESTADO aparte — `AuditLog` es append-only (trigger
--             `auditlog_append_only`, E10-14) y no puede llevar un contador.
--   E5-15     AccountDeletionRequest (solicitud, plazo del art. 12.3 RGPD y
--             resolución)
--
-- Invariantes del trimestre que esta migración NO toca, a propósito:
--   · `sessionsRemaining` no se mueve aquí: sigue exigiendo asiento en
--     `SessionLedger`.
--   · El trigger `auditlog_append_only` se queda como está. No se afloja.
--   · Ningún `Price` de Stripe se borra: `StripeCoupon` sigue el mismo patrón y
--     se archiva con `active = false`.

-- CreateEnum
CREATE TYPE "SepaMandateStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'PAID', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AccessAttemptScope" AS ENUM ('EMAIL', 'IP');

-- CreateEnum
CREATE TYPE "AccessAttemptPurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountDeletionSource" AS ENUM ('MOBILE_APP', 'WEB_PORTAL');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PENDING_CONFIRMATION';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "delinquentSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dunningGraceDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountAmountCents" INTEGER,
ADD COLUMN     "feeAmountCents" INTEGER,
ADD COLUMN     "grossAmountCents" INTEGER,
ADD COLUMN     "netAmountCents" INTEGER,
ADD COLUMN     "payoutId" TEXT,
ADD COLUMN     "refundedAmountCents" INTEGER,
ADD COLUMN     "refundedByUserId" TEXT,
ADD COLUMN     "stripeBalanceTransactionId" TEXT,
ADD COLUMN     "stripeCreditNoteId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "sepaMandateId" TEXT;

-- CreateTable
CREATE TABLE "SepaMandate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "stripeMandateId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ibanLast4" TEXT NOT NULL,
    "status" "SepaMandateStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SepaMandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentDispute" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'NEEDS_RESPONSE',
    "evidenceDueBy" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripePayout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "stripePayoutId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "arrivalDate" TIMESTAMP(3),
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeCoupon" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "stripeCouponId" TEXT NOT NULL,
    "stripePromotionCodeId" TEXT,
    "code" TEXT,
    "name" TEXT,
    "percentOff" DOUBLE PRECISION,
    "amountOffCents" INTEGER,
    "currency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "redeemBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAttempt" (
    "id" TEXT NOT NULL,
    "purpose" "AccessAttemptPurpose" NOT NULL,
    "scope" "AccessAttemptScope" NOT NULL,
    "key" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "AccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" "AccountDeletionSource" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNotes" TEXT,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SepaMandate_orgId_idx" ON "SepaMandate"("orgId");

-- CreateIndex
CREATE INDEX "SepaMandate_memberId_idx" ON "SepaMandate"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SepaMandate_orgId_stripeMandateId_key" ON "SepaMandate"("orgId", "stripeMandateId");

-- CreateIndex
CREATE INDEX "PaymentDispute_orgId_idx" ON "PaymentDispute"("orgId");

-- CreateIndex
CREATE INDEX "PaymentDispute_paymentId_idx" ON "PaymentDispute"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentDispute_evidenceDueBy_idx" ON "PaymentDispute"("evidenceDueBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentDispute_orgId_stripeDisputeId_key" ON "PaymentDispute"("orgId", "stripeDisputeId");

-- CreateIndex
CREATE INDEX "StripePayout_orgId_idx" ON "StripePayout"("orgId");

-- CreateIndex
CREATE INDEX "StripePayout_arrivalDate_idx" ON "StripePayout"("arrivalDate");

-- CreateIndex
CREATE UNIQUE INDEX "StripePayout_orgId_stripePayoutId_key" ON "StripePayout"("orgId", "stripePayoutId");

-- CreateIndex
CREATE INDEX "StripeCoupon_orgId_idx" ON "StripeCoupon"("orgId");

-- CreateIndex
CREATE INDEX "StripeCoupon_orgId_code_idx" ON "StripeCoupon"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCoupon_orgId_stripeCouponId_key" ON "StripeCoupon"("orgId", "stripeCouponId");

-- CreateIndex
CREATE INDEX "AccessAttempt_blockedUntil_idx" ON "AccessAttempt"("blockedUntil");

-- CreateIndex
CREATE INDEX "AccessAttempt_windowStartedAt_idx" ON "AccessAttempt"("windowStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessAttempt_purpose_scope_key_key" ON "AccessAttempt"("purpose", "scope", "key");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_orgId_idx" ON "AccountDeletionRequest"("orgId");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_memberId_idx" ON "AccountDeletionRequest"("memberId");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_status_dueAt_idx" ON "AccountDeletionRequest"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Payment_payoutId_idx" ON "Payment"("payoutId");

-- CreateIndex
CREATE INDEX "Payment_couponId_idx" ON "Payment"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orgId_stripeBalanceTransactionId_key" ON "Payment"("orgId", "stripeBalanceTransactionId");

-- CreateIndex
CREATE INDEX "Subscription_sepaMandateId_idx" ON "Subscription"("sepaMandateId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_sepaMandateId_fkey" FOREIGN KEY ("sepaMandateId") REFERENCES "SepaMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundedByUserId_fkey" FOREIGN KEY ("refundedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "StripePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "StripeCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SepaMandate" ADD CONSTRAINT "SepaMandate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SepaMandate" ADD CONSTRAINT "SepaMandate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePayout" ADD CONSTRAINT "StripePayout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeCoupon" ADD CONSTRAINT "StripeCoupon_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- HU-ST-18 · El rango del periodo de gracia se garantiza en la BASE DE DATOS,
-- no solo en el formulario. `Member.state = DELINQUENT` corta el acceso a
-- reservas al agotarse la ventana: un valor negativo dejaba al socio fuera sin
-- gracia ninguna, y uno absurdamente alto convertía la morosidad en papel
-- mojado. 0 es válido y significa "corte inmediato"; 60 es el techo (D-S5).
-- ---------------------------------------------------------------------------
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_dunningGraceDays_range"
  CHECK ("dunningGraceDays" >= 0 AND "dunningGraceDays" <= 60);

-- ---------------------------------------------------------------------------
-- E5-15 · Un socio no puede tener DOS solicitudes de borrado abiertas a la vez:
-- serían dos plazos del art. 12.3 corriendo en paralelo sobre lo mismo, y el
-- acuse que se le debe dejaría de ser único. Las ya resueltas sí se acumulan —
-- son el histórico—, así que el índice es PARCIAL sobre las pendientes.
--
-- Índice parcial: Prisma no lo expresa en el esquema (igual que el trigger
-- append-only de E10-14), así que vive aquí y solo aquí. No lo borres al
-- regenerar.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "AccountDeletionRequest_one_pending_per_member"
  ON "AccountDeletionRequest" ("memberId")
  WHERE "status" = 'PENDING';
