-- Grupo de socio (perfil EP) del mesociclo, para generar y refinar con la
-- metodología del perfil real en vez de programar siempre como Mantenimiento
-- (docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md fase 1).
--
-- Todo el histórico se generó como Mantenimiento (era el único perfil que
-- usaba el sistema hasta ahora), así que el valor por defecto es exacto para
-- las filas ya existentes: no hace falta backfill manual.

-- CreateEnum
CREATE TYPE "EpProfile" AS ENUM ('TERCERA_EDAD', 'REHABILITACION', 'DERIVACION_GRUPOS', 'RENDIMIENTO_OPOSICIONES', 'RENDIMIENTO_ATLETA', 'MANTENIMIENTO');

-- AlterTable
ALTER TABLE "Mesocycle" ADD COLUMN     "profile" "EpProfile" NOT NULL DEFAULT 'MANTENIMIENTO';
