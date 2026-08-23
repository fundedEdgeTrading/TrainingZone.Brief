-- Motor de ofertas personalizadas retirado: se elimina el módulo entero (modelo,
-- queries, acciones, ruta /offers y la regla del cron), así que la tabla y su
-- enum se van con él.

-- DropForeignKey
ALTER TABLE "PersonalizedOffer" DROP CONSTRAINT "PersonalizedOffer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "PersonalizedOffer" DROP CONSTRAINT "PersonalizedOffer_memberId_fkey";

-- DropForeignKey
ALTER TABLE "PersonalizedOffer" DROP CONSTRAINT "PersonalizedOffer_proposedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PersonalizedOffer" DROP CONSTRAINT "PersonalizedOffer_approvedByUserId_fkey";

-- DropTable
DROP TABLE "PersonalizedOffer";

-- DropEnum
DROP TYPE "OfferStatus";

-- Las notificaciones que apuntaban a una oferta quedan huérfanas: `/offers` ya
-- no existe, así que se retiran.
DELETE FROM "Notification" WHERE "entityType" = 'PersonalizedOffer';
