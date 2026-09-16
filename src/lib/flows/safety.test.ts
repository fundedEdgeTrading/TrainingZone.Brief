import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import type { MemberEmailPreferences } from "@/lib/email-preferences";
import {
  FLOW_REENTRY_DAYS,
  QUIET_HOURS_END,
  QUIET_HOURS_START,
  WEEKLY_EMAIL_CAP_DAYS,
  canEnrollAgain,
  decideFlowSend,
  isWithinQuietHours,
  nextAllowedSendAt,
  nextStepRunAt,
  reentryAvailableAt,
  weeklyCapBlockedUntil,
  type FlowSendGate,
} from "./safety";

/**
 * LAS SEIS REGLAS DE SEGURIDAD, PROBADAS SIN BASE DE DATOS.
 *
 * Son lógica pura sobre un reloj y un registro, así que el reloj se inyecta y
 * no hace falta levantar nada. Los casos que están aquí dentro son los MALOS,
 * que son los que cuentan: dos flujos disparando el mismo minuto, el cron a las
 * 23:00, un socio sin `consentMarketing`, la pausa global a mitad de cola y el
 * reloj en un cambio de hora.
 */

const MADRID = "Europe/Madrid";
const DAY = 86_400_000;

/** Socio de control: consiente marketing y no se ha dado de baja de nada. */
function prefs(overrides: Partial<MemberEmailPreferences> = {}): MemberEmailPreferences {
  return {
    notifyVacancies: true,
    notifyBirthday: true,
    notifyAssessments: true,
    consentMarketing: true,
    emailOptOutAt: null,
    ...overrides,
  };
}

/** Puerta de control: flujo activo, a media mañana, sin nada enviado antes. */
function gate(overrides: Partial<FlowSendGate> = {}): FlowSendGate {
  return {
    now: new Date("2026-09-16T09:00:00.000Z"), // 11:00 en Madrid
    timeZone: MADRID,
    flowsPausedAt: null,
    flowStatus: "ACTIVE",
    testEmail: "pruebas@trainingzone.es",
    memberEmail: "socio@ejemplo.com",
    prefs: prefs(),
    lastFlowEmailAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// REGLA 2 · Nada entre 22:00 y 8:00, en la hora DEL CENTRO
// ---------------------------------------------------------------------------

test("regla 2 · la ventana se lee en la hora del centro, no en la del servidor", () => {
  // 21:30 UTC = 23:30 en Madrid (horario de verano): de noche allí, aunque el
  // servidor —que corre en UTC— todavía crea que son las nueve y media.
  const instant = new Date("2026-09-16T21:30:00.000Z");
  assert.equal(isWithinQuietHours(instant, MADRID), true);
  assert.equal(isWithinQuietHours(instant, "UTC"), false);
});

test("regla 2 · el cron a las 23:00 no manda y no pierde: reprograma a las 8:00", () => {
  // 23:00 de pared en Madrid, en septiembre (UTC+2).
  const cronAt23 = new Date("2026-09-16T21:00:00.000Z");
  const runAt = nextAllowedSendAt(cronAt23, MADRID);

  assert.ok(runAt.getTime() > cronAt23.getTime(), "se empuja hacia adelante");
  assert.equal(isWithinQuietHours(runAt, MADRID), false);
  // Las 8:00 del día siguiente en Madrid = 06:00 UTC del 17.
  assert.equal(runAt.toISOString(), "2026-09-17T06:00:00.000Z");
});

test("regla 2 · a las 6 de la mañana espera a las 8 del MISMO día, no del siguiente", () => {
  const madrugada = new Date("2026-09-16T04:00:00.000Z"); // 06:00 en Madrid
  assert.equal(nextAllowedSendAt(madrugada, MADRID).toISOString(), "2026-09-16T06:00:00.000Z");
});

test("regla 2 · dentro de la ventana buena, el instante no se toca", () => {
  const medioDia = new Date("2026-09-16T10:00:00.000Z"); // 12:00 en Madrid
  assert.equal(nextAllowedSendAt(medioDia, MADRID).getTime(), medioDia.getTime());
});

test("regla 2 · los bordes son cerrados por abajo y abiertos por arriba", () => {
  // Las 8:00 en punto ya se puede; las 22:00 en punto ya no.
  const ocho = new Date("2026-09-16T06:00:00.000Z");
  const diez = new Date("2026-09-16T20:00:00.000Z");
  assert.equal(isWithinQuietHours(ocho, MADRID), false);
  assert.equal(isWithinQuietHours(diez, MADRID), true);
  assert.equal(QUIET_HOURS_START, 22);
  assert.equal(QUIET_HOURS_END, 8);
});

test("regla 2 · cambio de hora: la madrugada en que el reloj se atrasa sigue abriendo a las 8:00", () => {
  // Noche del 24 al 25 de octubre de 2026: España pasa de UTC+2 a UTC+1 a las
  // 03:00. Un envío que cae en esa madrugada tiene que abrir a las 8:00 REALES
  // del centro, que ese día son las 07:00 UTC y no las 06:00.
  const duranteElCambio = new Date("2026-10-25T01:30:00.000Z"); // 03:30 → 02:30 de pared
  const runAt = nextAllowedSendAt(duranteElCambio, MADRID);
  assert.equal(runAt.toISOString(), "2026-10-25T07:00:00.000Z");
  assert.equal(isWithinQuietHours(runAt, MADRID), false);
});

test("regla 2 · una zona horaria inválida no revienta el motor", () => {
  const instant = new Date("2026-09-16T10:00:00.000Z");
  assert.doesNotThrow(() => nextAllowedSendAt(instant, "Marte/Olympus"));
});

// ---------------------------------------------------------------------------
// REGLA 1 · Máximo 1 email por socio y semana, ENTRE TODOS los flujos
// ---------------------------------------------------------------------------

test("regla 1 · con un envío de ayer, el tope bloquea hasta siete días después", () => {
  const now = new Date("2026-09-16T09:00:00.000Z");
  const ayer = new Date(now.getTime() - DAY);
  const blocked = weeklyCapBlockedUntil(ayer, now);
  assert.ok(blocked);
  assert.equal(blocked.getTime(), ayer.getTime() + WEEKLY_EMAIL_CAP_DAYS * DAY);
});

test("regla 1 · a los siete días justos ya hay hueco", () => {
  const now = new Date("2026-09-16T09:00:00.000Z");
  const haceSiete = new Date(now.getTime() - WEEKLY_EMAIL_CAP_DAYS * DAY);
  assert.equal(weeklyCapBlockedUntil(haceSiete, now), null);
});

test("regla 1 · DOS FLUJOS EL MISMO MINUTO: sale uno y solo uno", () => {
  // El primero pasa por la puerta y reserva el hueco: el segundo, que decide
  // sobre el registro ya actualizado, se aplaza. Es el caso que rompe la
  // promesa si cada flujo decide por su cuenta.
  const now = new Date("2026-09-16T09:00:00.000Z");

  const primero = decideFlowSend(gate({ now, lastFlowEmailAt: null }));
  assert.equal(primero.kind, "send");

  const segundo = decideFlowSend(gate({ now, lastFlowEmailAt: now }));
  assert.equal(segundo.kind, "defer");
  assert.equal(segundo.kind === "defer" && segundo.reason, "weekly_cap");
});

test("regla 1 · el aplazamiento del tope también respeta la ventana de silencio", () => {
  // El hueco se abre a las 23:30 de Madrid: no se manda entonces, se manda a
  // las 8:00. Las dos reglas se componen en vez de pisarse.
  const now = new Date("2026-09-16T09:00:00.000Z");
  const ultimo = new Date("2026-09-10T21:30:00.000Z"); // 23:30 de pared
  const decision = decideFlowSend(gate({ now, lastFlowEmailAt: ultimo }));
  assert.equal(decision.kind, "defer");
  if (decision.kind !== "defer") return;
  assert.equal(isWithinQuietHours(decision.runAt, MADRID), false);
  assert.equal(decision.runAt.toISOString(), "2026-09-18T06:00:00.000Z");
});

test("regla 1 · el correo transaccional NO cuenta: no llega aquí ni se registra", () => {
  // La prueba de esto es negativa a propósito: la puerta solo conoce
  // `lastFlowEmailAt`, que es `FlowEmailLog` —solo correo de flujo—. Un
  // preaviso SEPA de esta mañana no tiene forma de entrar en este cálculo.
  const now = new Date("2026-09-16T09:00:00.000Z");
  const decision = decideFlowSend(gate({ now, lastFlowEmailAt: null }));
  assert.equal(decision.kind, "send");
});

// ---------------------------------------------------------------------------
// REGLA 3 · Un socio no repite el mismo flujo hasta 90 días después
// ---------------------------------------------------------------------------

test("regla 3 · no se repite flujo antes de 90 días, y a los 90 justos sí", () => {
  const now = new Date("2026-09-16T09:00:00.000Z");
  assert.equal(canEnrollAgain(null, now), true);
  assert.equal(canEnrollAgain(new Date(now.getTime() - 89 * DAY), now), false);
  assert.equal(canEnrollAgain(new Date(now.getTime() - FLOW_REENTRY_DAYS * DAY), now), true);
});

test("regla 3 · la fecha de reentrada se puede explicar en pantalla", () => {
  const entro = new Date("2026-06-01T09:00:00.000Z");
  assert.equal(reentryAvailableAt(entro).getTime(), entro.getTime() + FLOW_REENTRY_DAYS * DAY);
});

// ---------------------------------------------------------------------------
// REGLA 4 · Pausa global
// ---------------------------------------------------------------------------

test("regla 4 · la pausa global para TODO, y lo encolado no se pierde", () => {
  // `hold` y no `skip`: el paso no se ejecuta, pero tampoco se descarta ni se
  // reprograma. `nextRunAt` se queda donde estaba y se reanuda al despausar.
  const decision = decideFlowSend(gate({ flowsPausedAt: new Date("2026-09-16T08:00:00.000Z") }));
  assert.equal(decision.kind, "hold");
  assert.equal(decision.kind === "hold" && decision.reason, "paused");
});

test("regla 4 · la pausa gana incluso a un socio sin consentimiento", () => {
  // El orden importa: parar es parar, y la pausa se comprueba antes que nada.
  // Si el consentimiento fuera primero, la pausa cerraría inscripciones que
  // luego no se podrían reanudar.
  const decision = decideFlowSend(
    gate({ flowsPausedAt: new Date(), prefs: prefs({ consentMarketing: false }) })
  );
  assert.equal(decision.kind, "hold");
});

test("regla 4 · un flujo pausado se detiene aunque el módulo entero siga activo", () => {
  const decision = decideFlowSend(gate({ flowStatus: "PAUSED" }));
  assert.equal(decision.kind, "hold");
  assert.equal(decision.kind === "hold" && decision.reason, "flow_paused");
});

test("regla 4 · al despausar, la misma cola vuelve a salir sin haber perdido nada", () => {
  const encolado = gate({ flowsPausedAt: new Date("2026-09-16T08:00:00.000Z") });
  assert.equal(decideFlowSend(encolado).kind, "hold");

  const despausado = decideFlowSend({ ...encolado, flowsPausedAt: null });
  assert.equal(despausado.kind, "send");
});

// ---------------------------------------------------------------------------
// REGLA 5 · Modo borrador
// ---------------------------------------------------------------------------

test("regla 5 · el borrador se ejecuta de verdad, pero TODO envío va al email de pruebas", () => {
  const decision = decideFlowSend(gate({ flowStatus: "DRAFT" }));
  assert.equal(decision.kind, "send");
  if (decision.kind !== "send") return;
  assert.equal(decision.toEmail, "pruebas@trainingzone.es");
  assert.equal(decision.testMode, true);
});

test("regla 5 · lo enviado en borrador NO consume cupo del socio", () => {
  const decision = decideFlowSend(gate({ flowStatus: "DRAFT" }));
  assert.equal(decision.kind === "send" && decision.countsTowardCap, false);
});

test("regla 5 · y tampoco lo frena el cupo: el socio no recibió nada", () => {
  const now = new Date("2026-09-16T09:00:00.000Z");
  const decision = decideFlowSend(gate({ now, flowStatus: "DRAFT", lastFlowEmailAt: now }));
  assert.equal(decision.kind, "send");
});

test("regla 5 · sin email de pruebas configurado, el borrador no manda nada", () => {
  const decision = decideFlowSend(gate({ flowStatus: "DRAFT", testEmail: null }));
  assert.equal(decision.kind, "skip");
  assert.equal(decision.kind === "skip" && decision.reason, "no_test_email");
});

test("regla 5 · el borrador tampoco escribe por quien no ha consentido", () => {
  // El ensayo tiene que decir la verdad sobre a cuánta gente alcanzaría el
  // flujo. Si el borrador ignorara el consentimiento, el recuento del ensayo
  // sería mayor que el real y la primera activación mandaría menos correos de
  // los prometidos... o peor, se daría por bueno un flujo ilegal.
  const decision = decideFlowSend(gate({ flowStatus: "DRAFT", prefs: prefs({ consentMarketing: false }) }));
  assert.equal(decision.kind, "skip");
  assert.equal(decision.kind === "skip" && decision.reason, "no_marketing_consent");
});

// ---------------------------------------------------------------------------
// REGLA 6 · canSendMemberEmail("marketing", …), que ya es ley
// ---------------------------------------------------------------------------

test("regla 6 · sin consentMarketing no sale, y no es un aplazamiento", () => {
  const decision = decideFlowSend(gate({ prefs: prefs({ consentMarketing: false }) }));
  assert.equal(decision.kind, "skip");
  assert.equal(decision.kind === "skip" && decision.reason, "no_marketing_consent");
});

test("regla 6 · la baja global gana aunque el interruptor de marketing siga en true", () => {
  const decision = decideFlowSend(
    gate({ prefs: prefs({ consentMarketing: true, emailOptOutAt: new Date("2026-01-01") }) })
  );
  assert.equal(decision.kind, "skip");
  assert.equal(decision.kind === "skip" && decision.reason, "no_marketing_consent");
});

test("regla 6 · un socio sin email no recibe nada y no bloquea la cola", () => {
  const decision = decideFlowSend(gate({ memberEmail: null }));
  assert.equal(decision.kind, "skip");
  assert.equal(decision.kind === "skip" && decision.reason, "no_member_email");
});

// ---------------------------------------------------------------------------
// La espera del paso siguiente
// ---------------------------------------------------------------------------

test("la espera de X días sale de la ventana de silencio antes de encolarse", () => {
  // Paso a 2 días de un envío hecho a las 23:00 de pared: la suma cae otra vez
  // de noche, y lo que se encola son las 8:00.
  const from = new Date("2026-09-16T21:00:00.000Z");
  const runAt = nextStepRunAt(from, 2, MADRID);
  assert.equal(isWithinQuietHours(runAt, MADRID), false);
  assert.equal(runAt.toISOString(), "2026-09-19T06:00:00.000Z");
});

test("espera 0 significa «en la misma pasada», no «mándalo de noche»", () => {
  const deNoche = new Date("2026-09-16T21:00:00.000Z");
  assert.equal(nextStepRunAt(deNoche, 0, MADRID).toISOString(), "2026-09-17T06:00:00.000Z");

  const deDia = new Date("2026-09-16T10:00:00.000Z");
  assert.equal(nextStepRunAt(deDia, 0, MADRID).getTime(), deDia.getTime());
});

test("una espera negativa no viaja al pasado", () => {
  const now = new Date("2026-09-16T10:00:00.000Z");
  assert.ok(nextStepRunAt(now, -5, MADRID).getTime() >= now.getTime());
});
