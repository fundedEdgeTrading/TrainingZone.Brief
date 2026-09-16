import type { FlowActionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { cancelMember, freezeMember, markDelinquent, reactivateMember } from "@/lib/member-lifecycle";
import { createNotificationOnce, pickCenterTaskRecipient } from "@/lib/notifications";
import { sendMemberForm } from "@/lib/member-forms";

/**
 * E2 · Las ACCIONES que NO mandan correo comercial.
 *
 * Las que sí (`SEND_EMAIL` y `SEND_FORM`) pasan por el punto único de salida de
 * `engine.ts`; estas no gastan cupo de nadie y se ejecutan en la pasada. Cada
 * una DELEGA en el módulo que ya sabe hacer eso:
 *
 *  · poner y quitar etiqueta → `MemberTag`, con su `MemberTagEvent` de traza,
 *    igual que lo hace el motor de E1. Solo etiquetas MANUALES: una automática
 *    la pone y la quita el cron, y un flujo que la tocase se pelearía con él en
 *    la pasada siguiente.
 *  · crear tarea / avisar al director → `createNotificationOnce`, que ya trae
 *    deduplicación y el tope semanal de tareas de M3.
 *  · cambiar estado → `member-lifecycle.ts` (M4), que es el punto ÚNICO de
 *    escritura de las transiciones y el que deja el `AuditLog`. Nunca un
 *    `update` suelto sobre `Member.state`.
 */

export type FlowActionContext = {
  orgId: string;
  centerId: string;
  memberId: string;
  memberName: string;
  flowId: string;
  flowName: string;
  enrollmentId: string;
  stepId: string;
  now: Date;
};

export type FlowActionResult = { ok: true; detail?: string } | { ok: false; error: string };

/** Espacio de deduplicación propio de las tareas de flujo (la lección de E14-11). */
export const FLOW_TASK_ENTITY = "FlowTask";

/**
 * La clave de deduplicación de una tarea de flujo: LA INSCRIPCIÓN Y EL PASO.
 *
 * No el socio: dos flujos distintos abren dos tareas distintas sobre la misma
 * persona y las dos hacen falta. Compartir clave es exactamente el fallo que M3
 * acaba de arreglar —la tarea del bono se la comía la de «pocas sesiones»— y no
 * se repite aquí.
 */
export function flowTaskKey(enrollmentId: string, stepId: string): string {
  return `${enrollmentId}:${stepId}`;
}

function config(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Una etiqueta MANUAL y activa de la organización, por clave. */
async function manualTagByKey(orgId: string, key: string) {
  return prisma.memberTagDefinition.findFirst({
    where: { orgId, key, kind: "MANUAL", active: true },
    select: { id: true },
  });
}

async function addTag(ctx: FlowActionContext, key: string): Promise<FlowActionResult> {
  const definition = await manualTagByKey(ctx.orgId, key);
  if (!definition) return { ok: false, error: `No hay etiqueta manual activa con la clave «${key}».` };

  const already = await prisma.memberTag.findUnique({
    where: { memberId_tagDefinitionId: { memberId: ctx.memberId, tagDefinitionId: definition.id } },
    select: { id: true },
  });
  if (already) return { ok: true, detail: "ya la tenía" };

  await prisma.$transaction([
    // `assignedByUserId` null = la puso el sistema, que es la verdad: detrás de
    // un flujo no hay una persona, y firmarlo con nadie es mejor que mentir.
    prisma.memberTag.create({ data: { orgId: ctx.orgId, memberId: ctx.memberId, tagDefinitionId: definition.id } }),
    prisma.memberTagEvent.create({
      data: {
        orgId: ctx.orgId,
        memberId: ctx.memberId,
        tagDefinitionId: definition.id,
        action: "ADDED",
        ruleKey: `flow:${ctx.flowId}`,
      },
    }),
  ]);
  return { ok: true };
}

async function removeTag(ctx: FlowActionContext, key: string): Promise<FlowActionResult> {
  const definition = await manualTagByKey(ctx.orgId, key);
  if (!definition) return { ok: false, error: `No hay etiqueta manual activa con la clave «${key}».` };

  const row = await prisma.memberTag.findUnique({
    where: { memberId_tagDefinitionId: { memberId: ctx.memberId, tagDefinitionId: definition.id } },
    select: { id: true },
  });
  if (!row) return { ok: true, detail: "no la tenía" };

  await prisma.$transaction([
    prisma.memberTag.delete({ where: { id: row.id } }),
    prisma.memberTagEvent.create({
      data: {
        orgId: ctx.orgId,
        memberId: ctx.memberId,
        tagDefinitionId: definition.id,
        action: "REMOVED",
        ruleKey: `flow:${ctx.flowId}`,
      },
    }),
  ]);
  return { ok: true };
}

/** Los entrenadores con los que de hecho entrena el socio, para la tarea. */
async function trainersOfMember(memberId: string): Promise<string[]> {
  const rows = await prisma.booking.findMany({
    where: { memberId, session: { trainerId: { not: null } } },
    orderBy: { occurrenceDate: "desc" },
    take: 25,
    select: { session: { select: { trainerId: true } } },
  });
  return [...new Set(rows.map((r) => r.session.trainerId).filter((id): id is string => Boolean(id)))];
}

/** La dirección del centro, que es quien recibe el aviso al director. */
async function directorsOfCenter(orgId: string, centerId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      orgId,
      role: { in: ["OWNER", "CENTER_DIRECTOR"] },
      OR: [{ centerId }, { centerMemberships: { some: { centerId } } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function createTask(ctx: FlowActionContext, raw: Record<string, unknown>): Promise<FlowActionResult> {
  const title = text(raw.title) || `Seguimiento · ${ctx.flowName}`;
  const dueInDays = Number(raw.dueInDays ?? 0);

  // A quién: al entrenador elegido en el paso; si no hay, a uno de los suyos;
  // si tampoco, a dirección del centro. Nunca se pierde la tarea en silencio.
  const elegido = text(raw.trainerUserId);
  const candidatos = elegido ? [elegido] : await trainersOfMember(ctx.memberId);
  const destinatarios = candidatos.length > 0 ? candidatos : await directorsOfCenter(ctx.orgId, ctx.centerId);
  const recipientUserId = await pickCenterTaskRecipient(ctx.orgId, destinatarios);
  if (!recipientUserId) return { ok: false, error: "No hay nadie a quien encargarle esta tarea." };

  const dueDate = Number.isFinite(dueInDays)
    ? new Date(ctx.now.getTime() + Math.max(0, dueInDays) * 86_400_000)
    : undefined;

  const result = await createNotificationOnce({
    orgId: ctx.orgId,
    recipientUserId,
    kind: "TASK",
    title: `${title} · ${ctx.memberName}`,
    body: text(raw.body) || `Lo pide el flujo «${ctx.flowName}».`,
    entityType: FLOW_TASK_ENTITY,
    entityId: flowTaskKey(ctx.enrollmentId, ctx.stepId),
    category: "Flujos",
    dueDate,
  });
  // El tope semanal de tareas de M3 puede dejarla para más adelante. No es un
  // error del flujo: la situación sigue ahí y la próxima pasada con hueco la
  // escribe. Se devuelve como detalle para que se vea en el informe del cron.
  return { ok: true, detail: result.status };
}

async function notifyDirector(ctx: FlowActionContext, raw: Record<string, unknown>): Promise<FlowActionResult> {
  const recipientUserId = await pickCenterTaskRecipient(ctx.orgId, await directorsOfCenter(ctx.orgId, ctx.centerId));
  if (!recipientUserId) return { ok: false, error: "Este centro no tiene dirección a quien avisar." };

  const result = await createNotificationOnce({
    orgId: ctx.orgId,
    recipientUserId,
    // `ALERT` y no `TASK`: es un aviso de campana, no trabajo repartido, y por
    // eso no entra en el tope semanal de tareas de M3.
    kind: "ALERT",
    priority: "ALTA",
    title: `${text(raw.title) || ctx.flowName} · ${ctx.memberName}`,
    body: text(raw.body) || `Aviso del flujo «${ctx.flowName}».`,
    entityType: FLOW_TASK_ENTITY,
    entityId: flowTaskKey(ctx.enrollmentId, ctx.stepId),
    category: "Flujos",
  });
  return { ok: true, detail: result.status };
}

async function changeState(ctx: FlowActionContext, raw: Record<string, unknown>): Promise<FlowActionResult> {
  // El actor es el SISTEMA: detrás de un flujo no hay una persona con sesión, y
  // `member-lifecycle.ts` ya sabe distinguirlo (no cruza ámbito de centro — la
  // organización la ha resuelto el llamante — y lo deja escrito en el AuditLog).
  const actor = { kind: "system" as const, orgId: ctx.orgId, source: `flow:${ctx.flowId}` };
  const state = text(raw.state);

  switch (state) {
    case "DELINQUENT":
      return markDelinquent(actor, ctx.memberId);
    case "FROZEN":
      return freezeMember(actor, ctx.memberId, { reasonId: text(raw.reasonId) });
    case "CANCELLED":
      return cancelMember(actor, ctx.memberId, {
        reasonId: text(raw.reasonId) || null,
        systemReasonLabel: text(raw.reasonLabel) || `Baja automática · ${ctx.flowName}`,
      });
    case "ACTIVE":
      return reactivateMember(actor, ctx.memberId);
    default:
      return { ok: false, error: `«${state}» no es un estado al que un flujo pueda llevar a un socio.` };
  }
}

/**
 * El formulario del socio. Es el de M5 (`member-forms.ts`) y no otro: monta el
 * `MemberFormInvite` con su token, su caducidad y su correo. Aquí solo se elige
 * el hito.
 *
 * LO LLAMA `engine.ts` Y SOLO DESPUÉS DE LA PUERTA, nunca `runFlowAction`:
 * manda un correo AL SOCIO, así que gasta el cupo de la semana y tiene que
 * haber pasado por `canSendMemberEmail` y por la ventana de silencio como
 * cualquier otro envío del módulo. Un formulario que se salta el tope rompe la
 * promesa igual que un email suelto, y cuesta lo mismo de arreglar: nada, si se
 * hace desde el principio.
 */
export async function sendFlowFormInvite(
  ctx: FlowActionContext,
  raw: Record<string, unknown>
): Promise<FlowActionResult> {
  const result = await sendMemberForm({
    orgId: ctx.orgId,
    target: { kind: "member", memberId: ctx.memberId },
    milestoneKey: text(config(raw).milestoneKey) || undefined,
    sentByUserId: null,
    now: ctx.now,
  });
  return result.ok ? { ok: true, detail: result.emailed ? "enviado" : "sin email" } : { ok: false, error: result.error };
}

/**
 * Ejecuta la acción de un paso. `SEND_EMAIL` y `SEND_FORM` NO pasan por aquí:
 * escriben al socio, así que van por el punto único de salida de `engine.ts`.
 */
export async function runFlowAction(
  actionType: FlowActionType,
  actionConfig: unknown,
  ctx: FlowActionContext
): Promise<FlowActionResult> {
  const raw = config(actionConfig);
  switch (actionType) {
    case "ADD_TAG":
      return addTag(ctx, text(raw.tagKey));
    case "REMOVE_TAG":
      return removeTag(ctx, text(raw.tagKey));
    case "CREATE_TASK":
      return createTask(ctx, raw);
    case "NOTIFY_DIRECTOR":
      return notifyDirector(ctx, raw);
    case "CHANGE_STATE":
      return changeState(ctx, raw);
    case "SEND_FORM":
    case "SEND_EMAIL":
      return { ok: false, error: "Lo que escribe al socio sale por sendFlowEmail, no por aquí." };
    default:
      return { ok: false, error: "Acción desconocida." };
  }
}
