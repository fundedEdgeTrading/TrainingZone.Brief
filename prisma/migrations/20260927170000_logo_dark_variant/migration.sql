-- Versión del logo para fondos oscuros (organización y centro).
--
-- Solo aditiva: dos columnas opcionales. Sin ellas se comporta como hasta
-- ahora, salvo que en fondo oscuro el logo normal va sobre una pastilla clara
-- (src/lib/brand-logo.ts).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoDarkUrl" TEXT;

-- AlterTable
ALTER TABLE "Center" ADD COLUMN     "logoDarkUrl" TEXT;

