-- Evita recibos duplicados dentro de una misma organización (race condition
-- al generar receiptNumber por count()+create() sin transacción atómica).
-- NULL no colisiona (varios pagos aún sin recibo son válidos).
CREATE UNIQUE INDEX "Payment_orgId_receiptNumber_key" ON "Payment"("orgId", "receiptNumber");
