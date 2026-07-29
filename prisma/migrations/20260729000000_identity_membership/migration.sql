-- Separa la credencial (Identity, única global) de la membresía (User, por
-- organización). Migración con backfill: se reutiliza `User.id` como
-- `Identity.id` para que la correspondencia 1:1 sea implícita y no haga falta
-- tabla puente ni segunda pasada.

CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSetAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "authProvider" TEXT NOT NULL DEFAULT 'password',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Identity_email_key" ON "Identity"("email");

-- `User.email` es único global antes de esta migración, así que el backfill 1:1
-- no puede colisionar con el índice único de Identity.
-- Las membresías que ya existían tienen contraseña real: `passwordSetAt` = su fecha de alta.
INSERT INTO "Identity" ("id", "email", "passwordHash", "passwordSetAt", "emailVerifiedAt", "authProvider", "createdAt")
SELECT
    "id",
    "email",
    "passwordHash",
    "createdAt",
    "emailVerifiedAt",
    CASE WHEN "authProvider" = 'demo' THEN 'password' ELSE "authProvider" END,
    "createdAt"
FROM "User";

ALTER TABLE "User" ADD COLUMN "identityId" TEXT;
UPDATE "User" SET "identityId" = "id";
ALTER TABLE "User" ALTER COLUMN "identityId" SET NOT NULL;

ALTER TABLE "User" ADD CONSTRAINT "User_identityId_fkey"
    FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");
CREATE INDEX "User_identityId_idx" ON "User"("identityId");

-- Estos tres atributos describen la credencial, no la membresía: viven en Identity.
ALTER TABLE "User" DROP COLUMN "passwordHash";
ALTER TABLE "User" DROP COLUMN "emailVerifiedAt";
ALTER TABLE "User" DROP COLUMN "authProvider";
