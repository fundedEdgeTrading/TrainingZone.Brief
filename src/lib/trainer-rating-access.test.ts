import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrainerRatingDisclosure,
  RLT_NOTICE,
  SUBJECT_ACCESS_DEADLINE_DAYS,
  subjectAccessDeadline,
} from "./trainer-rating-access";

const RATINGS = [
  { score: 9, strengths: "Muy atenta", improvements: "Más variedad", createdAt: new Date("2026-03-01"), memberId: "m1" },
  { score: 6, strengths: null, improvements: "Llega justa de tiempo", createdAt: new Date("2026-06-01"), memberId: "m2" },
];

/**
 * E10-16, escenario principal: el entrenador recibe puntuación, fortalezas y
 * áreas de mejora — el art. 15.4 protege la identidad del tercero, no niega el
 * contenido. Hoy no había ningún camino, ni siquiera manual.
 */
test("lo que se entrega lleva puntuación, fortalezas y áreas de mejora", () => {
  const disclosure = buildTrainerRatingDisclosure(RATINGS);
  assert.equal(disclosure.length, 2);
  assert.equal(disclosure[0].score, 9);
  assert.equal(disclosure[0].strengths, "Muy atenta");
  assert.equal(disclosure[1].improvements, "Llega justa de tiempo");
});

/**
 * Escenario "identidad del tercero": seudonimizar no es quitar el nombre y
 * dejar el `memberId`, con el que se vuelve a la ficha del socio en un clic.
 */
test("no se entrega quién escribió cada valoración, ni por el id", () => {
  const disclosure = buildTrainerRatingDisclosure(RATINGS);
  const serialized = JSON.stringify(disclosure);
  assert.equal(/m1|m2/.test(serialized), false, "el id del socio viaja en la entrega");
  assert.equal(/memberId/.test(serialized), false);
  assert.deepEqual(
    disclosure.map((d) => d.label),
    ["Valoración 1", "Valoración 2"],
  );
});

/** Escenario "plazo": el mes del art. 12.3, contado desde la solicitud. */
test("el plazo es un mes desde la solicitud", () => {
  const requested = new Date("2026-09-06T10:00:00.000Z");
  const deadline = subjectAccessDeadline(requested);
  assert.equal(deadline.getTime() - requested.getTime(), SUBJECT_ACCESS_DEADLINE_DAYS * 86_400_000);
  assert.equal(SUBJECT_ACCESS_DEADLINE_DAYS, 30);
});

test("sin ninguna valoración la entrega es vacía, no un error", () => {
  assert.deepEqual(buildTrainerRatingDisclosure([]), []);
});

/** Escenario "uso en decisión laboral": el aviso del art. 64.4.d ET existe. */
test("el aviso a la representación legal cita el artículo que lo exige", () => {
  assert.match(RLT_NOTICE, /64\.4\.d/);
  assert.match(RLT_NOTICE, /representación legal/);
});
