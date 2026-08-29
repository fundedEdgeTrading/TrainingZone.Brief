-- RB-RES-009: motivo de la falta y control manual de la devolución al bono.
-- Hasta ahora "No asistió" no dejaba rastro del porqué y nunca devolvía la
-- sesión; ahora el entrenador registra el motivo y decide caso a caso.

-- CreateEnum
CREATE TYPE "NoShowReason" AS ENUM ('FORGOT', 'LATE_NOTICE', 'JUSTIFIED', 'OUR_ERROR');

-- AlterTable
-- `noShowRefunded` arranca en false para todo el histórico: ninguna falta
-- anterior devolvió sesión, así que el dato retroactivo es exacto.
ALTER TABLE "Booking" ADD COLUMN     "noShowReason" "NoShowReason",
ADD COLUMN     "noShowRefunded" BOOLEAN NOT NULL DEFAULT false;
