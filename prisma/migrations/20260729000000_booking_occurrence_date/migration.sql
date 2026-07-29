-- Reservas por ocurrencia: una serie recurrente es una sola fila de
-- ClassSession, así que la reserva necesita saber a qué día concreto pertenece.
-- Las reservas existentes son todas de sesiones sin recurrencia (o de la
-- ocurrencia base), de modo que el relleno correcto es la fecha de la sesión.
ALTER TABLE "Booking" ADD COLUMN "occurrenceDate" TIMESTAMP(3);

UPDATE "Booking" b
SET "occurrenceDate" = s."date"
FROM "ClassSession" s
WHERE s."id" = b."sessionId";

ALTER TABLE "Booking" ALTER COLUMN "occurrenceDate" SET NOT NULL;

CREATE INDEX "Booking_sessionId_occurrenceDate_idx" ON "Booking"("sessionId", "occurrenceDate");
CREATE INDEX "Booking_memberId_occurrenceDate_idx" ON "Booking"("memberId", "occurrenceDate");
