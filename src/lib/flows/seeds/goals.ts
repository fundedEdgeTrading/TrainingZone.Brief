import type { FlowGoalKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  registerFlowGoalResolver,
  type FlowGoalCandidate,
  type FlowGoalHit,
  type FlowGoalResolver,
} from "@/lib/flows/panel";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E14-36 · LA TERCERA CIFRA DEL EMBUDO: CUÁNTOS CUMPLEN EL OBJETIVO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * E2 dejó el hueco TIPADO —`FlowGoalKind` es el catálogo, `FlowGoalResolver` la
 * firma y `FlowEnrollment.goalMetAt` dónde se escribe— y dijo que QUÉ objetivo
 * lleva cada flujo y CÓMO SE MIDE lo decide E3. Esto es eso.
 *
 * Y aquí está el trabajo de verdad de la historia: un embudo cuyo último paso
 * nadie sabe medir es un embudo decorativo. Las tres reglas que se ha seguido:
 *
 *  1. CONTRA DATOS QUE YA EXISTEN. Ni una columna nueva, ni un evento nuevo, ni
 *     un píxel. Cada objetivo se lee de algo que el repositorio ya escribe por
 *     otra razón: reservas asistidas, suscripciones, el libro de sesiones, las
 *     invitaciones de formulario, el `AuditLog` de las transiciones y los leads
 *     de referido.
 *  2. POSTERIOR AL PRIMER CORREO DE ESA INSCRIPCIÓN, siempre en estricto
 *     posterior. `firstEmailAt` lo trae el motor y es el primer correo que salió
 *     DE VERDAD (los del buzón de pruebas no cuentan: nadie los recibió).
 *  3. SIN UNA CONSULTA POR SOCIO. Una consulta por objetivo y por pasada, con
 *     todos los candidatos dentro; el mismo patrón que `tag-engine.ts` y que el
 *     fotograma de condiciones del motor.
 *
 * NO SE MIDEN APERTURAS (D-L3-4). Si alguien pide la tasa de apertura, la
 * respuesta es el clic: medir aperturas exige un píxel de traza y con él un CMP
 * entero en el mismo cambio. El clic no lo necesita porque el enlace es nuestro.
 *
 * ---------------------------------------------------------------------------
 * ESTE MÓDULO NO ESCRIBE. Devuelve quién cumplió y cuándo; `refreshFlowGoals`
 * (del motor) es quien escribe `goalMetAt`. Así un objetivo mal medido no puede
 * corromper la cola, que es la razón por la que E2 partió la firma en dos.
 * ---------------------------------------------------------------------------
 *
 * IMPORTAR ESTE FICHERO ES LO QUE REGISTRA LOS RESOLUTORES. El registro de E2
 * empieza vacío a propósito y se rellena al importar (abajo del todo). Quien
 * quiera medir objetivos importa `@/lib/flows/seeds` y ya los tiene.
 */

/**
 * El primer instante de `fechas` ESTRICTAMENTE posterior a `desde`.
 *
 * Exportada porque es donde vive la única decisión fina de este módulo y se
 * puede probar sin base de datos: «estrictamente» (un suceso simultáneo al
 * correo no lo causó el correo) y «el primero» (si el socio volvió tres veces,
 * el objetivo se cumplió la primera, no la última).
 */
export function primeraDespuesDe(fechas: Date[] | undefined, desde: Date): Date | null {
  if (!fechas || fechas.length === 0) return null;
  let mejor: Date | null = null;
  for (const fecha of fechas) {
    if (fecha.getTime() <= desde.getTime()) continue;
    if (!mejor || fecha.getTime() < mejor.getTime()) mejor = fecha;
  }
  return mejor;
}

/** Añade una fecha al montón de un socio. */
function apunta(mapa: Map<string, Date[]>, memberId: string, fecha: Date): void {
  const lista = mapa.get(memberId);
  if (lista) lista.push(fecha);
  else mapa.set(memberId, [fecha]);
}

/** El envío más antiguo de todos los candidatos: el suelo de la consulta. */
function sueloDe(candidates: FlowGoalCandidate[]): Date {
  return candidates.reduce(
    (min, c) => (c.firstEmailAt.getTime() < min.getTime() ? c.firstEmailAt : min),
    candidates[0].firstEmailAt
  );
}

function idsDe(candidates: FlowGoalCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.memberId))];
}

/** Cruza los sucesos de cada socio con la fecha de SU correo. */
function cruza(candidates: FlowGoalCandidate[], sucesos: Map<string, Date[]>): FlowGoalHit[] {
  const hits: FlowGoalHit[] = [];
  for (const candidate of candidates) {
    const metAt = primeraDespuesDe(sucesos.get(candidate.memberId), candidate.firstEmailAt);
    if (metAt) hits.push({ enrollmentId: candidate.enrollmentId, metAt });
  }
  return hits;
}

/* ------------------------------------------------------------------------- *
 * VOLVIÓ A ENTRENAR
 * ------------------------------------------------------------------------- */

/**
 * Una reserva ATTENDED posterior al correo. Literalmente lo que pide E14-36.
 *
 * SE MIDE CON `Booking.occurrenceDate` —el día de la sesión— y no con la fecha
 * en que alguien pasó lista, que es lo que de verdad interesa: el flujo de
 * ausencia quiere saber si el socio VOLVIÓ, no cuándo el entrenador se acordó de
 * marcar la asistencia. `occurrenceDate` es el día a las 00:00, así que una
 * sesión del mismo día en que salió el correo NO cuenta: se prefiere quedarse
 * corto a apuntarse una sesión que ya estaba hecha antes de escribir.
 *
 * Es la misma fuente que «última visita» del listado de socios y que la etiqueta
 * «2 semanas sin venir» de E1: tres pantallas y un solo dato.
 */
const volvioAEntrenar: FlowGoalResolver = async (orgId, candidates) => {
  if (candidates.length === 0) return [];
  const memberIds = idsDe(candidates);

  const bookings = await prisma.booking.findMany({
    where: {
      status: "ATTENDED",
      memberId: { in: memberIds },
      member: { orgId },
      occurrenceDate: { gt: sueloDe(candidates) },
    },
    select: { memberId: true, occurrenceDate: true },
  });

  const porSocio = new Map<string, Date[]>();
  for (const b of bookings) apunta(porSocio, b.memberId, b.occurrenceDate);
  return cruza(candidates, porSocio);
};

/* ------------------------------------------------------------------------- *
 * RENOVÓ
 * ------------------------------------------------------------------------- */

/**
 * Una suscripción nueva O un bono recargado, posterior al correo.
 *
 * SON DOS COSAS DISTINTAS Y HACEN FALTA LAS DOS: renovar una cuota mensual crea
 * una `Subscription` nueva, pero recargar un bono de sesiones puede no crear
 * ninguna —se le suman sesiones al que ya tiene—. Lo segundo se lee del LIBRO DE
 * SESIONES, y se puede leer porque es invariante del trimestre: ninguna
 * operación mueve `sessionsRemaining` sin escribir un asiento en `SessionLedger`
 * en la misma transacción. Sin esa regla, «recargó el bono» no sería medible.
 *
 * Solo asientos POSITIVOS de compra o de ajuste: un `CANCELLATION` también suma
 * saldo y no es una renovación, es una sesión devuelta.
 */
const renovo: FlowGoalResolver = async (orgId, candidates) => {
  if (candidates.length === 0) return [];
  const memberIds = idsDe(candidates);
  const suelo = sueloDe(candidates);

  const [nuevas, recargas] = await Promise.all([
    prisma.subscription.findMany({
      where: { memberId: { in: memberIds }, member: { orgId }, createdAt: { gt: suelo } },
      select: { memberId: true, createdAt: true },
    }),
    prisma.sessionLedger.findMany({
      where: {
        orgId,
        delta: { gt: 0 },
        reason: { in: ["PURCHASE", "MANUAL_ADJUSTMENT"] },
        createdAt: { gt: suelo },
        subscription: { memberId: { in: memberIds } },
      },
      select: { createdAt: true, subscription: { select: { memberId: true } } },
    }),
  ]);

  const porSocio = new Map<string, Date[]>();
  for (const s of nuevas) apunta(porSocio, s.memberId, s.createdAt);
  for (const l of recargas) apunta(porSocio, l.subscription.memberId, l.createdAt);
  return cruza(candidates, porSocio);
};

/* ------------------------------------------------------------------------- *
 * RELLENÓ EL FORMULARIO
 * ------------------------------------------------------------------------- */

/**
 * El formulario del socio, relleno después del correo.
 *
 * DOS FUENTES, porque el socio puede llegar por dos caminos y los dos cuentan:
 * la INVITACIÓN de M5 (`MemberFormInvite.completedAt`, que es la que manda este
 * flujo) y la PARTE DEL SOCIO de su valoración (`Assessment.memberPartAt`, que
 * es donde aterriza lo que rellena). Contar solo la primera dejaría fuera a
 * quien lo rellenó en recepción con el móvil de la casa, y ese también lo ha
 * rellenado.
 *
 * `memberPartAt` es un instante, no un dato de salud: aquí no se lee ni una sola
 * respuesta de la valoración, solo CUÁNDO se rellenó. Por eso este objetivo no
 * pasa por `health-access.ts` — no hay nada clínico que auditar en una fecha.
 */
const rellenoFormulario: FlowGoalResolver = async (orgId, candidates) => {
  if (candidates.length === 0) return [];
  const memberIds = idsDe(candidates);
  const suelo = sueloDe(candidates);

  const [invitaciones, valoraciones] = await Promise.all([
    prisma.memberFormInvite.findMany({
      where: { orgId, memberId: { in: memberIds }, completedAt: { gt: suelo } },
      select: { memberId: true, completedAt: true },
    }),
    prisma.assessment.findMany({
      where: { orgId, memberId: { in: memberIds }, memberPartAt: { gt: suelo } },
      select: { memberId: true, memberPartAt: true },
    }),
  ]);

  const porSocio = new Map<string, Date[]>();
  for (const i of invitaciones) if (i.memberId && i.completedAt) apunta(porSocio, i.memberId, i.completedAt);
  for (const a of valoraciones) if (a.memberPartAt) apunta(porSocio, a.memberId, a.memberPartAt);
  return cruza(candidates, porSocio);
};

/* ------------------------------------------------------------------------- *
 * SE RECUPERÓ EL COBRO
 * ------------------------------------------------------------------------- */

/**
 * El impago abierto se cerró después del correo.
 *
 * SE MIDE CON EL RASTRO Y NO CON EL CAMPO. `Member.delinquentSince` a null dice
 * que hoy no debe nada, pero NO dice cuándo dejó de deberlo, y sin el cuándo el
 * embudo se apuntaría los cobros que entraron ANTES de que el correo saliera.
 * `member-lifecycle.ts` —punto único de escritura de las transiciones— deja
 * `MEMBER_DELINQUENCY_CLEARED` en el `AuditLog` con su fecha, y esa fecha sí se
 * puede comparar.
 *
 * De paso vale para los dos caminos: el cobro que entra por Stripe y el que
 * recepción registra a mano pasan los dos por ahí.
 */
const cobroRecuperado: FlowGoalResolver = async (orgId, candidates) => {
  if (candidates.length === 0) return [];
  const memberIds = idsDe(candidates);

  const filas = await prisma.auditLog.findMany({
    where: {
      orgId,
      action: "MEMBER_DELINQUENCY_CLEARED",
      entityType: "Member",
      memberId: { in: memberIds },
      createdAt: { gt: sueloDe(candidates) },
    },
    select: { memberId: true, createdAt: true },
  });

  const porSocio = new Map<string, Date[]>();
  for (const f of filas) if (f.memberId) apunta(porSocio, f.memberId, f.createdAt);
  return cruza(candidates, porSocio);
};

/* ------------------------------------------------------------------------- *
 * RECOMENDÓ A ALGUIEN
 * ------------------------------------------------------------------------- */

/**
 * Un lead entrado POR EL CÓDIGO DE ESTE SOCIO, con fecha posterior al correo.
 *
 * Es el objetivo que dejó escrito R1 y el único de los cinco que se cuenta en
 * dinero. Se lee de `Lead.referralCodeId`, que es lo que escribe la página
 * pública `/r/[code]`: no hay nada que inventar y no hace falta que la
 * recompensa esté pagada — el flujo pide que recomiende, no que el amigo se
 * apunte y aguante tres meses.
 *
 * El código se busca aunque esté REVOCADO: caduca cuando el socio se da de baja,
 * y un lead que entró con él antes sigue contando de quién vino.
 */
const recomendo: FlowGoalResolver = async (orgId, candidates) => {
  if (candidates.length === 0) return [];
  const memberIds = idsDe(candidates);

  const codigos = await prisma.referralCode.findMany({
    where: { orgId, memberId: { in: memberIds } },
    select: { id: true, memberId: true },
  });
  if (codigos.length === 0) return [];
  const socioDelCodigo = new Map(codigos.map((c) => [c.id, c.memberId]));

  const leads = await prisma.lead.findMany({
    where: { orgId, referralCodeId: { in: [...socioDelCodigo.keys()] }, createdAt: { gt: sueloDe(candidates) } },
    select: { referralCodeId: true, createdAt: true },
  });

  const porSocio = new Map<string, Date[]>();
  for (const lead of leads) {
    const memberId = lead.referralCodeId ? socioDelCodigo.get(lead.referralCodeId) : null;
    if (memberId) apunta(porSocio, memberId, lead.createdAt);
  }
  return cruza(candidates, porSocio);
};

/* ------------------------------------------------------------------------- *
 * El registro
 * ------------------------------------------------------------------------- */

/**
 * Los cinco, con su resolutor. Es un objeto y no cinco llamadas sueltas para que
 * `goals.test.ts` pueda comprobar que NO FALTA NINGUNO: un `FlowGoalKind` sin
 * resolutor hace que el panel pinte «falta definir cómo se mide», y eso es
 * exactamente lo que esta pista venía a quitar.
 */
export const FLOW_GOAL_RESOLVERS: Record<FlowGoalKind, FlowGoalResolver> = {
  TRAINED_AGAIN: volvioAEntrenar,
  RENEWED: renovo,
  FORM_COMPLETED: rellenoFormulario,
  PAYMENT_RECOVERED: cobroRecuperado,
  REFERRAL_SENT: recomendo,
};

/**
 * Registrarlos es un efecto de importar este módulo, y es idempotente: el
 * registro de E2 es un `Map`, así que volver a registrar el mismo tipo lo
 * sustituye por sí mismo.
 */
for (const [kind, resolver] of Object.entries(FLOW_GOAL_RESOLVERS)) {
  registerFlowGoalResolver(kind as FlowGoalKind, resolver);
}
