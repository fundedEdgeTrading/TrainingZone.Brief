import test from "node:test";
import assert from "node:assert/strict";
import { CANCEL_WINDOW_HOURS, canCancelWithoutPenalty, enforcementStartsAt } from "@/lib/portal-queries";

/**
 * E2-07 / RB-RES-012: el distintivo "cancelable sin penalización" y lo que pasa
 * al pulsar tienen que salir del mismo cálculo.
 *
 * El fallo: `timezone.ts` prioriza la cookie `tz` del navegador, el portal
 * calculaba `canCancelFreely` con ella y la escritura usaba siempre
 * `cls.center.timezone` — con un desfase de hasta ~26 h que el propio
 * comentario advertía. Un socio con la cookie en América veía "cancelable" una
 * reserva que al pulsar le costaba la sesión.
 */

const MADRID = "Europe/Madrid";
const LIMA = "America/Lima"; // la cookie del socio: -7 h respecto de Madrid en verano

test("el instante que decide sale de la zona del centro, no de la del cliente", () => {
  const day = new Date(2026, 8, 10); // 10 de septiembre de 2026, día suelto
  const fromCenter = enforcementStartsAt(day, "09:00", MADRID);
  const fromCookie = enforcementStartsAt(day, "09:00", LIMA);

  // Los dos existen y son distintos: por eso importa cuál se usa.
  assert.notEqual(fromCenter.getTime(), fromCookie.getTime());
  // Las 09:00 de Madrid en septiembre son las 07:00 UTC (CEST, +02:00).
  assert.equal(fromCenter.toISOString(), "2026-09-10T07:00:00.000Z");
});

test("un centro sin zona configurada cae al valor por defecto en vez de romper", () => {
  const day = new Date(2026, 8, 10);
  assert.equal(
    enforcementStartsAt(day, "09:00", null).getTime(),
    enforcementStartsAt(day, "09:00", MADRID).getTime(),
    "el defecto del esquema es Europe/Madrid"
  );
  assert.equal(enforcementStartsAt(day, "09:00", "").getTime(), enforcementStartsAt(day, "09:00", MADRID).getTime());
});

test("lectura y escritura coinciden justo en el límite de la ventana", () => {
  const day = new Date(2026, 8, 10);
  const startsAt = enforcementStartsAt(day, "09:00", MADRID);
  const hour = 3_600_000;

  // Justo en el límite todavía es gratis; un minuto más tarde, ya no.
  const atTheEdge = new Date(startsAt.getTime() - CANCEL_WINDOW_HOURS * hour);
  assert.equal(canCancelWithoutPenalty(startsAt, atTheEdge), true);
  assert.equal(canCancelWithoutPenalty(startsAt, new Date(atTheEdge.getTime() + 60_000)), false);
});

test("con la zona del cliente el distintivo mentía: el mismo momento salía de los dos lados", () => {
  const day = new Date(2026, 8, 10);
  const hour = 3_600_000;
  const real = enforcementStartsAt(day, "09:00", MADRID);
  const asTheClientSawIt = enforcementStartsAt(day, "09:00", LIMA);

  // Un momento elegido para caer dentro de la ventana según el centro y fuera
  // de ella según la cookie: es exactamente el desfase que rompía la promesa.
  const now = new Date(real.getTime() - (CANCEL_WINDOW_HOURS - 1) * hour);
  assert.equal(canCancelWithoutPenalty(real, now), false, "el centro dice: se consume");
  assert.equal(canCancelWithoutPenalty(asTheClientSawIt, now), true, "la cookie decía: gratis");

  // El arreglo es que ya no hay dos respuestas: solo se consulta la del centro.
});

test("el cambio de hora no descoloca el cálculo", () => {
  // Madrugada del último domingo de octubre de 2026 (CEST → CET, 03:00 → 02:00).
  const changeDay = new Date(2026, 9, 25);
  const before = enforcementStartsAt(changeDay, "01:00", MADRID);
  const after = enforcementStartsAt(changeDay, "09:00", MADRID);

  assert.equal(before.toISOString(), "2026-10-24T23:00:00.000Z", "01:00 aún en CEST (+02:00)");
  assert.equal(after.toISOString(), "2026-10-25T08:00:00.000Z", "09:00 ya en CET (+01:00)");
  // Y el orden se mantiene: 9 h de reloj de pared, 9 h reales menos la ganada.
  assert.ok(after.getTime() > before.getTime());
});
