-- Motor de retención (G.3): el cálculo de la caída de frecuencia vivía solo
-- dentro de `prisma/seed.ts`, así que las alertas se generaban una vez —al
-- sembrar la demo— y no se recalculaban nunca. Pasa a `src/lib/retention.ts`,
-- disparado por el cron, y la pantalla `/retention` se retira: la señal se lee
-- en el listado de socios y en su ficha.

-- El motor cierra sola la alerta de quien vuelve a su ritmo. Antes no había
-- estado para eso: quedaba DISMISSED ("descartada" por una persona), que es
-- mentira sobre lo que pasó.
ALTER TYPE "RetentionAlertStatus" ADD VALUE 'RECOVERED';

-- CreateIndex
CREATE INDEX "RetentionAlert_memberId_status_idx" ON "RetentionAlert"("memberId", "status");

-- El seed escribía la lesión activa del socio en `context` ("Reportó lumbalgia
-- el 12/3"). Eso es un HealthRecord copiado a una tabla que no es de salud, en
-- claro y fuera del punto de lectura auditado. El motor ya no lo hace; las filas
-- que lo arrastran se limpian aquí. La siguiente pasada del cron reescribe el
-- texto de las que sigan abiertas.
UPDATE "RetentionAlert" SET "context" = NULL WHERE "context" LIKE 'Reportó %';
