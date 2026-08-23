-- Buzón de propuestas retirado: se elimina el módulo entero (modelo, queries,
-- acciones y tarjeta de /rrhh), así que la tabla se va con él.

-- DropForeignKey
ALTER TABLE "StaffProposal" DROP CONSTRAINT "StaffProposal_orgId_fkey";

-- DropForeignKey
ALTER TABLE "StaffProposal" DROP CONSTRAINT "StaffProposal_authorUserId_fkey";

-- DropTable
DROP TABLE "StaffProposal";

-- Las notificaciones que apuntaban a una propuesta quedan huérfanas: no hay
-- destino al que abrirlas, así que se retiran.
DELETE FROM "Notification" WHERE "entityType" = 'StaffProposal';
