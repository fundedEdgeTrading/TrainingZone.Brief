-- Alta pago-primero: la organización nace del webhook de un pago confirmado, no
-- de un formulario. Hacen falta dos cosas: una clave de idempotencia (para que
-- un reenvío del webhook no cree una segunda organización) y un tipo de
-- invitación propio para la activación del director.

ALTER TABLE "Organization" ADD COLUMN "provisioningSessionId" TEXT;
CREATE UNIQUE INDEX "Organization_provisioningSessionId_key" ON "Organization"("provisioningSessionId");

-- Postgres permite añadir un valor al enum dentro de la migración; solo no se
-- puede USAR en la misma transacción, y aquí únicamente se declara.
ALTER TYPE "InvitationType" ADD VALUE 'OWNER';
