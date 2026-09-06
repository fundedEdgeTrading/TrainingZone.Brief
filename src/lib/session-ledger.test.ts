import test from "node:test";
import assert from "node:assert/strict";
import type { SessionLedgerReason } from "@prisma/client";
import { LEDGER_REASON_LABEL, ledgerBalance, ledgerReconciles, ledgerTotals } from "@/lib/session-ledger";

/**
 * E2-15 (decisión D-P7) · RB-VENTA-008: el libro mayor del bono.
 *
 * El escenario "cuadre" pide explícitamente un test sobre datos generados: la
 * suma de deltas de una suscripción tiene que ser igual a su
 * `sessionsRemaining`. Aquí se simula la vida entera de un bono —alta,
 * reservas, cancelaciones, faltas devueltas, rectificaciones y ajustes a
 * mano— y se comprueba que el libro no se separa nunca del contador.
 */

const entry = (delta: number, reason: SessionLedgerReason) => ({ delta, reason });

test("consumo: una reserva que descuenta bono deja un asiento de −1", () => {
  const rows = [entry(8, "PURCHASE"), entry(-1, "BOOKING")];
  assert.equal(ledgerBalance(rows), 7);
  assert.deepEqual(ledgerTotals(rows), { spent: 1, returned: 0 });
});

test("devolución: cancelación, descarte, borrado de sesión y rectificación de falta suman +1", () => {
  // Los cuatro caminos por los que una sesión vuelve al bono, cada uno con su
  // motivo, todos con delta +1.
  const rows = [
    entry(8, "PURCHASE"),
    entry(-1, "BOOKING"),
    entry(1, "CANCELLATION"), // el socio cancela a tiempo, o el staff limpia el roster
    entry(-1, "BOOKING"),
    entry(1, "MANUAL_ADJUSTMENT"), // descarte del entrenador con devolución forzada
    entry(-1, "BOOKING"),
    entry(1, "NO_SHOW_REFUND"), // falta que dirección decide devolver
  ];
  assert.equal(ledgerBalance(rows), 8);
  assert.deepEqual(ledgerTotals(rows), { spent: 3, returned: 3 });
});

test("alta y renovación: una fila con el delta de sesiones incluidas", () => {
  const rows = [entry(12, "PURCHASE")];
  assert.equal(ledgerBalance(rows), 12);
  // El alta no cuenta como "devuelta": es saldo que entra, no una sesión que
  // vuelve. Si contara, la pantalla diría "12 devueltas" el día del alta.
  assert.deepEqual(ledgerTotals(rows), { spent: 0, returned: 0 });
});

test("cuadre sobre datos generados: el libro nunca se separa del contador", () => {
  // Vida de un bono, movimiento a movimiento, con una mezcla determinista de
  // los casos reales. `balance` es lo que iría en `sessionsRemaining`.
  const rows: { delta: number; reason: SessionLedgerReason }[] = [];
  let balance = 0;
  const apply = (delta: number, reason: SessionLedgerReason) => {
    // El saldo nunca baja de 0: es la condición que viaja dentro del UPDATE.
    if (balance + delta < 0) return;
    balance += delta;
    rows.push(entry(delta, reason));
    // Invariante, comprobado en CADA paso y no solo al final.
    assert.equal(ledgerBalance(rows), balance, `descuadre tras ${reason}`);
  };

  apply(8, "PURCHASE");
  for (let i = 0; i < 40; i++) {
    switch (i % 7) {
      case 0:
        apply(4, "PURCHASE"); // renovación
        break;
      case 1:
      case 2:
      case 3:
        apply(-1, "BOOKING");
        break;
      case 4:
        apply(1, "CANCELLATION");
        break;
      case 5:
        apply(1, "NO_SHOW_REFUND");
        break;
      default:
        apply(i % 2 === 0 ? 2 : -2, "MANUAL_ADJUSTMENT");
    }
  }

  assert.ok(rows.length > 30, "la simulación tiene que haber movido saldo de verdad");
  assert.equal(ledgerReconciles(rows, balance), true);
  // Y descuadra si alguien mueve el contador sin asiento, que es justo lo que
  // el invariante del trimestre prohíbe.
  assert.equal(ledgerReconciles(rows, balance + 1), false);
});

test("un bono ilimitado no tiene saldo que cuadrar", () => {
  // `sessionsRemaining` null: los asientos existen (interesa saber que se usó)
  // pero no hay contador contra el que contrastarlos.
  assert.equal(ledgerReconciles([entry(-1, "BOOKING")], null), true);
});

test("rectificar una falta es otro asiento, nunca la edición del anterior", () => {
  // Se devolvió la sesión al marcar la falta y se vuelve a descontar al
  // rectificarla: dos asientos, y el saldo vuelve a donde estaba.
  const rows = [entry(8, "PURCHASE"), entry(-1, "BOOKING"), entry(1, "NO_SHOW_REFUND"), entry(-1, "CORRECTION")];
  assert.equal(ledgerBalance(rows), 7);
  assert.deepEqual(ledgerTotals(rows), { spent: 2, returned: 1 });
});

test("cada motivo del enum tiene etiqueta: el listado no enseña constantes", () => {
  const reasons: SessionLedgerReason[] = [
    "PURCHASE",
    "BOOKING",
    "CANCELLATION",
    "NO_SHOW_REFUND",
    "MANUAL_ADJUSTMENT",
    "EXPIRY",
    "CORRECTION",
  ];
  for (const reason of reasons) {
    assert.equal(typeof LEDGER_REASON_LABEL[reason], "string");
    assert.ok(LEDGER_REASON_LABEL[reason].length > 0, `falta la etiqueta de ${reason}`);
  }
});
