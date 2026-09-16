/**
 * R1 · La parte de los referidos que **no habla con la base de datos**: los
 * estados derivados, el formato del código, los rótulos, la validación del
 * programa de un centro y LAS TRES REGLAS ANTIFRAUDE.
 *
 * Vive aparte de `referrals.ts` y `referral-rewards.ts` por el mismo motivo
 * concreto que `coupon-code.ts` vive aparte de `stripe-coupons.ts`, y que
 * `tags.ts` de `tags-queries.ts`: el formulario del programa y el panel del
 * socio son COMPONENTES DE CLIENTE, y si importaran la validación o los
 * rótulos de un módulo con `prisma` dentro, el build de Next arrastraría
 * Prisma —y `pg` con él— al bundle del navegador. No es una hipótesis: el
 * build lo corta en seco, y hace bien.
 *
 * Los dos módulos de servidor REEXPORTAN todo esto, así que los call sites del
 * servidor siguen buscándolo en un solo sitio y la regla sigue siendo una sola
 * —que es lo que importa: si el cliente validara distinto que el servidor, el
 * formulario aceptaría programas que la escritura rechaza.
 *
 * Y hay una segunda razón, esta de fondo: EL ANTIFRAUDE DECIDE DINERO, y aquí
 * no tiene ni cómo ir a buscar un dato. Recibe hechos y devuelve un veredicto.
 * Eso es lo que permite probar los casos sucios —el excliente de cinco meses y
 * veintinueve días, el importado sin fecha de baja, el referido que se da de
 * alta dos veces— sin sembrar una base de datos.
 */
import type { LeadStatus, MemberState, ReferralRewardBeneficiary, ReferralRewardKind } from "@prisma/client";

import { normalizeCouponCode } from "@/lib/coupon-code";

/* ------------------------------------------------------------------------- *
 * El canal
 * ------------------------------------------------------------------------- */

/**
 * `Lead.channel` es TEXTO y casa con `LeadChannel.label` (RB-LEAD-004): el
 * canal "Referido" no necesita tabla ni enum, solo existir en el catálogo de la
 * organización para que el listado de leads y la distribución por canal lo
 * agrupen con los demás en vez de enseñarlo como un valor huérfano.
 */
export const REFERRAL_LEAD_CHANNEL = "Referido";

/* ------------------------------------------------------------------------- *
 * LOS ESTADOS · se derivan del lead, en un solo sitio
 * ------------------------------------------------------------------------- */

/**
 * invitado → valoración hecha → alta, más el desenlace que el embudo ya tiene y
 * que el panel necesita para no contar como "invitado" a quien dijo que no.
 */
export type ReferralState = "INVITADO" | "VALORACION_HECHA" | "ALTA" | "DESCARTADO";

export const REFERRAL_STATE_LABEL: Record<ReferralState, string> = {
  INVITADO: "Invitado",
  VALORACION_HECHA: "Valoración hecha",
  ALTA: "Alta",
  DESCARTADO: "No cerrado",
};

/** Orden de recorrido, para pintar el embudo sin inventarse otro. */
export const REFERRAL_STATES: ReferralState[] = ["INVITADO", "VALORACION_HECHA", "ALTA", "DESCARTADO"];

/**
 * LA ÚNICA derivación del estado de un referido (E14-31). El panel y la
 * recompensa la llaman; ninguno de los dos la recalcula por su cuenta.
 *
 * Qué mira, y por qué así:
 *  · ALTA exige `status = CERRADO` **y** `convertedMemberId`. Entre
 *    `initiateLeadConversion` (que escribe el socio y deja el lead en
 *    SEGUIMIENTO) y `confirmLeadClosureForMember` (que cierra al cobrar) hay un
 *    alta EN CURSO que todavía puede caerse: `revertLeadClosureForFailedPayment`
 *    existe justamente para eso. Liberar la recompensa ahí sería pagar por un
 *    alta que no llegó a serlo.
 *  · CON_FECHA_VALORACION ya ES "valoración hecha": lo dice el propio embudo, y
 *    por eso no hay columna nueva. Un alta en curso también ha pasado por ahí.
 *  · NO_CERRADO es un desenlace, no un invitado que sigue vivo.
 */
export function referralStateOf(lead: { status: LeadStatus; convertedMemberId: string | null }): ReferralState {
  if (lead.status === "CERRADO" && lead.convertedMemberId) return "ALTA";
  if (lead.status === "NO_CERRADO") return "DESCARTADO";
  // Un CERRADO sin socio no puede salir de los caminos de `leads-queries.ts`;
  // si aparece, no es un alta —no hay a quién dar de alta— y se queda aquí.
  if (lead.status === "CERRADO" || lead.status === "CON_FECHA_VALORACION" || lead.convertedMemberId) {
    return "VALORACION_HECHA";
  }
  return "INVITADO";
}

/* ------------------------------------------------------------------------- *
 * El código y su enlace
 * ------------------------------------------------------------------------- */

/**
 * Alfabeto del tramo aleatorio. Sin `0/O`, `1/I/L` ni `U`: el código se dicta
 * por teléfono y se teclea en un móvil, y `TZ-ANA-1I0O` es una llamada a
 * recepción asegurada. `normalizeCouponCode` ya pasa a mayúsculas y quita
 * acentos, así que aquí solo queda elegir qué letras no se confunden.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const CODE_SUFFIX_LENGTH = 5;
/** Tramo legible del código: el nombre de quien invita, recortado. */
const CODE_STEM_MAX = 10;

/**
 * "Ana" + "K7M3P" → "ANA-K7M3P". El tramo legible es cortesía —quien comparte
 * el enlace se reconoce en él—; la unicidad la sostiene el sufijo y, en última
 * instancia, el `@unique` de `ReferralCode.code`.
 *
 * La normalización sale de `coupon-code.ts` y no se reinventa: es la misma
 * regla que ya decide qué es un código válido en esta casa (letras, dígitos y
 * guiones, sin acentos ni espacios).
 */
export function buildReferralCode(firstName: string, suffix: string): string {
  const stem = normalizeCouponCode(firstName).replace(/[^A-Z0-9]/g, "").slice(0, CODE_STEM_MAX);
  return stem ? `${stem}-${suffix}` : suffix;
}

/** Lo que `/r/[code]` acepta como código. Se comprueba antes de ir a la base. */
export function isWellFormedReferralCode(code: string): boolean {
  const normalized = normalizeCouponCode(code);
  return normalized.length >= CODE_SUFFIX_LENGTH && normalized.length <= 40 && /^[A-Z0-9-]+$/.test(normalized);
}

/** La ruta pública del enlace. Un solo sitio: la web y la app comparten enlace. */
export function referralLinkPath(code: string): string {
  return `/r/${code}`;
}

/**
 * El enlace entero, para copiar al portapapeles y para el correo de los 90 días.
 * `origin` lo pone quien llama (la petición en la web, la configuración en la
 * app): este módulo no adivina el dominio del centro.
 */
export function referralLinkUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}${referralLinkPath(code)}`;
}

/**
 * Estados de socio que pueden invitar. Un excliente no invita a nadie —su
 * código está revocado (antifraude 3)— y un `PROSPECT` todavía no es socio.
 * `FROZEN` y `DELINQUENT` sí: siguen siendo socios de la casa, y quitarles el
 * enlace por estar de vacaciones o por un recibo devuelto sería un castigo que
 * nadie pidió.
 */
export const AMBASSADOR_STATES: MemberState[] = ["ACTIVE", "FROZEN", "DELINQUENT", "TRIAL"];

export function canBeAmbassador(state: MemberState): boolean {
  return AMBASSADOR_STATES.includes(state);
}

/* ------------------------------------------------------------------------- *
 * Rótulos de la recompensa
 * ------------------------------------------------------------------------- */

/** Los tres estados (más el desenlace de "no"), para las pantallas. */
export const REWARD_STATUS_LABEL = {
  PENDING_VALIDATION: "Pendiente de validar",
  VALIDATED: "Validada",
  PAID: "Pagada",
  REJECTED: "Rechazada",
} as const;

export type RewardStatusKey = keyof typeof REWARD_STATUS_LABEL;

export const BENEFICIARY_LABEL: Record<ReferralRewardBeneficiary, string> = {
  REFERRER: "Quien trae",
  REFERRED: "Quien entra",
};

/** El texto del importe o de las sesiones, que es lo que lee quien valida. */
export function rewardAmountLabel(reward: {
  kind: ReferralRewardKind;
  amountCents: number | null;
  sessions: number | null;
}): string {
  if (reward.kind === "FIXED_AMOUNT") {
    return ((reward.amountCents ?? 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  }
  const n = reward.sessions ?? 0;
  return `${n} ${n === 1 ? "sesión suelta" : "sesiones sueltas"}`;
}

/* ------------------------------------------------------------------------- *
 * El programa de un centro
 * ------------------------------------------------------------------------- */

export type ProgramConfigView = {
  centerId: string;
  active: boolean;
  referrerKind: ReferralRewardKind;
  referrerAmountCents: number | null;
  referrerSessions: number | null;
  referredKind: ReferralRewardKind | null;
  referredAmountCents: number | null;
  referredSessions: number | null;
  exMemberCooldownDays: number;
};

/** Los valores de salida cuando un centro todavía no ha configurado nada. */
export const DEFAULT_PROGRAM: Omit<ProgramConfigView, "centerId"> = {
  active: false,
  referrerKind: "FIXED_AMOUNT",
  referrerAmountCents: null,
  referrerSessions: null,
  referredKind: null,
  referredAmountCents: null,
  referredSessions: null,
  exMemberCooldownDays: 180,
};

export type SaveProgramInput = {
  active: boolean;
  referrerKind: ReferralRewardKind;
  referrerAmountCents: number | null;
  referrerSessions: number | null;
  /** `null` = programa a una cara: quien entra no se lleva nada. */
  referredKind: ReferralRewardKind | null;
  referredAmountCents: number | null;
  referredSessions: number | null;
  exMemberCooldownDays: number;
};

/**
 * La misma regla la comprueba el formulario mientras se teclea y el servidor
 * antes de escribir. Una sola función, por lo mismo que la normalización del
 * código: dos validaciones distintas son dos criterios distintos.
 */
export function validateProgramInput(input: SaveProgramInput): { ok: true } | { ok: false; error: string } {
  const sideOk = (kind: ReferralRewardKind, cents: number | null, sessions: number | null, who: string) => {
    if (kind === "FIXED_AMOUNT") {
      if (!Number.isInteger(cents) || (cents as number) <= 0) return `Indica el importe para ${who}.`;
    } else if (!Number.isInteger(sessions) || (sessions as number) <= 0) {
      return `Indica cuántas sesiones para ${who}.`;
    }
    return null;
  };

  const referrerError = sideOk(input.referrerKind, input.referrerAmountCents, input.referrerSessions, "quien trae");
  if (referrerError) return { ok: false, error: referrerError };

  if (input.referredKind) {
    const referredError = sideOk(input.referredKind, input.referredAmountCents, input.referredSessions, "quien entra");
    if (referredError) return { ok: false, error: referredError };
  }

  if (!Number.isInteger(input.exMemberCooldownDays) || input.exMemberCooldownDays < 0) {
    return { ok: false, error: "La ventana del excliente son días completos, y no puede ser negativa." };
  }
  return { ok: true };
}

/* ========================================================================= *
 * ANTIFRAUDE · las tres reglas, sin base de datos
 * ========================================================================= */

/**
 * Qué se hace con un alta concreta:
 *  · `ALLOW`  — se libera la recompensa y su tarea.
 *  · `REVIEW` — se libera IGUALMENTE, marcada `reviewRequired` con su motivo,
 *    y la tarea lo dice en el título. Es el desenlace de "no se puede saber":
 *    sobre un hueco no se automatiza una decisión que reparte dinero, pero
 *    tampoco se tira a la basura el trabajo de un socio sin que nadie lo mire.
 *  · `BLOCK`  — no se escribe recompensa ninguna. El motivo queda en `AuditLog`
 *    para que se pueda contestar «¿por qué a mi amigo no le contó?».
 */
export type FraudDecision = "ALLOW" | "REVIEW" | "BLOCK";

export type FraudVerdict = { decision: FraudDecision; reason: string | null };

const ALLOW: FraudVerdict = { decision: "ALLOW", reason: null };
const review = (reason: string): FraudVerdict => ({ decision: "REVIEW", reason });
const block = (reason: string): FraudVerdict => ({ decision: "BLOCK", reason });

/** Lo mala que es cada decisión. `BLOCK` gana a `REVIEW`, y `REVIEW` a `ALLOW`. */
const SEVERITY: Record<FraudDecision, number> = { ALLOW: 0, REVIEW: 1, BLOCK: 2 };

/**
 * El veredicto conjunto de las tres reglas. Gana la más restrictiva, y los
 * motivos de las que empatan se acumulan: quien valida a mano quiere ver los
 * dos, no el primero que saltó.
 */
export function combineVerdicts(verdicts: FraudVerdict[]): FraudVerdict {
  const worst = verdicts.reduce((acc, v) => (SEVERITY[v.decision] > SEVERITY[acc.decision] ? v : acc), ALLOW);
  if (worst.decision === "ALLOW") return ALLOW;
  const reasons = verdicts.filter((v) => v.decision === worst.decision && v.reason).map((v) => v.reason as string);
  return { decision: worst.decision, reason: reasons.join(" · ") || null };
}

export const MS_PER_DAY = 86_400_000;

/** Días completos entre dos instantes. Se redondea hacia abajo a propósito. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Lo que se sabe de la persona que entra, cuando resulta que YA existía una
 * ficha suya en la casa. `null` = nadie con su email ni su teléfono: es un alta
 * nueva de verdad y no hay nada que comprobar.
 */
export type PriorMemberFacts = {
  id: string;
  state: MemberState;
  /** La fecha de la baja. Puede faltar en los IMPORTADOS, y ahí está el problema. */
  cancelledAt: Date | null;
  /** "Identificador de la nube" del origen. No nulo ⇒ vino de otra plataforma. */
  externalRef: string | null;
  externalSource: string | null;
  lastAccessAt: Date | null;
  accountCreatedAt: Date | null;
};

/**
 * ANTIFRAUDE 1 · un excliente que se fue hace menos de la ventana configurada
 * NO cuenta como alta nueva.
 *
 * `cooldownDays` sale de `ReferralProgramConfig.exMemberCooldownDays` (180 por
 * defecto), NO de un literal de seis meses aquí: lo que se paga por traer a
 * alguien —y cuándo alguien deja de ser "de la casa"— lo decide quien dirige el
 * centro, igual que `Organization.dunningGraceDays`.
 *
 * EL CASO DIFÍCIL, y es el que trae el encargo: los socios IMPORTADOS de
 * MyWellness llegaron con su histórico en `externalRef`, `lastAccessAt` y
 * `accountCreatedAt`, y su `cancelledAt` PUEDE NO EXISTIR — el export de origen
 * no siempre traía fecha de baja. Sin esa fecha la pregunta "¿se fue hace más
 * de 180 días?" no tiene respuesta. Y la respuesta segura a una pregunta sin
 * respuesta que reparte dinero es REVISIÓN HUMANA: ni se paga a ciegas ni se
 * niega a ciegas. `lastAccessAt` se adjunta al motivo como PISTA para quien
 * decide —no como criterio automático: "hace mucho que no entra" no es "se dio
 * de baja hace mucho", y confundirlos es justamente pagar sobre un hueco.
 */
export function assessExMemberRule(input: {
  now: Date;
  cooldownDays: number;
  prior: PriorMemberFacts | null;
}): FraudVerdict {
  const { now, cooldownDays, prior } = input;
  if (!prior) return ALLOW;

  // Sigue siendo socio (o volvió: `reactivateMember` limpia `cancelledAt`).
  // Esto no es un alta nueva de nadie, así que no hay recompensa que pagar.
  if (prior.state !== "CANCELLED") {
    return block("Ya hay una ficha activa de esta persona en el centro: no es un alta nueva.");
  }

  if (prior.cancelledAt) {
    const gone = daysBetween(prior.cancelledAt, now);
    if (gone < cooldownDays) {
      return block(
        `Excliente que se fue hace ${gone} días; la ventana del centro son ${cooldownDays}. No cuenta como alta nueva.`
      );
    }
    return ALLOW;
  }

  // CANCELLED y sin fecha de baja: no se puede contestar.
  const hints: string[] = [];
  if (prior.externalRef) hints.push(`importado de ${prior.externalSource ?? "otra plataforma"} (${prior.externalRef})`);
  if (prior.lastAccessAt) hints.push(`último acceso ${prior.lastAccessAt.toISOString().slice(0, 10)}`);
  if (prior.accountCreatedAt) hints.push(`cuenta creada ${prior.accountCreatedAt.toISOString().slice(0, 10)}`);
  return review(
    "Excliente sin fecha de baja: no se puede saber si se fue hace más de " +
      `${cooldownDays} días${hints.length ? ` — ${hints.join(", ")}` : ""}. Decide tú antes de pagar.`
  );
}

/**
 * ANTIFRAUDE 2 · UNA recompensa por alta. Ni dos por el mismo referido, ni por
 * un referido que se da de baja y vuelve.
 *
 * La primera mitad —dos por el mismo lead— la sostiene la BASE DE DATOS, con el
 * `@@unique([leadId, beneficiary])` de `ReferralReward`; esto es el cinturón
 * además del tirante, y lo que permite que el motor sea idempotente sin
 * depender de atrapar un error de unicidad.
 *
 * La segunda —el que se da de baja y vuelve— NO la puede sostener ese índice:
 * al volver hay un LEAD NUEVO, con id nuevo, y el índice no ve que detrás está
 * la misma persona. Por eso se cuenta por PERSONA y no solo por lead.
 */
export function assessRepeatRule(input: { rewardsForThisLead: number; rewardsForThisPerson: number }): FraudVerdict {
  if (input.rewardsForThisLead > 0) {
    return block("Este referido ya generó su recompensa.");
  }
  if (input.rewardsForThisPerson > 0) {
    return block("Esta persona ya fue referida y premiada antes: una recompensa por persona, no por alta.");
  }
  return ALLOW;
}

/**
 * ANTIFRAUDE 3 · el código caduca si el socio se da de baja.
 *
 * La revocación la escribe `member-lifecycle.ts` (M4) a través de
 * `syncReferralCodeWithMemberState`, que es el único sitio desde el que se
 * cambia el estado de un socio. Aquí solo se LEE, y se leen dos momentos
 * distintos porque son dos preguntas distintas:
 *
 *  · ¿Estaba vivo el código EL DÍA QUE SE USÓ? Si ya estaba revocado cuando el
 *    lead entró, el enlace no debió funcionar y la recompensa no nace. Por eso
 *    `Lead.referralCodeId` guarda el código concreto: sin él no se puede
 *    contestar.
 *  · ¿Sigue siendo socio quien lo trajo, ahora que hay alta? Si se dio de baja
 *    EN MEDIO —trajo a un amigo en marzo y se fue en abril— eso no es fraude,
 *    es la vida, y no lo decide una máquina: va a revisión humana.
 */
export function assessCodeValidityRule(input: {
  usedLink: boolean;
  leadCreatedAt: Date;
  codeRevokedAt: Date | null;
  referrerState: MemberState;
}): FraudVerdict {
  if (input.usedLink && input.codeRevokedAt && input.codeRevokedAt.getTime() <= input.leadCreatedAt.getTime()) {
    return block("El código ya estaba caducado el día en que se usó.");
  }
  if (!canBeAmbassador(input.referrerState)) {
    return review("Quien lo trajo se ha dado de baja entre la invitación y el alta.");
  }
  return ALLOW;
}
