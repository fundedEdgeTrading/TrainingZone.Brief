import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

/**
 * Captura real del contraste cliente vs. entrenador que pinta /feedback
 * (antes solo lo poblaba el seed). Ambos lados comparten las mismas 9
 * dimensiones (sat/prog/adher/motiv/esf/descanso/nutricion/bienestar/comunicacion)
 * para que la comparación sea legítima; lo único que cambia es el enunciado
 * según quién responde. Todas se responden con slider (0-10), sin texto
 * obligatorio en ninguno de los dos lados.
 *
 * Ámbito: el "vs" solo aplica a clientes de EP — son los que tienen un
 * entrenador derivable de su última sesión asistida (Member.trainerId ya no
 * existe, mismo patrón que trainer-rating-access.ts/checkin-schedule.ts). Un
 * cliente solo de grupos no tiene "un" entrenador al que pedirle un debrief
 * individual sobre él.
 */

export type FeedbackDimsInput = {
  sat: number;
  prog: number;
  adher: number;
  motiv: number;
  esf: number;
  descanso: number;
  nutricion: number;
  bienestar: number;
  comunicacion: number;
};

const CLIENT_FEEDBACK_ENTITY = "ClientFeedbackPrompt";
const TRAINER_DEBRIEF_ENTITY = "TrainerDebriefPrompt";
const FOLLOWUP_ENTITY = "FeedbackFollowUp";
const FEEDBACK_CYCLE_DAYS = 30;

function clampDim(n: number) {
  return Math.min(10, Math.max(0, Math.round(n)));
}

function clampDims(d: FeedbackDimsInput): FeedbackDimsInput {
  return {
    sat: clampDim(d.sat),
    prog: clampDim(d.prog),
    adher: clampDim(d.adher),
    motiv: clampDim(d.motiv),
    esf: clampDim(d.esf),
    descanso: clampDim(d.descanso),
    nutricion: clampDim(d.nutricion),
    bienestar: clampDim(d.bienestar),
    comunicacion: clampDim(d.comunicacion),
  };
}

/** Ciclo mensual de comparación ("YYYY-MM"): ancla cada respuesta a su periodo. */
export function currentPeriodKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export async function getEpTrainerForMember(memberId: string): Promise<string | null> {
  const lastEpBooking = await prisma.booking.findFirst({
    where: { memberId, status: "ATTENDED", session: { classType: "Personal Training" } },
    orderBy: { session: { date: "desc" } },
    select: { session: { select: { trainerId: true } } },
  });
  return lastEpBooking?.session.trainerId ?? null;
}

export type FeedbackCaptureResult = { ok: true } | { ok: false; error: string };

/** El propio socio, desde el portal. */
export async function submitClientFeedback(
  orgId: string,
  memberUserId: string,
  input: FeedbackDimsInput & { comment?: string }
): Promise<FeedbackCaptureResult> {
  const member = await prisma.member.findFirst({ where: { orgId, userId: memberUserId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const dims = clampDims(input);
  await prisma.$transaction([
    prisma.clientFeedback.create({
      data: { orgId, memberId: member.id, periodKey: currentPeriodKey(), ...dims, comment: input.comment?.trim() || null },
    }),
    prisma.notification.updateMany({
      where: { orgId, recipientUserId: memberUserId, entityType: CLIENT_FEEDBACK_ENTITY, entityId: member.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    }),
  ]);
  return { ok: true };
}

/** El entrenador/staff que rellena el debrief sobre un cliente concreto. */
export async function submitTrainerDebrief(
  orgId: string,
  actorUserId: string,
  memberId: string,
  input: FeedbackDimsInput & { note: string }
): Promise<FeedbackCaptureResult> {
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  const note = input.note.trim();
  if (!note) return { ok: false, error: "Añade una nota breve sobre este periodo antes de enviar." };

  const dims = clampDims(input);
  await prisma.$transaction([
    prisma.trainerDebrief.create({
      data: { orgId, memberId, trainerId: actorUserId, periodKey: currentPeriodKey(), ...dims, note },
    }),
    prisma.notification.updateMany({
      where: { orgId, recipientUserId: actorUserId, entityType: TRAINER_DEBRIEF_ENTITY, entityId: memberId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    }),
  ]);
  return { ok: true };
}

/** Tarea pendiente del socio, si la hay (banner obligatorio en /portal). */
export async function getPendingClientFeedback(orgId: string, memberUserId: string) {
  return prisma.notification.findFirst({
    where: { orgId, recipientUserId: memberUserId, entityType: CLIENT_FEEDBACK_ENTITY, resolvedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** Debriefs pendientes de un entrenador (pestaña "Feedback" del panel). */
export async function listPendingTrainerDebriefs(orgId: string, trainerUserId: string) {
  const pending = await prisma.notification.findMany({
    where: { orgId, recipientUserId: trainerUserId, entityType: TRAINER_DEBRIEF_ENTITY, resolvedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return [];

  const memberIds = pending.map((p) => p.entityId).filter((id): id is string => !!id);
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  return pending
    .map((p) => {
      const m = p.entityId ? byId.get(p.entityId) : undefined;
      if (!m) return null;
      return { memberId: m.id, name: `${m.firstName} ${m.lastName}`, dueDate: p.dueDate, createdAt: p.createdAt };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/**
 * Regla temporal (F10, /api/jobs/run): abre un ciclo nuevo para cada socio de
 * EP activo cuando su última respuesta (de cualquiera de los dos lados) tiene
 * más de FEEDBACK_CYCLE_DAYS, creando la tarea a quien falte por responder.
 */
export async function runFeedbackCycleRule(orgId: string): Promise<number> {
  const members = await prisma.member.findMany({
    where: { orgId, state: "ACTIVE", userId: { not: null } },
    select: { id: true, userId: true },
  });

  let created = 0;
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const cutoff = FEEDBACK_CYCLE_DAYS * 24 * 60 * 60 * 1000;

  for (const member of members) {
    const trainerId = await getEpTrainerForMember(member.id);
    if (!trainerId) continue; // sin sesión de EP asistida todavía: no hay ciclo que abrir

    const [lastClientFeedback, lastDebrief] = await Promise.all([
      prisma.clientFeedback.findFirst({ where: { memberId: member.id }, orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }),
      prisma.trainerDebrief.findFirst({ where: { memberId: member.id }, orderBy: { debriefAt: "desc" }, select: { debriefAt: true } }),
    ]);

    if (!lastClientFeedback || Date.now() - lastClientFeedback.submittedAt.getTime() > cutoff) {
      await createNotificationOnce({
        orgId,
        recipientUserId: member.userId!,
        kind: "TASK",
        title: "Cuéntanos cómo lo llevas",
        body: "Tu entrenador también va a valorar tus últimas semanas — responde con sinceridad, es solo tuyo.",
        entityType: CLIENT_FEEDBACK_ENTITY,
        entityId: member.id,
        dueDate,
      });
      created++;
    }

    if (!lastDebrief || Date.now() - lastDebrief.debriefAt.getTime() > cutoff) {
      await createNotificationOnce({
        orgId,
        recipientUserId: trainerId,
        kind: "TASK",
        title: "Feedback pendiente de un cliente",
        body: "Valora su progreso, adherencia y motivación de este último mes.",
        entityType: TRAINER_DEBRIEF_ENTITY,
        entityId: member.id,
        dueDate,
      });
      created++;
    }
  }
  return created;
}

/** Botón "Solicitar feedback" del board de dirección: abre el ciclo ya mismo, sin esperar al job. */
export async function requestFeedbackNow(orgId: string, memberId: string): Promise<FeedbackCaptureResult> {
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true, userId: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!member.userId) return { ok: false, error: "Este socio todavía no tiene cuenta de acceso al portal." };

  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  await createNotificationOnce({
    orgId,
    recipientUserId: member.userId,
    kind: "TASK",
    title: "Dirección quiere saber cómo lo llevas",
    body: "Tu entrenador también va a dejar su valoración — es importante que respondas tú también.",
    entityType: CLIENT_FEEDBACK_ENTITY,
    entityId: member.id,
    dueDate,
  });

  const trainerId = await getEpTrainerForMember(member.id);
  if (trainerId) {
    await createNotificationOnce({
      orgId,
      recipientUserId: trainerId,
      kind: "TASK",
      title: "Dirección ha solicitado tu feedback",
      body: "Valora a este cliente antes de la fecha indicada.",
      entityType: TRAINER_DEBRIEF_ENTITY,
      entityId: member.id,
      dueDate,
    });
  }
  return { ok: true };
}

/** Botón "Marcar como revisado": deja huella real en el debrief más reciente, no solo en el AuditLog. */
export async function markFeedbackReviewed(orgId: string, actorUserId: string, memberId: string): Promise<FeedbackCaptureResult> {
  const lastDebrief = await prisma.trainerDebrief.findFirst({
    where: { orgId, memberId },
    orderBy: { debriefAt: "desc" },
    select: { id: true },
  });
  if (!lastDebrief) return { ok: false, error: "Este socio todavía no tiene ningún debrief que revisar." };

  await prisma.trainerDebrief.update({
    where: { id: lastDebrief.id },
    data: { reviewedAt: new Date(), reviewedByUserId: actorUserId },
  });
  return { ok: true };
}

/** Botón "Programar seguimiento 1:1": tarea real al entrenador, con fecha límite. */
export async function scheduleFeedbackFollowUp(orgId: string, memberId: string): Promise<FeedbackCaptureResult> {
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true, firstName: true, lastName: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const trainerId = await getEpTrainerForMember(member.id);
  if (!trainerId) return { ok: false, error: "No hay un entrenador al que asignar el seguimiento." };

  await createNotificationOnce({
    orgId,
    recipientUserId: trainerId,
    kind: "TASK",
    title: `Seguimiento 1:1 · ${member.firstName} ${member.lastName}`,
    body: "Dirección ha programado un seguimiento 1:1 a raíz del contraste de feedback.",
    entityType: FOLLOWUP_ENTITY,
    entityId: member.id,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return { ok: true };
}
