-- Baja de plantilla (RB-RRHH-014): una persona dada de baja pierde el acceso y
-- desaparece del equipo, pero su rastro histórico (fichajes, mesociclos,
-- valoraciones, ventas) sigue colgando de la misma fila.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- El listado de plantilla y todos los selectores de personal filtran por este
-- campo: sin índice, cada uno de ellos hace scan completo de User.
-- CreateIndex
CREATE INDEX "User_orgId_deactivatedAt_idx" ON "User"("orgId", "deactivatedAt");
