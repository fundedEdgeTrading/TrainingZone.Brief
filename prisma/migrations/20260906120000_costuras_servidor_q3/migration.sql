-- Costuras del servidor · Ola 0 (S0-A) · docs/PLAN_PARALELIZACION_2026-09-06.md §3
--
-- TODO el cambio de esquema del trimestre en UNA migración, para que las nueve
-- pistas que arrancan después no se pisen editando `prisma/schema.prisma` a la
-- vez. A partir de aquí el esquema queda CONGELADO: quien lo necesite, lo pide
-- al integrador.
--
--   E2-15    SessionLedger
--   E3-02    InjuryZone (lista cerrada) + Laterality (campo aparte)
--   E3-12    Mesocycle.startDate · MesocyclePhase.deload
--   E9-05    Center: phone, city, postalCode, neighborhood, description,
--            openingHours, publicPage
--   HU-ST-05 StripeWebhookEvent
--   HU-ST-14 SubscriptionStatus.PAUSED (voluntaria) distinto de FROZEN (impago)
--   E10-12   Edad y consentimiento de tutor
--   E10-08   RetentionPolicy (plazos parametrizables con suelo legal)
--   E10-14   AuditLog append-only: REVOKE UPDATE, DELETE + trigger

-- CreateEnum
CREATE TYPE "InjuryZone" AS ENUM ('CERVICALES', 'HOMBRO', 'CODO', 'MUNECA', 'MANO', 'DORSAL', 'LUMBAR', 'CADERA', 'INGLE', 'ISQUIOSURALES', 'CUADRICEPS', 'RODILLA', 'GEMELO', 'TOBILLO', 'PIE', 'OTRA');

-- CreateEnum
CREATE TYPE "Laterality" AS ENUM ('IZQUIERDA', 'DERECHA', 'BILATERAL', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "SessionLedgerReason" AS ENUM ('PURCHASE', 'BOOKING', 'CANCELLATION', 'NO_SHOW_REFUND', 'MANUAL_ADJUSTMENT', 'EXPIRY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "RetentionCategory" AS ENUM ('CONTRACT_BILLING', 'HEALTH_DATA', 'PROGRESS_PHOTOS', 'AUDIT_LOG', 'UNCONVERTED_LEAD', 'EXPIRED_INVITATION', 'REVOKED_REFRESH_TOKEN', 'PENDING_PAYMENT_ORG');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "AptitudeRule" ADD COLUMN     "side" "Laterality",
ADD COLUMN     "zoneCode" "InjuryZone";

-- AlterTable
ALTER TABLE "Center" ADD COLUMN     "city" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "publicPage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HealthRecord" ADD COLUMN     "side" "Laterality",
ADD COLUMN     "zoneCode" "InjuryZone";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "birthDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "guardianConsentAt" TIMESTAMP(3),
ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "guardianEvidence" TEXT,
ADD COLUMN     "guardianIdDocument" TEXT,
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianPhone" TEXT;

-- AlterTable
ALTER TABLE "Mesocycle" ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MesocyclePhase" ADD COLUMN     "deload" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "allowsMinors" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minimumAgeYears" INTEGER NOT NULL DEFAULT 18;

-- CreateTable
CREATE TABLE "SessionLedger" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "bookingId" TEXT,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "reason" "SessionLedgerReason" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "account" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "category" "RetentionCategory" NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "minimumLegalDays" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionLedger_orgId_idx" ON "SessionLedger"("orgId");

-- CreateIndex
CREATE INDEX "SessionLedger_subscriptionId_createdAt_idx" ON "SessionLedger"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionLedger_bookingId_idx" ON "SessionLedger"("bookingId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "RetentionPolicy_orgId_idx" ON "RetentionPolicy"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_orgId_category_key" ON "RetentionPolicy"("orgId", "category");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SessionLedger" ADD CONSTRAINT "SessionLedger_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLedger" ADD CONSTRAINT "SessionLedger_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLedger" ADD CONSTRAINT "SessionLedger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLedger" ADD CONSTRAINT "SessionLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- E3-02 · Traducción del texto libre a zona + lateralidad
-- ---------------------------------------------------------------------------
-- El campo `zone` se conserva mientras las pantallas migran, pero a partir de
-- aquí la fuente es el par (zoneCode, side). Lo que no encaje en la lista
-- cerrada cae en OTRA: se ve en la ficha y se corrige a mano, que es mejor que
-- inventar una zona nueva por cada forma de escribir "rodilla".

UPDATE "HealthRecord" SET
  "zoneCode" = (CASE
    WHEN zone ILIKE '%cervical%' OR zone ILIKE '%cuello%' THEN 'CERVICALES'
    WHEN zone ILIKE '%hombro%' THEN 'HOMBRO'
    WHEN zone ILIKE '%codo%' THEN 'CODO'
    WHEN zone ILIKE '%muñeca%' OR zone ILIKE '%muneca%' THEN 'MUNECA'
    WHEN zone ILIKE '%mano%' OR zone ILIKE '%dedo%' THEN 'MANO'
    WHEN zone ILIKE '%dorsal%' OR zone ILIKE '%espalda alta%' THEN 'DORSAL'
    WHEN zone ILIKE '%lumbar%' OR zone ILIKE '%espalda baja%' OR zone ILIKE '%sacro%' THEN 'LUMBAR'
    WHEN zone ILIKE '%cadera%' OR zone ILIKE '%glúteo%' OR zone ILIKE '%gluteo%' THEN 'CADERA'
    WHEN zone ILIKE '%ingle%' OR zone ILIKE '%aductor%' THEN 'INGLE'
    WHEN zone ILIKE '%isquio%' OR zone ILIKE '%femoral%' THEN 'ISQUIOSURALES'
    WHEN zone ILIKE '%cuádriceps%' OR zone ILIKE '%cuadriceps%' THEN 'CUADRICEPS'
    WHEN zone ILIKE '%rodilla%' THEN 'RODILLA'
    WHEN zone ILIKE '%gemelo%' OR zone ILIKE '%sóleo%' OR zone ILIKE '%soleo%' OR zone ILIKE '%aquiles%' THEN 'GEMELO'
    WHEN zone ILIKE '%tobillo%' THEN 'TOBILLO'
    WHEN zone ILIKE '%pie%' OR zone ILIKE '%planta%' THEN 'PIE'
    ELSE 'OTRA'
  END)::"InjuryZone",
  "side" = (CASE
    WHEN zone ILIKE '%bilateral%' OR zone ILIKE '%ambos%' OR zone ILIKE '%ambas%' THEN 'BILATERAL'
    WHEN zone ILIKE '%derech%' OR zone ILIKE '%dcha%' OR zone ILIKE '%dcho%' THEN 'DERECHA'
    WHEN zone ILIKE '%izquierd%' OR zone ILIKE '%izq%' THEN 'IZQUIERDA'
    ELSE 'NO_APLICA'
  END)::"Laterality"
WHERE zone IS NOT NULL AND btrim(zone) <> '';

UPDATE "AptitudeRule" SET
  "zoneCode" = (CASE
    WHEN "injuryZone" ILIKE '%cervical%' OR "injuryZone" ILIKE '%cuello%' THEN 'CERVICALES'
    WHEN "injuryZone" ILIKE '%hombro%' THEN 'HOMBRO'
    WHEN "injuryZone" ILIKE '%codo%' THEN 'CODO'
    WHEN "injuryZone" ILIKE '%muñeca%' OR "injuryZone" ILIKE '%muneca%' THEN 'MUNECA'
    WHEN "injuryZone" ILIKE '%mano%' OR "injuryZone" ILIKE '%dedo%' THEN 'MANO'
    WHEN "injuryZone" ILIKE '%dorsal%' OR "injuryZone" ILIKE '%espalda alta%' THEN 'DORSAL'
    WHEN "injuryZone" ILIKE '%lumbar%' OR "injuryZone" ILIKE '%espalda baja%' OR "injuryZone" ILIKE '%sacro%' THEN 'LUMBAR'
    WHEN "injuryZone" ILIKE '%cadera%' OR "injuryZone" ILIKE '%glúteo%' OR "injuryZone" ILIKE '%gluteo%' THEN 'CADERA'
    WHEN "injuryZone" ILIKE '%ingle%' OR "injuryZone" ILIKE '%aductor%' THEN 'INGLE'
    WHEN "injuryZone" ILIKE '%isquio%' OR "injuryZone" ILIKE '%femoral%' THEN 'ISQUIOSURALES'
    WHEN "injuryZone" ILIKE '%cuádriceps%' OR "injuryZone" ILIKE '%cuadriceps%' THEN 'CUADRICEPS'
    WHEN "injuryZone" ILIKE '%rodilla%' THEN 'RODILLA'
    WHEN "injuryZone" ILIKE '%gemelo%' OR "injuryZone" ILIKE '%sóleo%' OR "injuryZone" ILIKE '%soleo%' OR "injuryZone" ILIKE '%aquiles%' THEN 'GEMELO'
    WHEN "injuryZone" ILIKE '%tobillo%' THEN 'TOBILLO'
    WHEN "injuryZone" ILIKE '%pie%' OR "injuryZone" ILIKE '%planta%' THEN 'PIE'
    ELSE 'OTRA'
  END)::"InjuryZone",
  -- Una regla que se escribió con lado ("hombro derecho") conserva ese lado;
  -- las que no lo llevan quedan con `side` null = valen para los dos.
  "side" = (CASE
    WHEN "injuryZone" ILIKE '%bilateral%' THEN 'BILATERAL'
    WHEN "injuryZone" ILIKE '%derech%' OR "injuryZone" ILIKE '%dcha%' OR "injuryZone" ILIKE '%dcho%' THEN 'DERECHA'
    WHEN "injuryZone" ILIKE '%izquierd%' OR "injuryZone" ILIKE '%izq%' THEN 'IZQUIERDA'
    ELSE NULL
  END)::"Laterality"
WHERE btrim("injuryZone") <> '';

-- ---------------------------------------------------------------------------
-- E10-08 · El suelo legal no se puede relajar
-- ---------------------------------------------------------------------------
-- Los plazos son configuración (D-C3) y se ajustan tras la validación jurídica
-- sin tocar código, pero "parametrizable" no puede significar "bajable a cero":
-- la restricción vive en la base de datos, no en un formulario.
ALTER TABLE "RetentionPolicy"
  ADD CONSTRAINT "RetentionPolicy_minimo_legal_check"
  CHECK ("retentionDays" >= "minimumLegalDays");

-- El asiento del libro mayor nunca es 0: si no mueve saldo, no es un asiento.
ALTER TABLE "SessionLedger"
  ADD CONSTRAINT "SessionLedger_delta_no_cero_check"
  CHECK ("delta" <> 0);

-- ---------------------------------------------------------------------------
-- E10-14 · AuditLog append-only POR CONSTRUCCIÓN (regla RB-SEG-006)
-- ---------------------------------------------------------------------------
-- Un log que quien es auditado puede modificar no sostiene una impugnación, y
-- hasta hoy la aplicación ejecutaba `auditLog.updateMany(...)`. Van dos capas,
-- porque ninguna basta sola:
--
--  1. REVOKE sobre el rol de aplicación. Es lo que pide la HU y lo que protege
--     en producción, donde la app NO es la propietaria de la tabla. Sobre el
--     propietario un REVOKE no tiene ningún efecto (en local y en CI la
--     conexión suele ser `postgres`), así que por sí solo no se nota.
--  2. Trigger. Corta el UPDATE venga de quien venga, propietario incluido.
--
-- El DELETE se deja fuera del trigger a propósito: la purga por retención
-- (E10-08) tiene que poder borrar, y lo hace con un rol DISTINTO del de la
-- aplicación —el único que conserva el privilegio— dejando constancia de la
-- operación de mantenimiento. Lo que el rol de la aplicación no puede hacer,
-- no lo puede hacer tampoco por descuido.

REVOKE UPDATE, DELETE ON TABLE "AuditLog" FROM PUBLIC;

DO $$
DECLARE
  rol text;
BEGIN
  -- Nombres del rol de aplicación, configurables al desplegar:
  --   ALTER DATABASE … SET apta.app_roles = 'apta_app,apta_web';
  FOREACH rol IN ARRAY string_to_array(coalesce(current_setting('apta.app_roles', true), 'apta_app'), ',')
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = btrim(rol)) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE "AuditLog" FROM %I', btrim(rol));
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION "auditlog_append_only"() RETURNS trigger AS $$
BEGIN
  -- Única excepción: soltar el actor cuando su usuario desaparece (art. 17
  -- RGPD). Ese nulo lo pone la propia integridad referencial (FK ON DELETE SET
  -- NULL), no la aplicación, y no toca ni la acción, ni la entidad, ni la
  -- fecha, ni los metadatos: la entrada sigue diciendo lo mismo.
  IF OLD."actorUserId" IS NOT NULL
     AND NEW."actorUserId" IS NULL
     AND NEW."orgId" = OLD."orgId"
     AND NEW."action" = OLD."action"
     AND NEW."entityType" = OLD."entityType"
     AND NEW."entityId" = OLD."entityId"
     AND NEW."createdAt" = OLD."createdAt"
     AND NEW."memberId" IS NOT DISTINCT FROM OLD."memberId"
     AND NEW."metadata" IS NOT DISTINCT FROM OLD."metadata"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AuditLog es append-only (RB-SEG-006): una corrección se anota en una fila nueva, no editando la anterior.'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "auditlog_append_only" ON "AuditLog";
CREATE TRIGGER "auditlog_append_only"
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "auditlog_append_only"();
