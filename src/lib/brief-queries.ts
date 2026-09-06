import { prisma } from "@/lib/prisma";
import { canViewHealthData, canViewSessionDebrief } from "@/lib/rbac";
import { isSameDay, resolveOccurrenceDate } from "@/lib/session-occurrences";
import type { Prisma, Role, AptitudeLight, InjuryZone, Laterality } from "@prisma/client";
import { OPEN_HEALTH_STATUSES } from "@/lib/health-status";
import { centerScopeFor, isCenterInScope, type ScopedUser } from "@/lib/center-scope";
import { resolveAptitude } from "@/lib/aptitude-light";
import { feelingOrigin } from "@/lib/session-debrief";

/**
 * Condición declarada tal y como viaja al brief (web y app leen lo mismo).
 *
 * E3-05: SIN `description`. La descripción clínica —medicamentos, cirugías,
 * patologías— no sale del servidor con el roster; se pide expresamente con
 * `getClinicalDetailForMember`, que audita la consulta. Lo que el brief pinta
 * es la adaptación, no el historial.
 */
export type BriefCondition = {
  /** Texto libre heredado. Se pinta si no hay zona del catálogo; nunca compara. */
  zone: string | null;
  zoneCode: InjuryZone | null;
  side: Laterality | null;
  type: string;
};

export type BriefRule = {
  injuryZone: string;
  zoneCode: InjuryZone | null;
  side: Laterality | null;
  blockArea: string;
  light: AptitudeLight;
  adaptation: string | null;
};

/**
 * E1-01 (RB-SEG-001): frontera de centro del Session Brief, para el índice.
 *
 * `canViewSessionDebrief` (rbac.ts) responde a "¿este rol puede abrir un
 * debrief?", no a "¿de qué centros?": para `OWNER`/`CENTER_DIRECTOR` decía
 * `true` ante cualquier sesión de la organización. Con eso, la dirección de La
 * Jota listaba 43 sesiones de tres centros. El `where` que devuelve esta
 * función es lo único que acota el índice, y sale del mismo `centerScopeFor`
 * que la agenda: un solo criterio de "mis centros" en toda la aplicación.
 *
 * `{}` = sin frontera de centro (dirección de organización). El `orgId` lo
 * sigue poniendo el llamante, siempre.
 */
export async function briefScopeWhere(user: ScopedUser): Promise<Prisma.ClassSessionWhereInput> {
  const scope = await centerScopeFor(user);
  if (scope === null) return {};
  return { centerId: { in: scope } };
}

export async function getSessionBrief({
  orgId,
  sessionId,
  actorUserId,
  actorRole,
  actorCenterId,
  d,
}: {
  orgId: string;
  sessionId: string;
  actorUserId: string;
  actorRole: Role;
  /** Centro base de quien pide (`User.centerId`); con las filas de `CenterMembership` forma su ámbito. */
  actorCenterId: string | null;
  /** Día de la serie que se está briefando ("YYYY-MM-DD"); por defecto, la fecha base. */
  d?: string | null;
}) {
  const row = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, state: true, joinedAt: true } },
          debrief: true,
        },
        orderBy: { member: { lastName: "asc" } },
      },
    },
  });
  if (!row) return null;

  // E1-01 (RB-SEG-001): el ámbito de centro va ANTES que cualquier otra cosa, y
  // desde luego antes de tocar `HealthRecord` o de escribir en `AuditLog`: una
  // sesión ajena no puede dejar rastro de "lectura legítima" de un dato de
  // salud que nunca se debió leer. La comprobación vive aquí, y no en cada
  // pantalla, porque web y app llaman a esta misma función: un solo arreglo
  // cierra las dos superficies.
  const inScope = await isCenterInScope(
    { id: actorUserId, role: actorRole, orgId, centerId: actorCenterId },
    row.centerId
  );
  if (!inScope) return null;

  // Solo el entrenador asignado (o quien dirigió la sesión) y dirección pueden
  // abrir el debrief individual. Devolvemos null → notFound() para no revelar
  // siquiera la existencia de la sesión a quien no le corresponde.
  if (!canViewSessionDebrief(actorRole, actorUserId, row)) return null;

  // Roster del día concreto: una serie recurrente es una sola fila, así que sin
  // filtrar por ocurrencia el brief de hoy listaba también a quien reservó la
  // semana que viene.
  const occurrenceDate = resolveOccurrenceDate(row, d);
  const session = { ...row, bookings: row.bookings.filter((b) => isSameDay(b.occurrenceDate, occurrenceDate)) };

  const canSeeHealth = canViewHealthData(actorRole);
  const memberIds = session.bookings.map((b) => b.memberId);

  const healthByMember = new Map<string, BriefCondition[]>();
  let aptitudeRules: BriefRule[] = [];

  if (canSeeHealth && memberIds.length) {
    // Todo lo que sigue vigente, no solo lo "activo": una lesión en
    // rehabilitación es justo la que más adaptación necesita, y una crónica no
    // deja de limitar por ser antigua. Solo RESOLVED se cae del brief.
    const records = await prisma.healthRecord.findMany({
      where: { memberId: { in: memberIds }, status: { in: OPEN_HEALTH_STATUSES } },
      select: { memberId: true, zone: true, zoneCode: true, side: true, type: true },
    });
    for (const r of records) {
      if (!r.memberId) continue;
      const list = healthByMember.get(r.memberId) ?? [];
      list.push({ zone: r.zone, zoneCode: r.zoneCode, side: r.side, type: r.type });
      healthByMember.set(r.memberId, list);
    }
    aptitudeRules = await prisma.aptitudeRule.findMany({ where: { orgId } });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "SESSION_BRIEF_OPENED",
        entityType: "ClassSession",
        entityId: sessionId,
        metadata: { memberIds, occurrenceDate: occurrenceDate.toISOString() },
      },
    });
  }

  const roster = session.bookings.map((b) => {
    const conditions = healthByMember.get(b.memberId) ?? [];
    // E3-02 empareja por ZONA del catálogo cerrado más lateralidad, no por
    // igualdad de dos textos libres; E3-03 pone la luz, incluida la de las
    // condiciones que todavía no tienen regla escrita.
    const { light, matchedRules, unmatchedConditions } = resolveAptitude(conditions, aptitudeRules);

    const isNew = Date.now() - b.member.joinedAt.getTime() < 21 * 24 * 60 * 60 * 1000;

    return {
      bookingId: b.id,
      member: b.member,
      isNew,
      conditions,
      matchedRules,
      /** Lo declarado que ningún regla traduce: es lo que justifica el ámbar. */
      unmatchedConditions,
      // `null` SOLO si no hay nada declarado: es lo que devuelve su significado a
      // "Sin restricciones".
      light,
      debrief: b.debrief,
    };
  });

  return {
    session,
    occurrenceDate,
    canSeeHealth,
    roster,
  };
}

// ---------- FB-1: reporte semanal de Debriefs para dirección (RB-FB-101/103/104) ----------

export type WeeklyDebriefReport = {
  trainerId: string;
  trainerName: string;
  sessions: {
    sessionId: string;
    sessionDate: Date;
    sessionName: string;
    greenCount: number;
    yellowCount: number;
    redCount: number;
    notes: string[];
    /**
     * E3-07 · histórico: cuántos de estos colores los DERIVÓ el endpoint de ocho
     * ejes (criterio retirado) en vez de ponerlos el entrenador. Un informe
     * mezclando los dos criterios no se puede leer sin saber la proporción.
     */
    derivedCount: number;
  }[];
}[];

/**
 * Agrega los SessionDebrief de la semana [weekStart, weekStart+7d) por
 * entrenador y sesión.
 *
 * E1-03 (RB-SEG-003): el informe se acota al ámbito de centro de quien lo abre.
 * Sin eso, `/feedback/debriefs-semanales` agregaba las notas de debrief —texto
 * libre del entrenador sobre cómo le fue a cada socio— de los tres centros de
 * la organización, y el total no cuadraba con la agenda de quien lo miraba.
 */
export async function getWeeklyDebriefReport(user: ScopedUser, weekStart: Date): Promise<WeeklyDebriefReport> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const debriefs = await prisma.sessionDebrief.findMany({
    where: {
      booking: {
        occurrenceDate: { gte: weekStart, lt: weekEnd },
        session: { orgId: user.orgId, ...(await briefScopeWhere(user)) },
      },
    },
    include: {
      booking: {
        select: {
          occurrenceDate: true,
          session: { select: { id: true, name: true, trainerId: true, trainer: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const byTrainer = new Map<string, WeeklyDebriefReport[number] & { sessionIndex: Map<string, WeeklyDebriefReport[number]["sessions"][number]> }>();

  for (const d of debriefs) {
    const { session: cls } = d.booking;
    const trainerId = cls.trainerId ?? "sin-entrenador";
    const trainerName = cls.trainer?.name ?? "Sin entrenador";

    let trainerEntry = byTrainer.get(trainerId);
    if (!trainerEntry) {
      trainerEntry = { trainerId, trainerName, sessions: [], sessionIndex: new Map() };
      byTrainer.set(trainerId, trainerEntry);
    }

    // Una serie recurrente puede tener varias ocurrencias dentro de la misma
    // semana: se agregan por sesión Y día, no solo por sesión.
    const key = `${cls.id}:${d.booking.occurrenceDate.toISOString()}`;
    let sessionEntry = trainerEntry.sessionIndex.get(key);
    if (!sessionEntry) {
      sessionEntry = { sessionId: cls.id, sessionDate: d.booking.occurrenceDate, sessionName: cls.name, greenCount: 0, yellowCount: 0, redCount: 0, notes: [], derivedCount: 0 };
      trainerEntry.sessionIndex.set(key, sessionEntry);
      trainerEntry.sessions.push(sessionEntry);
    }

    if (d.feeling === "GREEN") sessionEntry.greenCount++;
    else if (d.feeling === "AMBER") sessionEntry.yellowCount++;
    else if (d.feeling === "RED") sessionEntry.redCount++;
    if (d.note?.trim()) sessionEntry.notes.push(d.note.trim());
    if (feelingOrigin(d) === "DERIVED") sessionEntry.derivedCount++;
  }

  return [...byTrainer.values()]
    .map(({ trainerId, trainerName, sessions }) => ({
      trainerId,
      trainerName,
      sessions: sessions.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime()),
    }))
    .sort((a, b) => a.trainerName.localeCompare(b.trainerName));
}

// ---------- FB-2: feedback de sesión del cliente, para contrastar con el Debrief del entrenador ----------

export type ClientFeedbackBySession = Map<string, { feeling: string; rpe: number | null; comment: string | null }[]>;

/**
 * RB-FB-102: SelfAssessment kind="post-sesion" de la semana, indexado por sessionId
 * (vía el bookingId guardado en `structured`) para mostrarlo junto al SessionDebrief
 * de la misma sesión — nunca junto al canal confidencial de TrainerRating.
 */
export async function getWeeklyClientFeedback(user: ScopedUser, weekStart: Date): Promise<ClientFeedbackBySession> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const assessments = await prisma.selfAssessment.findMany({
    where: { orgId: user.orgId, kind: "post-sesion", createdAt: { gte: weekStart, lt: weekEnd } },
    select: { text: true, structured: true },
  });
  if (assessments.length === 0) return new Map();

  const bookingIds = assessments
    .map((a) => (a.structured as { bookingId?: string } | null)?.bookingId)
    .filter((id): id is string => !!id);
  // E1-03: mismo ámbito que el informe con el que se pinta. Una reserva fuera
  // de ámbito no llega al mapa, así que no puede colarse por un `sessionId` que
  // el informe no listó.
  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds }, session: { orgId: user.orgId, ...(await briefScopeWhere(user)) } },
    select: { id: true, sessionId: true },
  });
  const sessionIdByBooking = new Map(bookings.map((b) => [b.id, b.sessionId]));

  const bySession: ClientFeedbackBySession = new Map();
  for (const a of assessments) {
    const structured = a.structured as { bookingId?: string; feeling?: string; rpe?: number | null } | null;
    const sessionId = structured?.bookingId ? sessionIdByBooking.get(structured.bookingId) : undefined;
    if (!sessionId || !structured?.feeling) continue;
    const list = bySession.get(sessionId) ?? [];
    list.push({ feeling: structured.feeling, rpe: structured.rpe ?? null, comment: a.text });
    bySession.set(sessionId, list);
  }
  return bySession;
}
