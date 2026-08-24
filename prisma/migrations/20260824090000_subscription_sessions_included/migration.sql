-- RB-RES-006: capacidad contratada por bono (Subscription), no solo por
-- plan. Se backfillea con el valor actual del plan de cada suscripción para
-- que ningún bono existente cambie de cifra con esta migración: solo a
-- partir de aquí, sumar sesiones a un bono concreto (bonos-actions.ts) puede
-- mover su propia capacidad sin tocar la del plan (compartida por el resto
-- de socios que lo tengan contratado).
ALTER TABLE "Subscription" ADD COLUMN "sessionsIncluded" INTEGER;

UPDATE "Subscription" s
SET "sessionsIncluded" = mp."sessionsIncluded"
FROM "MembershipPlan" mp
WHERE mp.id = s."planId";
