import { prisma } from "@/lib/prisma";
import { canViewTrainerRatings } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * Punto único de acceso a valoraciones de entrenadores (RB-RRHH-011/012):
 * matriz INVERTIDA respecto a health-access.ts — solo dirección puede leer,
 * NUNCA el propio entrenador (ni sobre sí mismo). Mismo patrón: gate + null
 * en vez de error, sin revelar si hay datos a quien no tiene permiso.
 */
export async function getTrainerRatings(orgId: string, actorRole: Role, trainerUserId?: string) {
  if (!canViewTrainerRatings(actorRole)) return null;
  return prisma.trainerRating.findMany({
    where: { orgId, trainerUserId: trainerUserId || undefined },
    include: { trainer: { select: { name: true } }, member: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTrainerRatingSummary(orgId: string, actorRole: Role) {
  if (!canViewTrainerRatings(actorRole)) return null;
  const rows = await prisma.trainerRating.groupBy({
    by: ["trainerUserId"],
    where: { orgId, score: { not: null } },
    _avg: { score: true },
    _count: { _all: true },
  });
  const trainers = await prisma.user.findMany({ where: { orgId, role: { in: ["TRAINER", "TRAINER_ADMIN"] }, deactivatedAt: null }, select: { id: true, name: true } });
  return trainers.map((t) => {
    const row = rows.find((r) => r.trainerUserId === t.id);
    return { trainerUserId: t.id, name: t.name, avgScore: row?._avg.score ?? null, count: row?._count._all ?? 0 };
  });
}

export type TrainerRatingWriteResult = { ok: true } | { ok: false; error: string };

/**
 * El cliente valora al entrenador que realmente le dio su última sesión de EP
 * completada (ATTENDED). Ya no hay "el entrenador asignado" del socio
 * (Member.trainerId) — puede entrenar con distintos entrenadores según la
 * sesión, así que la valoración se ancla a la sesión concreta más reciente.
 */
export async function submitTrainerRating(
  orgId: string,
  memberUserId: string,
  input: { score?: number; strengths?: string; improvements?: string }
): Promise<TrainerRatingWriteResult> {
  const member = await prisma.member.findFirst({ where: { orgId, userId: memberUserId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const lastEpBooking = await prisma.booking.findFirst({
    where: { memberId: member.id, status: "ATTENDED", session: { orgId, classType: "Personal Training" } },
    orderBy: { session: { date: "desc" } },
    select: { session: { select: { trainerId: true } } },
  });
  const trainerUserId = lastEpBooking?.session.trainerId ?? null;
  if (!trainerUserId) return { ok: false, error: "Todavía no tienes ninguna sesión de entrenamiento personal completada para valorar." };

  await prisma.trainerRating.create({
    data: {
      orgId,
      memberId: member.id,
      trainerUserId,
      score: input.score,
      strengths: input.strengths?.trim() || null,
      improvements: input.improvements?.trim() || null,
    },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// E10-16 · Derecho de acceso del entrenador a sus propias valoraciones
// ---------------------------------------------------------------------------
//
// `rbac.ts:352-355` dice: "valoraciones de entrenadores: EXCLUSIVO dirección,
// nunca el propio entrenador". El diseño está bien argumentado DESDE RRHH —una
// valoración que el valorado puede leer en caliente deja de ser sincera— pero
// la valoración que un socio hace de un entrenador **es dato personal del
// entrenador**. Si ejerce el art. 15 hay que dársela. El art. 15.4 permite
// proteger la identidad del tercero, NO negar el contenido.
//
// Esta historia crea el PROCEDIMIENTO, no abre la pantalla: el acceso directo
// desde la interfaz sigue siendo exclusivo de dirección. Lo que se añade es un
// camino, con plazo y con traza, para lo que hoy no tenía ninguno —ni siquiera
// manual.

/** Plazo del art. 12.3 RGPD: un mes desde la solicitud. */
export const SUBJECT_ACCESS_DEADLINE_DAYS = 30;

const SUBJECT_ACCESS_ENTITY = "TrainerRatingSubjectAccess";
const REQUESTED_ACTION = "TRAINER_RATING_ACCESS_REQUESTED";
const FULFILLED_ACTION = "TRAINER_RATING_ACCESS_FULFILLED";

/**
 * Aviso del art. 64.4.d ET. No es decorativo: si las valoraciones se usan para
 * decidir sobre el puesto de alguien, hay que informar a la representación
 * legal de los trabajadores, y quien toma esa decisión tiene que verlo escrito
 * en la pantalla donde la toma.
 */
export const RLT_NOTICE =
  "Si estas valoraciones se usan para una decisión laboral (promoción, retribución variable, cese), hay que " +
  "informar a la representación legal de los trabajadores conforme al art. 64.4.d ET.";

/**
 * Lo que se entrega: puntuación, fortalezas y áreas de mejora. NUNCA quién
 * escribió cada una.
 *
 * La seudonimización no es quitar el nombre y dejar el `memberId`: con el id se
 * vuelve a la ficha del socio en un clic. Cada valoración recibe una etiqueta
 * de orden ("Valoración 1") que no permite volver a nadie.
 */
export type TrainerRatingDisclosure = {
  label: string;
  score: number | null;
  strengths: string | null;
  improvements: string | null;
  date: Date;
};

export function buildTrainerRatingDisclosure(
  ratings: { score: number | null; strengths: string | null; improvements: string | null; createdAt: Date }[],
): TrainerRatingDisclosure[] {
  return ratings.map((r, i) => ({
    label: `Valoración ${i + 1}`,
    score: r.score,
    strengths: r.strengths,
    improvements: r.improvements,
    date: r.createdAt,
  }));
}

/** Fecha límite de atención de una solicitud presentada en `requestedAt`. */
export function subjectAccessDeadline(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + SUBJECT_ACCESS_DEADLINE_DAYS * 86_400_000);
}

export type SubjectAccessRequest = {
  id: string;
  trainerUserId: string;
  trainerName: string;
  requestedAt: Date;
  deadline: Date;
  /** ¿Se ha pasado ya el mes del art. 12.3? Se calcula aquí y no en la
   *  pantalla: un `Date.now()` dentro del render no es puro. */
  late: boolean;
  fulfilledAt: Date | null;
};

/**
 * El entrenador presenta su solicitud. No lee nada: abre una tarea para
 * dirección con el plazo del art. 12.3 puesto, y deja el apunte en `AuditLog`
 * —que es lo que acredita la fecha de la solicitud si alguien la discute.
 */
export async function requestOwnTrainerRatings(
  orgId: string,
  trainerUserId: string,
  now: Date = new Date(),
): Promise<{ ok: true; deadline: Date } | { ok: false; error: string }> {
  const open = await prisma.notification.findFirst({
    where: { orgId, entityType: SUBJECT_ACCESS_ENTITY, entityId: trainerUserId, resolvedAt: null },
    select: { id: true, dueDate: true },
  });
  if (open) return { ok: false, error: "Ya tienes una solicitud en curso." };

  const trainer = await prisma.user.findFirst({
    where: { id: trainerUserId, orgId },
    select: { id: true, name: true },
  });
  if (!trainer) return { ok: false, error: "No se ha encontrado tu usuario." };

  // La tarea va a dirección, que es quien puede leer las valoraciones. Si no
  // hubiera nadie con ese rol, la solicitud se quedaría sin destinatario: se
  // dice, en vez de crear una tarea que no verá nadie.
  const directors = await prisma.user.findMany({
    where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR", "HR_MANAGER"] }, deactivatedAt: null },
    select: { id: true },
  });
  if (directors.length === 0) {
    return { ok: false, error: "No hay nadie en dirección a quien dirigir la solicitud. Habla con tu centro." };
  }

  const deadline = subjectAccessDeadline(now);
  await prisma.notification.createMany({
    data: directors.map((d) => ({
      orgId,
      recipientUserId: d.id,
      createdByUserId: trainerUserId,
      kind: "TASK" as const,
      title: `Derecho de acceso: ${trainer.name} pide sus valoraciones`,
      body:
        "Art. 15 RGPD. Hay que entregarle puntuación, fortalezas y áreas de mejora, SIN decir quién escribió cada " +
        `valoración (art. 15.4). Plazo: ${SUBJECT_ACCESS_DEADLINE_DAYS} días desde la solicitud (art. 12.3).`,
      entityType: SUBJECT_ACCESS_ENTITY,
      entityId: trainerUserId,
      category: "Cumplimiento",
      priority: "ALTA" as const,
      dueDate: deadline,
    })),
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: trainerUserId,
      action: REQUESTED_ACTION,
      entityType: SUBJECT_ACCESS_ENTITY,
      entityId: trainerUserId,
      metadata: { deadline: deadline.toISOString() },
    },
  });

  return { ok: true, deadline };
}

/** Estado de la solicitud del propio entrenador, para su perfil. */
export async function getOwnSubjectAccessStatus(
  orgId: string,
  trainerUserId: string,
): Promise<{ requestedAt: Date; deadline: Date; fulfilledAt: Date | null } | null> {
  const request = await prisma.auditLog.findFirst({
    where: { orgId, entityType: SUBJECT_ACCESS_ENTITY, entityId: trainerUserId, action: REQUESTED_ACTION },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!request) return null;

  const fulfilled = await prisma.auditLog.findFirst({
    where: {
      orgId,
      entityType: SUBJECT_ACCESS_ENTITY,
      entityId: trainerUserId,
      action: FULFILLED_ACTION,
      createdAt: { gte: request.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return {
    requestedAt: request.createdAt,
    deadline: subjectAccessDeadline(request.createdAt),
    fulfilledAt: fulfilled?.createdAt ?? null,
  };
}

/** Solicitudes abiertas, para que dirección sepa cuáles tiene encima. */
export async function listOpenSubjectAccessRequests(
  orgId: string,
  actorRole: Role,
  now: Date = new Date(),
): Promise<SubjectAccessRequest[] | null> {
  if (!canViewTrainerRatings(actorRole)) return null;
  const rows = await prisma.notification.findMany({
    where: { orgId, entityType: SUBJECT_ACCESS_ENTITY, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, entityId: true, createdAt: true, dueDate: true, createdBy: { select: { name: true } } },
  });

  // Una solicitud genera una tarea por cada persona de dirección: para esta
  // lista es UNA solicitud, no tres.
  const seen = new Set<string>();
  const out: SubjectAccessRequest[] = [];
  for (const row of rows) {
    if (!row.entityId || seen.has(row.entityId)) continue;
    seen.add(row.entityId);
    const deadline = row.dueDate ?? subjectAccessDeadline(row.createdAt);
    out.push({
      id: row.id,
      trainerUserId: row.entityId,
      trainerName: row.createdBy?.name ?? "—",
      requestedAt: row.createdAt,
      deadline,
      late: deadline.getTime() < now.getTime(),
      fulfilledAt: null,
    });
  }
  return out;
}

/**
 * Dirección atiende la solicitud: se genera lo que hay que entregar, se anota
 * la entrega y se cierran las tareas. El entrenador NUNCA lee esto por su
 * cuenta —la pantalla sigue siendo de dirección— pero ahora existe el camino.
 */
export async function fulfilTrainerRatingAccess(
  orgId: string,
  actor: { userId: string; role: Role },
  trainerUserId: string,
): Promise<{ ok: true; disclosure: TrainerRatingDisclosure[] } | { ok: false; error: string }> {
  if (!canViewTrainerRatings(actor.role)) return { ok: false, error: "No tienes permiso para atender esta solicitud." };

  const ratings = await prisma.trainerRating.findMany({
    where: { orgId, trainerUserId },
    orderBy: { createdAt: "asc" },
    // Sin `memberId` y sin incluir al socio: con el id se vuelve a su ficha en
    // un clic, y lo que el art. 15.4 protege es justamente esa identidad.
    select: { score: true, strengths: true, improvements: true, createdAt: true },
  });

  const disclosure = buildTrainerRatingDisclosure(ratings);

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: actor.userId,
      action: FULFILLED_ACTION,
      entityType: SUBJECT_ACCESS_ENTITY,
      entityId: trainerUserId,
      metadata: { ratings: disclosure.length, pseudonymized: true },
    },
  });

  await prisma.notification.updateMany({
    where: { orgId, entityType: SUBJECT_ACCESS_ENTITY, entityId: trainerUserId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });

  return { ok: true, disclosure };
}
