import type { FlowBranch } from "@prisma/client";

/**
 * E2 · Las RAMAS: si hace clic, si responde, si no responde en X días.
 *
 * Pura y con el reloj inyectado, como el resto de decisiones del motor.
 *
 * ┌─ LO QUE HAY QUE SABER ANTES DE MONTAR UNA RAMA DE RESPUESTA ─────────────┐
 * │ «SI HACE CLIC» TIENE SEÑAL: el enlace es nuestro y el clic lo anota       │
 * │ `/api/flujos/clic/[token]` sobre `FlowEmailLog.clickedAt`. Funciona sola. │
 * │                                                                          │
 * │ «SI RESPONDE» NO LA TIENE, y se dice aquí antes que en ningún sitio: en   │
 * │ este repositorio NO hay recepción de correo entrante. `mailer.ts` manda   │
 * │ por la API de Brevo y pone un `Reply-To` del centro, así que la respuesta │
 * │ del socio llega al buzón del gimnasio y no a la aplicación. `repliedAt`   │
 * │ solo lo puede marcar una persona (`markFlowEmailReplied`).                │
 * │                                                                          │
 * │ CONSECUENCIA, dicha y no escondida: mientras nadie marque la respuesta a  │
 * │ mano, «si no responde en X días» se cumple para TODO EL MUNDO, también    │
 * │ para quien contestó. El editor lo avisa al elegir esas dos ramas. No se   │
 * │ inventa una señal que no existe: eso sería peor que no tener la rama.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type FlowBranchSignals = {
  /** Cuándo salió el correo del que cuelgan las ramas. */
  sentAt: Date;
  clickedAt: Date | null;
  repliedAt: Date | null;
  /** El X de «si no responde en X días». Null = esa rama no está montada. */
  branchAfterDays: number | null;
};

const DAY_MS = 86_400_000;

/**
 * A qué rama se pasa el socio, o `null` para seguir en el tronco.
 *
 * EL CLIC MANDA SOBRE LA RESPUESTA cuando las dos están montadas, y no es
 * arbitrario: el clic es la única de las dos que el sistema detecta solo, así
 * que es la que puede llegar a tiempo. Una respuesta marcada a mano tres días
 * después no debería reabrir un flujo que ya avanzó.
 */
export function resolveBranchSwitch(
  signals: FlowBranchSignals,
  availableBranches: FlowBranch[],
  now: Date
): FlowBranch | null {
  const has = (branch: FlowBranch) => availableBranches.includes(branch);

  if (signals.clickedAt && has("ON_CLICK")) return "ON_CLICK";
  if (signals.repliedAt && has("ON_REPLY")) return "ON_REPLY";

  if (has("ON_NO_REPLY") && !signals.repliedAt && signals.branchAfterDays !== null) {
    const deadline = signals.sentAt.getTime() + Math.max(0, signals.branchAfterDays) * DAY_MS;
    if (now.getTime() >= deadline) return "ON_NO_REPLY";
  }

  return null;
}

/**
 * Cuándo hay que volver a mirar este correo por si hay que ramificar. Es lo que
 * impide que el motor tenga que despertar cada hora: si nadie ha reaccionado,
 * lo siguiente que puede pasar es que venza el plazo de «no responde».
 */
export function branchDeadline(signals: FlowBranchSignals): Date | null {
  if (signals.branchAfterDays === null) return null;
  return new Date(signals.sentAt.getTime() + Math.max(0, signals.branchAfterDays) * DAY_MS);
}

/**
 * ¿Merece la pena esperar a una reacción antes de seguir por el tronco? Solo si
 * el flujo tiene alguna rama montada: si no, el tronco sigue su curso.
 */
export function hasBranches(availableBranches: FlowBranch[]): boolean {
  return availableBranches.some((b) => b !== "MAIN");
}
