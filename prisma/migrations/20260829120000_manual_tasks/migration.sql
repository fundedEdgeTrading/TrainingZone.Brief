-- Tareas manuales (F10). La bandeja de tareas existía, pero solo la llenaba el
-- motor de reglas: no había forma de que una dirección encargara algo a mano a
-- un entrenador. Se reutiliza `Notification` (kind = TASK) en vez de crear una
-- tabla nueva, para que la campana, el histórico y `resolveNotification` sigan
-- siendo únicos y una tarea manual y una automática se resuelvan igual.

-- Prioridad de la tarea manual. Lo que crea el motor nace en MEDIA: una regla
-- no sabe lo que corre prisa en un centro concreto.
-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "Notification"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIA',
  ADD COLUMN "startedAt" TIMESTAMP(3);

-- `createdByUserId` queda NULL en todo lo ya sembrado, y es lo correcto: esas
-- filas las creó el motor de reglas, no una persona. Por eso la columna es
-- opcional y no se rellena aquí con nadie.

-- El tablero lee por organización + tipo + abiertas/histórico.
-- CreateIndex
CREATE INDEX "Notification_orgId_kind_resolvedAt_idx" ON "Notification"("orgId", "kind", "resolvedAt");

-- CreateIndex
CREATE INDEX "Notification_createdByUserId_idx" ON "Notification"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
