import type { FlowStatus } from "@prisma/client";

import { zonedTimeToInstant } from "@/lib/date-utils";
import { canSendMemberEmail, type MemberEmailPreferences } from "@/lib/email-preferences";

/**
 * ============ E2 · LAS SEIS REGLAS DE SEGURIDAD, EN LÓGICA PURA ============
 *
 * Este módulo NO toca la base de datos y NO lee el reloj del sistema: todo
 * entra como parámetro, el instante incluido. Es a propósito — las reglas se
 * prueban con el reloj inyectado y con los casos malos dentro (dos flujos
 * disparando el mismo minuto, el cron a las 23:00, un socio sin
 * `consentMarketing`, la pausa global a mitad de cola y el cambio de hora), y
 * ninguna de esas pruebas necesita una base de datos que ensuciar.
 *
 * `engine.ts` es quien lee, escribe y reserva el hueco en una transacción.
 * Aquí solo se DECIDE.
 *
 *  1. MÁXIMO 1 EMAIL POR SOCIO Y SEMANA, ENTRE TODOS LOS FLUJOS  → `weeklyCapBlockedUntil`
 *  2. NADA ENTRE 22:00 Y 8:00, EN LA HORA DEL CENTRO             → `nextAllowedSendAt`
 *  3. UN SOCIO NO REPITE EL MISMO FLUJO HASTA 90 DÍAS DESPUÉS    → `canEnrollAgain`
 *  4. PAUSA GLOBAL                                               → `decideFlowSend`, rama `hold`
 *  5. MODO BORRADOR                                              → `resolveRecipient`
 *  6. `canSendMemberEmail("marketing", …)`, que ya es ley        → `decideFlowSend`
 *
 * LOS TOPES NO SON COLUMNAS CONFIGURABLES (D-L3-7). Son constantes de este
 * fichero: una regla de seguridad que se afloja desde una pantalla deja de
 * serlo.
 */

/* ------------------------------------------------------------------------- *
 * Las constantes de las reglas
 * ------------------------------------------------------------------------- */

/** Regla 1. Un correo de flujo por socio cada siete días naturales. */
export const WEEKLY_EMAIL_CAP_DAYS = 7;

/** Regla 2. Silencio nocturno, en la hora DEL CENTRO. */
export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 8;

/** Regla 3. Un socio no vuelve a entrar en el MISMO flujo antes de 90 días. */
export const FLOW_REENTRY_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * QUÉ CUENTA PARA EL TOPE SEMANAL. Escrito aquí, en el código, y no en la
 * cabeza de nadie — que es exactamente lo que pedía el encargo:
 *
 *   CUENTA: el correo que sale de un flujo y LLEGA AL SOCIO
 *           (`FlowEmailLog` con `testMode = false`).
 *
 *   NO CUENTA: el correo transaccional que ya existe —recordatorio de sesión,
 *   preaviso SEPA, cobro fallido, enlace de pago, restablecer contraseña—. Es
 *   la EJECUCIÓN DEL SERVICIO CONTRATADO, no una comunicación comercial:
 *   silenciarlo dejaría al socio sin poder pagar ni entrar, y por eso ni pasa
 *   por aquí ni se registra en `FlowEmailLog`. Ese correo tampoco pasa por
 *   `canSendMemberEmail`, por la misma razón y desde antes de este módulo.
 *
 *   NO CUENTA TAMPOCO: lo que va al buzón de pruebas del modo borrador. Se
 *   registra —el panel y la depuración lo necesitan— pero no llegó al socio, y
 *   un cupo que se gasta ensayando no protege a nadie.
 *
 * Si algún día el tope tuviera que contar también el correo transaccional, eso
 * es una DECISIÓN DE NEGOCIO y no de ingeniería: se cambia esta frase primero.
 */
export const WEEKLY_CAP_DEFINITION =
  "Cuenta para el tope el correo de flujo que llega al socio. El correo transaccional " +
  "(recordatorio de sesión, preaviso SEPA, cobro fallido) NO cuenta: es la ejecución del " +
  "servicio contratado, no una comunicación comercial. El modo borrador tampoco: no llegó al socio.";

/* ------------------------------------------------------------------------- *
 * REGLA 2 · La ventana de silencio, en la hora del centro
 * ------------------------------------------------------------------------- */

/** Hora y día de pared de `timeZone` en un instante dado. Sin reloj del sistema. */
function wallClock(instant: Date, timeZone: string): { day: Date; hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return {
      // Día suelto con componentes locales del servidor, que es la codificación
      // que espera `zonedTimeToInstant` (ver la nota larga de `date-utils.ts`).
      day: new Date(get("year"), get("month") - 1, get("day")),
      // `hour12: false` devuelve 24 (no 0) para la medianoche en algunas versiones de ICU.
      hour: get("hour") % 24,
      minute: get("minute"),
    };
  } catch {
    // Zona inválida: se decide con la del servidor antes que no decidir. Que la
    // ventana se lea mal es malo; que el motor reviente y nadie reciba nada, peor.
    const day = new Date(instant.getFullYear(), instant.getMonth(), instant.getDate());
    return { day, hour: instant.getHours(), minute: instant.getMinutes() };
  }
}

/** ¿Cae este instante dentro del silencio nocturno del centro? */
export function isWithinQuietHours(instant: Date, timeZone: string): boolean {
  const { hour } = wallClock(instant, timeZone);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

/**
 * El primer instante en que SE PUEDE enviar, a partir de `instant`.
 *
 * Es lo que convierte el motor en una COLA y no en un «enviar ahora»: el cron
 * puede pasar a las 23:00 y lo que toque entonces se reprograma a las 8:00 del
 * día siguiente — ni se manda ni se pierde.
 *
 * La hora es la DEL CENTRO y sale de `Center.timezone` vía `zonedTimeToInstant`,
 * que hace doble pasada para los cambios de hora. No la del servidor: en
 * producción corre en UTC y la ventana de cancelación ya se leyó mal una vez
 * por esto.
 */
export function nextAllowedSendAt(instant: Date, timeZone: string): Date {
  const { day, hour } = wallClock(instant, timeZone);
  if (hour >= QUIET_HOURS_END && hour < QUIET_HOURS_START) return instant;

  // Antes de las 8:00 → hoy a las 8:00. A partir de las 22:00 → mañana a las 8:00.
  const target = new Date(day);
  if (hour >= QUIET_HOURS_START) target.setDate(target.getDate() + 1);

  // El día del cambio de hora, el instante de apertura calculado puede caer
  // antes del de partida (el reloj salta hacia atrás). Se empuja al día
  // siguiente en vez de devolver un instante pasado, que haría que el cron
  // mandase de noche. Dos intentos bastan: ningún cambio de hora mueve 24 h.
  for (let attempt = 0; attempt < 2; attempt++) {
    const opening = zonedTimeToInstant(target, `${String(QUIET_HOURS_END).padStart(2, "0")}:00`, timeZone);
    if (opening.getTime() > instant.getTime()) return opening;
    target.setDate(target.getDate() + 1);
  }
  return new Date(instant.getTime() + DAY_MS);
}

/* ------------------------------------------------------------------------- *
 * REGLA 1 · El tope semanal
 * ------------------------------------------------------------------------- */

/**
 * Hasta cuándo bloquea el tope, o `null` si hay hueco.
 *
 * `lastSentAt` es el ÚLTIMO correo de flujo que llegó de verdad al socio, entre
 * todos los flujos. Es un cerrojo GLOBAL: si cada flujo mirase solo lo suyo,
 * dos flujos que coinciden mandarían dos correos y la promesa se rompe el
 * primer martes.
 */
export function weeklyCapBlockedUntil(lastSentAt: Date | null, now: Date): Date | null {
  if (!lastSentAt) return null;
  const freeAt = new Date(lastSentAt.getTime() + WEEKLY_EMAIL_CAP_DAYS * DAY_MS);
  return freeAt.getTime() > now.getTime() ? freeAt : null;
}

/* ------------------------------------------------------------------------- *
 * REGLA 3 · Los 90 días de reentrada
 * ------------------------------------------------------------------------- */

/** ¿Puede este socio volver a entrar en ESTE flujo? */
export function canEnrollAgain(lastEnrolledAt: Date | null, now: Date): boolean {
  if (!lastEnrolledAt) return true;
  return now.getTime() - lastEnrolledAt.getTime() >= FLOW_REENTRY_DAYS * DAY_MS;
}

/** Cuándo vuelve a poder entrar. Para explicarlo en pantalla, no para decidir. */
export function reentryAvailableAt(lastEnrolledAt: Date): Date {
  return new Date(lastEnrolledAt.getTime() + FLOW_REENTRY_DAYS * DAY_MS);
}

/* ------------------------------------------------------------------------- *
 * EL PUNTO ÚNICO DE SALIDA · la decisión completa
 * ------------------------------------------------------------------------- */

export type FlowSendGate = {
  /** El reloj, INYECTADO. Aquí no se llama nunca a `new Date()`. */
  now: Date;
  /** `Center.timezone` de la inscripción, no la del servidor. */
  timeZone: string;
  /** Regla 4 · `Organization.flowsPausedAt`. */
  flowsPausedAt: Date | null;
  /** Regla 5 · un flujo en `DRAFT` se ejecuta de verdad, pero escribe al buzón de pruebas. */
  flowStatus: FlowStatus;
  /** Regla 5 · `Organization.flowsTestEmail`. */
  testEmail: string | null;
  /** A dónde iría de verdad: el correo del socio. */
  memberEmail: string | null;
  /** Regla 6 · los interruptores del socio (`MEMBER_EMAIL_PREFERENCES_SELECT`). */
  prefs: MemberEmailPreferences;
  /** Regla 1 · último correo de flujo que LLEGÓ al socio, entre todos los flujos. */
  lastFlowEmailAt: Date | null;
};

export type FlowHoldReason = "paused" | "flow_paused";

export type FlowDeferReason = "quiet_hours" | "weekly_cap";

export type FlowSkipReason =
  | "no_marketing_consent"
  | "no_member_email"
  | "no_test_email";

export type FlowSendDecision =
  /** Sale. `countsTowardCap` es lo que decide si reserva el hueco de la semana. */
  | { kind: "send"; toEmail: string; testMode: boolean; countsTowardCap: true | false }
  /** No sale ahora pero SIGUE EN LA COLA: se reprograma a `runAt`. */
  | { kind: "defer"; runAt: Date; reason: FlowDeferReason }
  /** Ni sale ni se mueve: `nextRunAt` se queda donde estaba y se reanuda solo. */
  | { kind: "hold"; reason: FlowHoldReason }
  /** No sale y este paso se da por cerrado: la situación no cambia esperando. */
  | { kind: "skip"; reason: FlowSkipReason };

export const FLOW_DECISION_LABEL: Record<FlowDeferReason | FlowHoldReason | FlowSkipReason, string> = {
  paused: "Pausa global del módulo",
  flow_paused: "El flujo está pausado",
  quiet_hours: "Ventana de silencio (22:00–8:00 del centro)",
  weekly_cap: "Tope de 1 email por socio y semana",
  no_marketing_consent: "Sin consentimiento de marketing o dado de baja",
  no_member_email: "El socio no tiene email",
  no_test_email: "Modo borrador sin email de pruebas configurado",
};

/**
 * LA ÚNICA PUERTA. Todo envío de flujo pasa por aquí, y el orden de las
 * comprobaciones no es casual:
 *
 *  1. La PAUSA GLOBAL (y el flujo pausado) es un `hold`, no un `skip`: lo
 *     encolado no se pierde, `nextRunAt` se queda donde estaba y se reanuda
 *     solo al despausar.
 *  2. El CONSENTIMIENTO va antes que el resto porque su respuesta no cambia
 *     esperando: un socio sin `consentMarketing` no va a recibir este correo
 *     hoy ni dentro de tres días, y dejarlo dando vueltas por la cola solo
 *     sirve para volver a preguntar lo mismo cada noche. Se comprueba TAMBIÉN
 *     en modo borrador: el borrador ensaya lo que pasaría de verdad, y un
 *     ensayo que escribe por quien no ha consentido miente sobre el alcance
 *     real del flujo.
 *  3. El SILENCIO NOCTURNO y el TOPE SEMANAL son aplazamientos: la situación sí
 *     cambia con el tiempo.
 *  4. El tope semanal NO aplica al modo borrador: el correo no llega al socio,
 *     así que ni consume cupo ni puede ser frenado por él.
 */
export function decideFlowSend(gate: FlowSendGate): FlowSendDecision {
  // Regla 4 · pausa global. Antes que nada: parar es parar.
  if (gate.flowsPausedAt) return { kind: "hold", reason: "paused" };
  if (gate.flowStatus === "PAUSED") return { kind: "hold", reason: "flow_paused" };

  // Regla 6 · la que ya es ley (art. 21 RGPD, art. 21 LSSI). El enlace de baja
  // lo pone el pie de la plantilla y las cabeceras `List-Unsubscribe` las pone
  // `mailer.ts`: aquí no se monta un segundo sistema de bajas.
  if (!canSendMemberEmail("marketing", gate.prefs)) {
    return { kind: "skip", reason: "no_marketing_consent" };
  }

  // Regla 5 · modo borrador.
  const testMode = gate.flowStatus === "DRAFT";
  const toEmail = testMode ? gate.testEmail?.trim() : gate.memberEmail?.trim();
  if (!toEmail) return { kind: "skip", reason: testMode ? "no_test_email" : "no_member_email" };

  // Regla 1 · el cerrojo global, solo para lo que llega de verdad al socio.
  if (!testMode) {
    const blockedUntil = weeklyCapBlockedUntil(gate.lastFlowEmailAt, gate.now);
    if (blockedUntil) {
      return { kind: "defer", runAt: nextAllowedSendAt(blockedUntil, gate.timeZone), reason: "weekly_cap" };
    }
  }

  // Regla 2 · la ventana de silencio, al final: es la que fija la hora exacta.
  const sendableAt = nextAllowedSendAt(gate.now, gate.timeZone);
  if (sendableAt.getTime() > gate.now.getTime()) {
    return { kind: "defer", runAt: sendableAt, reason: "quiet_hours" };
  }

  return { kind: "send", toEmail, testMode, countsTowardCap: !testMode };
}

/**
 * Cuándo toca el paso siguiente: la ESPERA del paso, ya sacada de la ventana de
 * silencio. `waitDays = 0` significa «en la misma pasada», que con el silencio
 * delante puede seguir siendo mañana a las 8:00.
 */
export function nextStepRunAt(from: Date, waitDays: number, timeZone: string): Date {
  const due = new Date(from.getTime() + Math.max(0, waitDays) * DAY_MS);
  return nextAllowedSendAt(due, timeZone);
}
