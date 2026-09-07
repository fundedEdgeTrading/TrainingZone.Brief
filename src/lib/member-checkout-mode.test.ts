import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PlanType } from "@prisma/client";
import { isRecurring, resolveCheckoutMode } from "@/lib/member-billing";

/**
 * HU-ST-09 / decisión D-S2 · `member-billing.ts` fijaba `payment_method_types` a
 * mano: `["card"]` en los bonos puntuales y `["card","sepa_debit"]` en las
 * cuotas. Eso dejaba fuera **Bizum** —el método que más pide un socio español—
 * y también Link y los wallets, y hacía fallar el checkout entero si alguno de
 * los métodos listados no estaba activo en la cuenta del gimnasio.
 *
 * La decisión se toma en un solo sitio: `resolveCheckoutMode`, que la deduce de
 * `isRecurring()`.
 */

const PUNTUALES: PlanType[] = ["SESSION_PACK", "DROP_IN", "DUO", "PERSONAL_TRAINING"];
const RECURRENTES: PlanType[] = ["MONTHLY", "ONLINE"];

test("un bono puntual se abre en mode:payment y admite Bizum", () => {
  for (const type of PUNTUALES) {
    const decision = resolveCheckoutMode(type);
    assert.equal(decision.mode, "payment", `${type} es un bono puntual`);
    assert.equal(decision.bizumAvailable, true, `${type} tiene que poder cobrarse por Bizum`);
  }
});

test("una cuota recurrente se abre en mode:subscription y NUNCA ofrece Bizum", () => {
  for (const type of RECURRENTES) {
    const decision = resolveCheckoutMode(type);
    assert.equal(decision.mode, "subscription", `${type} es cuota recurrente`);
    assert.equal(decision.bizumAvailable, false, "Bizum no admite recurrencia");
  }
});

test("la disponibilidad de Bizum es exactamente lo contrario de isRecurring", () => {
  // El escenario "la restricción vive en un solo sitio": si algún día se añade
  // un PlanType nuevo, su trato queda decidido por `isRecurring` y nada más.
  for (const type of [...PUNTUALES, ...RECURRENTES]) {
    assert.equal(resolveCheckoutMode(type).bizumAvailable, !isRecurring(type));
  }
});

test("ningún checkout de socio fija payment_method_types a mano", () => {
  // Escenario "método no disponible en la cuenta del gimnasio": con la lista
  // escrita a mano, Stripe devuelve un error y el socio no puede pagar por
  // ninguna vía. Omitiéndola, el método que no esté activo simplemente no sale.
  const fuente = readFileSync("src/lib/member-billing.ts", "utf8");
  assert.equal(
    fuente.includes("payment_method_types:"),
    false,
    "los métodos los decide la cuenta conectada del gimnasio (Standard, D-S1), no una lista en el código"
  );
});
