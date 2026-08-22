-- Handoff "App móvil premium" (socio · entrenador · dirección).

-- A2/D4/D5: el plan es también el producto que el socio ve y compra en la app,
-- así que necesita texto de venta y foto. La visibilidad sigue siendo `active`.
ALTER TABLE "MembershipPlan" ADD COLUMN "description" TEXT;
ALTER TABLE "MembershipPlan" ADD COLUMN "imageUrl" TEXT;

-- C4: feedback 1-10 por socio al terminar la sesión. `rpe` ya existía (esfuerzo
-- percibido) y es el primer eje; los siete restantes se añaden opcionales para
-- que el autoguardado por eje pueda ir dejando la fila a medias.
ALTER TABLE "SessionDebrief" ADD COLUMN "technique" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "attitude" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "energy" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "mobility" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "pain" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "adherence" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "progress" INTEGER;
ALTER TABLE "SessionDebrief" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "SessionDebrief" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "SessionDebrief" ALTER COLUMN "updatedAt" SET NOT NULL;

-- D7: ficha del equipo visible (foto + nombre) en la app del socio.
ALTER TABLE "User" ADD COLUMN "visibleInApp" BOOLEAN NOT NULL DEFAULT true;
