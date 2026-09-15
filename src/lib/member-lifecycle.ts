/**
 * M4 · Tipos de persona: el ÚNICO punto de escritura de las transiciones de
 * estado de un socio.
 *
 * SON CUATRO TIPOS, NO TRES. Negocio pidió tres juntando congelado y
 * suspendido; van separados y la decisión está cerrada en el plan (D-L3-2):
 *
 *   Cliente     → `MemberState.ACTIVE`
 *   Congelado   → `MemberState.FROZEN`      (voluntario: agosto, viaje, lesión)
 *   Suspendido  → `MemberState.DELINQUENT`  (impago)
 *   Excliente   → `MemberState.CANCELLED`
 *
 * Congelado e impago se separaron A PROPÓSITO en HU-ST-14 porque la lista de
 * morosos incluía a quien estaba de vacaciones, y volver a juntarlos deshace
 * ese arreglo y rompe el flujo 5 de E3, que necesita saber quién debe dinero.
 * EN LA PANTALLA se pueden agrupar bajo un rótulo (`MEMBER_KIND_GROUP`); por
 * dentro siguen siendo dos. El enum `MemberState` no se toca.
 *
 * LOS DOS MOTIVOS SON OBLIGATORIOS, con el mismo patrón que `NoCloseReason` en
 * leads (RB-LEAD-011): catálogo por organización, editable sin desplegar, y la
 * transición se RECHAZA sin motivo válido. Sin motivo no hay campaña de
 * reactivación de septiembre que valga — ese es el uso real de esto.
 *
 * ---------------------------------------------------------------------------
 * LOS PUNTOS DE ESCRITURA QUE HABÍA (E14-16), localizados uno a uno
 * ---------------------------------------------------------------------------
 *
 *   1. Ficha del socio  · `members/[id]/actions.ts` (nuevo: antes la ficha no
 *      podía congelar ni dar de baja al socio, solo a su bono)
 *   2. Cobros           · `billing/subscription-actions.ts` — freeze, resume y
 *      el motivo de la baja programada
 *   3. Portal del socio · `portal/membresia/freeze-actions.ts` — el socio se
 *      congela solo desde su portal
 *   4. Portal del socio · `portal/membresia/subscription-actions.ts` — y se da
 *      de baja solo, que es donde el motivo vale más: el que se va es el único
 *      que sabe por qué
 *   5. Cron de bajas    · `subscription-jobs.ts` — cancelaciones programadas
 *   6. Webhook Stripe   · `stripe-dunning.ts` — impago abierto, impago cerrado
 *      y baja por reintentos agotados (que además escribía `CANCELLED` SIN
 *      `cancelledAt`: el socio se iba sin fecha, y por eso no aparecía en la
 *      baja del desglose de ingresos)
 *
 * Los seis pasan ahora por aquí. Una transición que no pase por este módulo es
 * un socio sin motivo, y el problema vuelve en diciembre. Además R1 y E2 se
 * enganchan a estas funciones —el código de referido caduca con la baja, y el
 * disparador «cambio de estado» de los flujos lee de aquí—, así que un update
 * suelto en otro fichero se los salta a los dos.
 *
 * Fuera de este módulo quedan, a propósito, las transiciones de ENTRADA que no
 * son ninguno de los cuatro tipos: `PROSPECT → TRIAL` del onboarding
 * (`onboarding/[token]/actions.ts`) y `TRIAL/PROSPECT → ACTIVE` de la
 * conversión de lead (`leads-queries.ts::confirmLeadClosureForMember`), que es
 * un alta y ya deja su propia traza en el lead. Se citan aquí para que quien
 * busque «todos los sitios» no tenga que volver a barrer el árbol.
 */
import type { MemberState, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isMemberInScope, type ScopedUser } from "@/lib/center-scope";

// Los cuatro tipos y su lectura de pantalla viven en `member-kinds.ts`, sin
// Prisma detrás, para que los componentes de cliente puedan usarlos. Se
// reexportan aquí para que el lado servidor siga importando de un solo sitio.
export * from "@/lib/member-kinds";

// ---------------------------------------------------------------------------
// Catálogos de motivo (mismo patrón que LeadChannel / NoCloseReason)
// ---------------------------------------------------------------------------

export type ReasonOption = { id: string; label: string };

export async function listFreezeReasons(orgId: string): Promise<ReasonOption[]> {
  return prisma.freezeReason.findMany({
    where: { orgId, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
}

export async function listCancelReasons(orgId: string): Promise<ReasonOption[]> {
  return prisma.cancelReason.findMany({
    where: { orgId, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
}

export async function addFreezeReason(orgId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica un nombre para el motivo." };
  await prisma.freezeReason.create({ data: { orgId, label: label.trim() } });
  return { ok: true as const };
}

export async function addCancelReason(orgId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica un nombre para el motivo." };
  await prisma.cancelReason.create({ data: { orgId, label: label.trim() } });
  return { ok: true as const };
}

/**
 * Motivos que escribe el SISTEMA, cuando no hay nadie a quien preguntarle.
 *
 * El webhook de Stripe da de baja por reintentos agotados y el cron ejecuta una
 * baja programada: ninguno de los dos puede abrir un desplegable. Como el motivo
 * es obligatorio —y sin él la campaña de reactivación no sabe a quién escribir—,
 * el sistema usa una entrada del MISMO catálogo, creada perezosamente la primera
 * vez y editable después por dirección como cualquier otra. No es un agujero en
 * la regla: es la regla resuelta para quien no tiene teclado.
 */
export const SYSTEM_CANCEL_REASON_LABEL = "Impago (baja automática)";

async function ensureCancelReason(orgId: string, label: string): Promise<string> {
  const existing = await prisma.cancelReason.findFirst({ where: { orgId, label }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.cancelReason.create({ data: { orgId, label }, select: { id: true } });
  return created.id;
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

export type LifecycleResult = { ok: true } | { ok: false; error: string };

/**
 * Quién ejecuta la transición. `user` es una persona con sesión (y entonces se
 * cruza el ámbito de centro); `system` es el cron o un webhook, que no tiene
 * sesión ni centro y solo puede operar dentro de la organización que ya ha
 * resuelto su llamante.
 */
export type LifecycleActor =
  | { kind: "user"; user: ScopedUser }
  /**
   * El cron, un webhook o el propio socio desde su portal: nadie con ámbito de
   * centro que cruzar. `actorUserId` es opcional y solo lo lleva el tercer caso
   * —el socio sí es una persona identificable—, para que el `AuditLog` de la
   * transición no quede anónimo cuando sí se sabe quién la pidió.
   */
  | { kind: "system"; orgId: string; source: string; actorUserId?: string | null };

const OUT_OF_SCOPE = "Este socio no es de tus centros.";
const MEMBER_NOT_FOUND = "No se ha encontrado ese socio.";

function orgOf(actor: LifecycleActor): string {
  return actor.kind === "user" ? actor.user.orgId : actor.orgId;
}

function actorUserId(actor: LifecycleActor): string | null {
  return actor.kind === "user" ? actor.user.id : (actor.actorUserId ?? null);
}

type MemberRow = {
  id: string;
  orgId: string;
  state: MemberState;
  cancelledAt: Date | null;
  frozenAt: Date | null;
};

async function loadMember(actor: LifecycleActor, memberId: string): Promise<MemberRow | { error: string }> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: orgOf(actor) },
    select: { id: true, orgId: true, state: true, cancelledAt: true, frozenAt: true },
  });
  if (!member) return { error: MEMBER_NOT_FOUND };
  // Ámbito de centro: una dirección de centro no congela ni da de baja al socio
  // de otro centro. El cron y el webhook no tienen ámbito que cruzar — su
  // llamante ya ha resuelto la organización.
  if (actor.kind === "user" && !(await isMemberInScope(actor.user, member.id))) return { error: OUT_OF_SCOPE };
  return member;
}

async function logTransition(
  actor: LifecycleActor,
  memberId: string,
  action: string,
  metadata: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: {
      orgId: orgOf(actor),
      actorUserId: actorUserId(actor),
      action,
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata:
        actor.kind === "system"
          ? { ...(metadata as Record<string, unknown>), source: actor.source }
          : metadata,
    },
  });
}

export type FreezeInput = {
  /** Obligatorio: id de una entrada ACTIVA del catálogo `FreezeReason` de la organización. */
  reasonId: string;
  /**
   * Fecha de vuelta prevista. NO se guarda en `Member`: su sitio natural es
   * `Subscription.pauseUntil`, que ya existe, y duplicarla daría dos verdades
   * para lo mismo. `null` = congelación indefinida.
   */
  resumeOn?: Date | null;
  /** Suscripciones que se congelan con el socio. Vacío = solo cambia el socio. */
  subscriptionIds?: string[];
};

/**
 * Cliente → Congelado. Escribe estado, `frozenAt`, motivo y —en las
 * suscripciones que se le pasen— `status: FROZEN` y `pauseUntil`, que es donde
 * vive la fecha de vuelta.
 */
export async function freezeMember(
  actor: LifecycleActor,
  memberId: string,
  input: FreezeInput,
): Promise<LifecycleResult> {
  const member = await loadMember(actor, memberId);
  if ("error" in member) return { ok: false, error: member.error };
  if (member.state === "CANCELLED") return { ok: false, error: "Un excliente no se puede congelar." };

  const reason = await prisma.freezeReason.findFirst({
    where: { id: input.reasonId, orgId: member.orgId, active: true },
    select: { id: true, label: true },
  });
  if (!reason) return { ok: false, error: "El motivo de la congelación es obligatorio." };

  const resumeOn = input.resumeOn ?? null;
  if (resumeOn && resumeOn <= new Date()) {
    return { ok: false, error: "La fecha de reanudación debe ser futura." };
  }

  const now = new Date();
  const ids = input.subscriptionIds ?? [];
  await prisma.$transaction([
    prisma.member.update({
      where: { id: member.id },
      data: {
        state: "FROZEN",
        // Gemelo de `delinquentSince`: cuándo empezó ESTA congelación. No se
        // reinicia si el socio ya estaba congelado.
        ...(member.frozenAt ? {} : { frozenAt: now }),
        freezeReasonId: reason.id,
      },
    }),
    ...(ids.length
      ? [
          prisma.subscription.updateMany({
            where: { id: { in: ids }, memberId: member.id },
            data: { status: "FROZEN", pauseUntil: resumeOn },
          }),
        ]
      : []),
  ]);

  await logTransition(actor, member.id, "MEMBER_FROZEN", {
    from: member.state,
    reasonId: reason.id,
    reason: reason.label,
    resumeOn,
    subscriptionIds: ids,
  });
  return { ok: true };
}

export type CancelInput = {
  /** Obligatorio: id de una entrada ACTIVA del catálogo `CancelReason` de la organización. */
  reasonId?: string | null;
  /** Fecha de la baja. Por defecto, ahora. La verdad vive en `Member.cancelledAt`. */
  at?: Date;
  /** Suscripciones que se cierran con la baja. */
  subscriptionIds?: string[];
  /**
   * Motivo de catálogo que el sistema usa cuando nadie puede elegirlo (cron y
   * webhook). Solo lo pasan los actores `system`; se crea la entrada si falta.
   */
  systemReasonLabel?: string;
};

/**
 * Cualquiera → Excliente. La fecha es `Member.cancelledAt` y el motivo es
 * obligatorio: sin él la campaña de reactivación no sabe a quién escribir.
 */
export async function cancelMember(
  actor: LifecycleActor,
  memberId: string,
  input: CancelInput = {},
): Promise<LifecycleResult> {
  const member = await loadMember(actor, memberId);
  if ("error" in member) return { ok: false, error: member.error };

  let reasonId = input.reasonId ?? null;
  if (reasonId) {
    const reason = await prisma.cancelReason.findFirst({
      where: { id: reasonId, orgId: member.orgId, active: true },
      select: { id: true },
    });
    if (!reason) return { ok: false, error: "El motivo de baja es obligatorio." };
  } else if (actor.kind === "system") {
    // El motivo lo pudo dejar escrito quien programó la baja (ver
    // `scheduleCancellation`): si está, manda ese; si no, el del sistema.
    const pending = await prisma.member.findUnique({
      where: { id: member.id },
      select: { cancelReasonId: true },
    });
    reasonId =
      pending?.cancelReasonId ??
      (await ensureCancelReason(member.orgId, input.systemReasonLabel ?? SYSTEM_CANCEL_REASON_LABEL));
  } else {
    return { ok: false, error: "El motivo de baja es obligatorio." };
  }

  const at = input.at ?? new Date();
  const ids = input.subscriptionIds ?? [];
  await prisma.$transaction([
    prisma.member.update({
      where: { id: member.id },
      data: {
        state: "CANCELLED",
        // Una baja de quien ya estaba de baja no reescribe la fecha original:
        // es la que usa el desglose de ingresos para saber de qué mes es.
        ...(member.cancelledAt ? {} : { cancelledAt: at }),
        cancelReasonId: reasonId,
        // Se va: ni sigue congelado ni sigue debiendo. El reloj de gracia se
        // cierra con él (si no, corta el acceso de un socio que ya no existe).
        frozenAt: null,
        delinquentSince: null,
      },
    }),
    ...(ids.length
      ? [
          prisma.subscription.updateMany({
            where: { id: { in: ids }, memberId: member.id },
            data: { status: "CANCELLED", cancelAt: null },
          }),
        ]
      : []),
  ]);

  await logTransition(actor, member.id, "MEMBER_CANCELLED", {
    from: member.state,
    reasonId,
    at,
    subscriptionIds: ids,
  });
  return { ok: true };
}

export type ReactivateInput = {
  /** Suscripciones que vuelven a estar vivas con el socio. */
  subscriptionIds?: string[];
  /** Nueva caducidad de la suscripción, cuando la reanudación desplaza el bono. */
  endDate?: Date | null;
};

/**
 * Congelado o Suspendido → Cliente. Limpia los dos relojes de salida
 * (`frozenAt`, `delinquentSince`) y el motivo de congelación: el motivo de la
 * congelación que acaba de terminar ya no describe al socio, y dejarlo colgado
 * ensucia la segmentación de la próxima.
 *
 * El motivo de BAJA no se limpia a propósito: un excliente que vuelve sigue
 * habiéndose ido alguna vez por algo, y esa es justamente la lectura que pide la
 * campaña de reactivación.
 */
export async function reactivateMember(
  actor: LifecycleActor,
  memberId: string,
  input: ReactivateInput = {},
): Promise<LifecycleResult> {
  const member = await loadMember(actor, memberId);
  if ("error" in member) return { ok: false, error: member.error };

  const ids = input.subscriptionIds ?? [];
  await prisma.$transaction([
    prisma.member.update({
      where: { id: member.id },
      data: {
        state: "ACTIVE",
        frozenAt: null,
        freezeReasonId: null,
        delinquentSince: null,
        // Vuelve: deja de ser excliente, y la fecha de baja se va con él.
        ...(member.state === "CANCELLED" ? { cancelledAt: null } : {}),
      },
    }),
    ...(ids.length
      ? [
          prisma.subscription.updateMany({
            where: { id: { in: ids }, memberId: member.id },
            data: {
              status: "ACTIVE",
              pauseUntil: null,
              ...(input.endDate ? { endDate: input.endDate } : {}),
            },
          }),
        ]
      : []),
  ]);

  await logTransition(actor, member.id, "MEMBER_REACTIVATED", { from: member.state, subscriptionIds: ids });
  return { ok: true };
}

/**
 * Cliente → Suspendido (impago). No lleva motivo de catálogo: el motivo ES el
 * impago, y el porqué detallado ya lo guarda el dunning en su propia traza.
 * `delinquentSince` marca el arranque del periodo de gracia y NO se reinicia con
 * cada reintento de Stripe.
 */
export async function markDelinquent(
  actor: LifecycleActor,
  memberId: string,
  options: { at?: Date; metadata?: Prisma.InputJsonValue } = {},
): Promise<LifecycleResult> {
  const member = await loadMember(actor, memberId);
  if ("error" in member) return { ok: false, error: member.error };

  const existing = await prisma.member.findUnique({
    where: { id: member.id },
    select: { delinquentSince: true },
  });
  await prisma.member.update({
    where: { id: member.id },
    data: {
      state: "DELINQUENT",
      ...(existing?.delinquentSince ? {} : { delinquentSince: options.at ?? new Date() }),
    },
  });
  await logTransition(actor, member.id, "MEMBER_DELINQUENT", {
    from: member.state,
    ...((options.metadata ?? {}) as object),
  });
  return { ok: true };
}

/**
 * Suspendido → Cliente: el cobro entró. Se limpia el reloj de gracia incluso si
 * el socio ya no estaba `DELINQUENT` (recepción pudo devolverlo a mano), porque
 * un reloj colgado sin impago abierto corta el acceso de alguien que paga.
 */
export async function clearDelinquency(
  actor: LifecycleActor,
  memberId: string,
  metadata: Prisma.InputJsonValue = {},
): Promise<LifecycleResult> {

  const orgId = orgOf(actor);
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, state: true },
  });
  if (!member) return { ok: false, error: MEMBER_NOT_FOUND };
  if (actor.kind === "user" && !(await isMemberInScope(actor.user, member.id))) {
    return { ok: false, error: OUT_OF_SCOPE };
  }

  await prisma.member.updateMany({
    where: { id: member.id, orgId, state: "DELINQUENT" },
    data: { state: "ACTIVE", delinquentSince: null },
  });
  await prisma.member.updateMany({
    where: { id: member.id, orgId, delinquentSince: { not: null }, state: { not: "DELINQUENT" } },
    data: { delinquentSince: null },
  });

  if (member.state === "DELINQUENT") {
    await logTransition(actor, member.id, "MEMBER_DELINQUENCY_CLEARED", { from: member.state, ...(metadata as object) });
  }
  return { ok: true };
}

/**
 * El motivo de baja que deja escrito quien PROGRAMA la baja a fecha futura, para
 * que el cron que la ejecuta semanas después no tenga que inventárselo. No
 * cambia el estado del socio: solo guarda el porqué.
 */
export async function recordScheduledCancelReason(
  actor: LifecycleActor,
  memberId: string,
  reasonId: string,
): Promise<LifecycleResult> {
  const member = await loadMember(actor, memberId);
  if ("error" in member) return { ok: false, error: member.error };

  const reason = await prisma.cancelReason.findFirst({
    where: { id: reasonId, orgId: member.orgId, active: true },
    select: { id: true },
  });
  if (!reason) return { ok: false, error: "El motivo de baja es obligatorio." };

  await prisma.member.update({ where: { id: member.id }, data: { cancelReasonId: reason.id } });
  return { ok: true };
}

/**
 * Anular la baja programada borra también su motivo: un socio que sigue siendo
 * cliente con un motivo de baja escrito en la ficha es un excliente para
 * cualquiera que lo lea después —la campaña de reactivación incluida—, y el
 * motivo que queda ni siquiera describe nada que haya pasado.
 */
export async function clearScheduledCancelReason(
  actor: LifecycleActor,
  memberId: string,
): Promise<LifecycleResult> {
  const member = await loadMember(actor, memberId);
  if ("error" in member) return { ok: false, error: member.error };
  // Un excliente de verdad conserva el suyo: solo se limpia mientras siga vivo.
  if (member.state === "CANCELLED") return { ok: true };
  await prisma.member.update({ where: { id: member.id }, data: { cancelReasonId: null } });
  return { ok: true };
}
