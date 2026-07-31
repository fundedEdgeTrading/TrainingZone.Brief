-- AlterTable: ClientFeedback gana orgId propio (antes solo se aislaba navegando por Member)
-- y periodKey ("YYYY-MM") para emparejar cada respuesta con el TrainerDebrief del mismo ciclo.
ALTER TABLE "ClientFeedback" ADD COLUMN     "orgId" TEXT;
ALTER TABLE "ClientFeedback" ADD COLUMN     "periodKey" TEXT;

UPDATE "ClientFeedback" cf
SET "orgId" = m."orgId",
    "periodKey" = to_char(cf."submittedAt", 'YYYY-MM')
FROM "Member" m
WHERE m.id = cf."memberId";

ALTER TABLE "ClientFeedback" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "ClientFeedback" ALTER COLUMN "periodKey" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ClientFeedback_orgId_idx" ON "ClientFeedback"("orgId");
CREATE INDEX "ClientFeedback_periodKey_idx" ON "ClientFeedback"("periodKey");

-- AlterTable: TrainerDebrief gana los mismos campos + estado de revisión de dirección.
ALTER TABLE "TrainerDebrief" ADD COLUMN     "orgId" TEXT;
ALTER TABLE "TrainerDebrief" ADD COLUMN     "periodKey" TEXT;
ALTER TABLE "TrainerDebrief" ADD COLUMN     "reviewedAt" TIMESTAMP(3);
ALTER TABLE "TrainerDebrief" ADD COLUMN     "reviewedByUserId" TEXT;

UPDATE "TrainerDebrief" td
SET "orgId" = m."orgId",
    "periodKey" = to_char(td."debriefAt", 'YYYY-MM')
FROM "Member" m
WHERE m.id = td."memberId";

ALTER TABLE "TrainerDebrief" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "TrainerDebrief" ALTER COLUMN "periodKey" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TrainerDebrief_orgId_idx" ON "TrainerDebrief"("orgId");
CREATE INDEX "TrainerDebrief_periodKey_idx" ON "TrainerDebrief"("periodKey");
