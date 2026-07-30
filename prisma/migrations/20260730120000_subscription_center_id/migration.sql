-- RB-AGENDA-003: un socio puede tener varios bonos activos a la vez si son de
-- distinta modalidad (EP/grupos), y de centros distintos de la misma
-- organización. El centro de reserva pasa a decidirlo el bono, no
-- `Member.primaryCenterId` (que se conserva para RBAC/alta/estadísticas).
-- Backfill: cada bono existente hereda el centro del socio que lo tiene, que
-- es el único centro posible hasta ahora.
ALTER TABLE "Subscription" ADD COLUMN "centerId" TEXT;
UPDATE "Subscription" s SET "centerId" = m."primaryCenterId"
  FROM "Member" m WHERE m."id" = s."memberId";
ALTER TABLE "Subscription" ALTER COLUMN "centerId" SET NOT NULL;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_centerId_fkey"
  FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Subscription_centerId_idx" ON "Subscription"("centerId");
