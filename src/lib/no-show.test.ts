import test from "node:test";
import assert from "node:assert/strict";
import {
  consecutiveNoShowsWithoutNotice,
  isNoShowWithoutNotice,
  parseNoShowReason,
  reachesConsecutiveNoShowAlert,
} from "./no-show";

/**
 * RB-RES-009: la regla que decide si dirección recibe el aviso por faltas
 * seguidas. Se fija aquí, sin base de datos, porque es donde está el criterio:
 * qué falta cuenta como "sin aviso" y qué corta la racha. Lo que hace con ella
 * el motor de notificaciones se prueba en no-show-alerts.test.ts.
 */

const noShow = (reason: "FORGOT" | "LATE_NOTICE" | "JUSTIFIED" | "OUR_ERROR") => ({
  status: "NO_SHOW",
  noShowReason: reason as never,
});
const attended = { status: "ATTENDED", noShowReason: null };
const cancelled = { status: "CANCELLED", noShowReason: null };

test("parseNoShowReason acepta los cuatro motivos del enum y rechaza el resto", () => {
  assert.equal(parseNoShowReason("FORGOT"), "FORGOT");
  assert.equal(parseNoShowReason("LATE_NOTICE"), "LATE_NOTICE");
  assert.equal(parseNoShowReason("JUSTIFIED"), "JUSTIFIED");
  assert.equal(parseNoShowReason("OUR_ERROR"), "OUR_ERROR");
  // El motivo llega del cliente: cualquier otra cosa no es un motivo válido.
  assert.equal(parseNoShowReason("ENFERMO"), null);
  assert.equal(parseNoShowReason(""), null);
  assert.equal(parseNoShowReason(undefined), null);
});

test("solo cuenta como falta sin aviso la del propio socio", () => {
  assert.equal(isNoShowWithoutNotice("FORGOT"), true);
  assert.equal(isNoShowWithoutNotice("LATE_NOTICE"), false, "avisó, aunque tarde");
  assert.equal(isNoShowWithoutNotice("JUSTIFIED"), false, "tenía motivo");
  // E12-14: la provocó el CENTRO, no el socio.
  assert.equal(isNoShowWithoutNotice("OUR_ERROR"), false);
  assert.equal(isNoShowWithoutNotice(null), false);
});

test("E12-14: un error del centro no suma a la racha", () => {
  // Tres faltas seguidas, pero las tres las provocó el centro: no hay nada que
  // avisarle a dirección sobre este socio.
  const history = [noShow("OUR_ERROR"), noShow("OUR_ERROR"), noShow("OUR_ERROR")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 0);
  assert.equal(reachesConsecutiveNoShowAlert(history), false);
});

test("E12-14: un error del centro tampoco corta la racha del socio", () => {
  // Ni suma ni parte: se salta, igual que una cancelación a tiempo. Si cortara,
  // bastaría con un error del centro en medio para que tres plantones seguidos
  // no llegaran a avisar nunca.
  const history = [noShow("FORGOT"), noShow("OUR_ERROR"), noShow("FORGOT"), noShow("FORGOT")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 3);
  assert.equal(reachesConsecutiveNoShowAlert(history), true);
});

test("E12-14: el olvido del socio sigue sumando exactamente igual que antes", () => {
  const history = [noShow("FORGOT"), noShow("FORGOT"), noShow("FORGOT")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 3);
  assert.equal(reachesConsecutiveNoShowAlert(history), true);
});

test("E12-14: una racha ya formada se recalcula al leerla", () => {
  // El histórico no cambia; el criterio sí. Una racha de tres que dependía de
  // dos errores del centro deja de llegar al umbral en cuanto se vuelve a leer.
  const history = [noShow("OUR_ERROR"), noShow("FORGOT"), noShow("OUR_ERROR"), attended];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 1);
  assert.equal(reachesConsecutiveNoShowAlert(history), false);
});

test("tres faltas seguidas sin avisar disparan el aviso a dirección", () => {
  const history = [noShow("FORGOT"), noShow("FORGOT"), noShow("FORGOT"), attended];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 3);
  assert.equal(reachesConsecutiveNoShowAlert(history), true);
});

test("dos faltas seguidas todavía no avisan", () => {
  const history = [noShow("FORGOT"), noShow("FORGOT"), attended, noShow("FORGOT")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 2);
  assert.equal(reachesConsecutiveNoShowAlert(history), false);
});

test("una asistencia corta la racha aunque antes hubiera tres faltas", () => {
  // La sesión más reciente va primera: el cliente volvió, así que la racha
  // anterior ya no describe su situación.
  const history = [attended, noShow("FORGOT"), noShow("FORGOT"), noShow("FORGOT")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 0);
  assert.equal(reachesConsecutiveNoShowAlert(history), false);
});

test("avisar tarde o tener causa justificada corta la racha", () => {
  // Los dos motivos que la regla deja fuera: el cliente dio la cara, así que su
  // falta no puede ser el eslabón de una racha "sin aviso".
  assert.equal(reachesConsecutiveNoShowAlert([noShow("FORGOT"), noShow("LATE_NOTICE"), noShow("FORGOT"), noShow("FORGOT")]), false);
  assert.equal(reachesConsecutiveNoShowAlert([noShow("FORGOT"), noShow("JUSTIFIED"), noShow("FORGOT"), noShow("FORGOT")]), false);
});

test("una cancelación entre faltas no parte la racha: no es una sesión consumida", () => {
  // Cancelar a tiempo no es faltar. Si contara como hueco, tres plantones
  // seguidos con una cancelación en medio no llegarían a avisar nunca.
  const history = [noShow("FORGOT"), cancelled, noShow("FORGOT"), noShow("FORGOT")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 3);
  assert.equal(reachesConsecutiveNoShowAlert(history), true);
});

test("una falta sin motivo registrado (histórico anterior a la regla) no cuenta", () => {
  const history = [{ status: "NO_SHOW", noShowReason: null }, noShow("FORGOT"), noShow("FORGOT"), noShow("FORGOT")];
  assert.equal(consecutiveNoShowsWithoutNotice(history), 0);
});
