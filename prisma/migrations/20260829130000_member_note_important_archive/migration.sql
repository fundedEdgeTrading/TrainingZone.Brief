-- Bitácora del socio: nota destacada y archivado.
--
-- `important` sube la nota al bloque de cabecera de Actividad (lo que el
-- entrenador tiene que saber antes de la sesión) y `archivedAt` la retira del
-- hilo sin borrarla: una observación puntual deja de estorbar cuando ya no
-- aplica, pero la fila se conserva y sigue siendo consultable.
--
-- Ambas columnas nacen con el valor de "nota normal y visible", así que las
-- notas ya escritas siguen apareciendo exactamente igual que antes.
-- AlterTable
ALTER TABLE "MemberNote" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false;

-- El hilo y el bloque destacado piden siempre lo mismo: las notas de ESTE
-- socio sin archivar, de la más nueva a la más vieja. Sin índice es un scan
-- de MemberNote en cada apertura de ficha.
-- CreateIndex
CREATE INDEX "MemberNote_memberId_archivedAt_createdAt_idx" ON "MemberNote"("memberId", "archivedAt", "createdAt");
