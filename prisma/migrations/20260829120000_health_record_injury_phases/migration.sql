-- Fases de lesión (A.2.4). Dos cosas que el modelo no sabía decir:
--   1. CUÁNDO se lesionó el socio — solo cuándo se registró (`reportedAt`).
--   2. Que una lesión pasa por rehabilitación antes de estar resuelta, y que
--      algunas no se resuelven nunca.
--
-- Migración puramente aditiva: no reescribe ni una fila. Los registros que ya
-- existen siguen siendo ACTIVE o RESOLVED con la misma semántica de siempre
-- ("vigente" / "recuperada"), y se quedan sin fecha de lesión — que es la
-- verdad: nadie la capturó. La UI lo dice ("fecha de lesión no registrada") en
-- vez de inventarse `reportedAt` como si fuera el día del golpe.

-- AlterEnum
-- Añadir valores a un enum es transaccional desde PostgreSQL 12 mientras no se
-- USEN en la misma transacción. El UPDATE de abajo solo toca `statusChangedAt`.
ALTER TYPE "HealthStatus" ADD VALUE 'IN_REHAB';
ALTER TYPE "HealthStatus" ADD VALUE 'CHRONIC';

-- AlterTable
ALTER TABLE "HealthRecord" ADD COLUMN     "injuryDate" TIMESTAMP(3),
ADD COLUMN     "injuryDateApprox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3);

-- Lo único que sí se puede rellenar sin inventar: una lesión ya resuelta tuvo
-- su último cambio de estado el día en que se resolvió.
UPDATE "HealthRecord" SET "statusChangedAt" = "resolvedAt" WHERE "resolvedAt" IS NOT NULL;
