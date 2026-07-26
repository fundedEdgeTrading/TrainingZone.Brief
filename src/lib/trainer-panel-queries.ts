import { prisma } from "@/lib/prisma";
import { canViewHealthData } from "@/lib/rbac";
import { startOfWeekMonday, formatDateParam } from "@/lib/date-utils";
import { expandOccurrences, occurrencesInRange, occursOn, ownSessionsWhere, sessionsInRangeWhere } from "@/lib/session-occurrences";
import type { AptitudeLight, Role } from "@prisma/client";

const ADHERENCE_PERIOD_DAYS = 90;
const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** "18.5" -> "18,5" · "26" -> "26" (sin decimales de sobra, coma española). */
export function formatHoursEs(n: number) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace(".", ",");
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Etiqueta corta de fecha relativa para la columna "Próxima" / metas de aptitud. */
function formatNextLabel(date: Date, startTime: string, today: Date) {
  const days = Math.round((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return `Hoy ${startTime}`;
  if (days === 1) return `Mañana ${startTime}`;
  if (days > 1 && days < 7) {
    const weekday = date.toLocaleDateString("es-ES", { weekday: "short" });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)} ${startTime}`;
  }
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function formatRelative(diffMs: number) {
  const past = diffMs >= 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return past ? `hace ${minutes} min` : `en ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const label = rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  return past ? `hace ${label}` : `en ${label}`;
}

type Tone = "good" | "warning" | "critical" | "gold" | "neutral";

/** RB-RRHH-005 (rediseño): panel operativo del entrenador — agenda de hoy, pendientes,
 * huecos de EP, reconocimiento y clientes de EP, todo derivado de datos reales. */
export async function getTrainerPanelData(orgId: string, trainerUserId: string, actorRole: Role, agendaDay?: Date) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Día mostrado en la tarjeta "Agenda de hoy": hoy por defecto, o el día
  // navegado (nunca antes de hoy, ver `trainer/page.tsx`).
  const selectedDay = new Date(agendaDay ?? today);
  selectedDay.setHours(0, 0, 0, 0);
  const agendaIsToday = selectedDay.getTime() === today.getTime();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  // Acotado por arriba: sin fin de mes, "horas de este mes" sumaba también las
  // sesiones ya agendadas de meses siguientes y el delta comparaba un rango
  // abierto contra un mes cerrado.
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);
  const sparklineStart = addDays(weekStart, -5 * 7);

  const since90 = addDays(today, -ADHERENCE_PERIOD_DAYS);
  const sevenDaysAgo = addDays(today, -7);

  const ownSessionFilter = ownSessionsWhere(trainerUserId);
  const tomorrow = addDays(today, 1);

  const [
    epClientsRaw,
    monthSessions,
    prevMonthSessions,
    sparklineSessions,
    todaySessionsRaw,
    pastWeekSessionsRaw,
    epSlotSessionsRaw,
    briefOpenedLogs,
    orgAdherenceBookings,
  ] = await Promise.all([
    prisma.member.findMany({
      where: { orgId, trainerId: trainerUserId, state: "ACTIVE" },
      include: {
        subscriptions: { where: { status: "ACTIVE" }, include: { plan: { select: { name: true } } } },
        bookings: { where: { status: "ATTENDED" }, select: { id: true } },
      },
    }),
    prisma.classSession.findMany({
      where: { orgId, status: "SCHEDULED", ...sessionsInRangeWhere(monthStart, monthEnd), ...ownSessionFilter },
      select: { classType: true, startTime: true, endTime: true, date: true, recurrence: true, recUntil: true },
    }),
    prisma.classSession.findMany({
      where: { orgId, status: "SCHEDULED", ...sessionsInRangeWhere(prevMonthStart, monthStart), ...ownSessionFilter },
      select: { classType: true, startTime: true, endTime: true, date: true, recurrence: true, recUntil: true },
    }),
    prisma.classSession.findMany({
      where: { orgId, status: "SCHEDULED", classType: { not: "Personal Training" }, ...sessionsInRangeWhere(sparklineStart, weekEnd), ...ownSessionFilter },
      select: { date: true, startTime: true, endTime: true, recurrence: true, recUntil: true },
    }),
    prisma.classSession.findMany({
      where: { orgId, status: "SCHEDULED", ...sessionsInRangeWhere(today, tomorrow), ...ownSessionFilter },
      include: {
        bookings: {
          where: { status: { not: "CANCELLED" } },
          include: { member: { select: { id: true, firstName: true, lastName: true } }, debrief: { select: { rpe: true } } },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    // Hasta `tomorrow`, no hasta `today`: una sesión que terminó esta mañana ya
    // tiene el debrief pendiente. Excluirla dejaba la tarjeta de la agenda de
    // hoy avisando de un pendiente que la lista de Pendientes no mostraba.
    prisma.classSession.findMany({
      where: { orgId, status: "SCHEDULED", ...sessionsInRangeWhere(sevenDaysAgo, tomorrow), ...ownSessionFilter },
      include: { bookings: { where: { status: { not: "CANCELLED" } }, select: { status: true, debrief: { select: { id: true } } } } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    }),
    prisma.classSession.findMany({
      where: { orgId, trainerId: trainerUserId, classType: "Personal Training", selfBookable: true, status: "SCHEDULED", ...sessionsInRangeWhere(weekStart, weekEnd) },
      include: { bookings: { where: { status: { not: "CANCELLED" } }, select: { id: true } } },
    }),
    prisma.auditLog.findMany({
      where: { orgId, action: "SESSION_BRIEF_OPENED", entityType: "ClassSession", createdAt: { gte: today } },
      select: { entityId: true },
    }),
    prisma.booking.findMany({
      where: { status: { in: ["ATTENDED", "NO_SHOW"] }, session: { orgId, date: { gte: since90 } }, member: { orgId, state: "ACTIVE" } },
      select: { status: true },
    }),
  ]);

  // Solo se consulta aparte cuando se navega a un día distinto de hoy; el caso
  // por defecto reutiliza `todaySessionsRaw` sin una segunda ida a BD.
  const agendaDaySessionsRaw = agendaIsToday
    ? todaySessionsRaw
    : await prisma.classSession.findMany({
        where: { orgId, status: "SCHEDULED", ...sessionsInRangeWhere(selectedDay, addDays(selectedDay, 1)), ...ownSessionFilter },
        include: {
          bookings: {
            where: { status: { not: "CANCELLED" } },
            include: { member: { select: { id: true, firstName: true, lastName: true } }, debrief: { select: { rpe: true } } },
          },
        },
        orderBy: { startTime: "asc" },
      });

  // ---------- KPIs: horas EP / grupos, delta mensual, adherencia media ----------
  // Una serie recurrente cuenta una vez por ocurrencia dentro del rango, no una
  // vez por fila: si no, una sesión semanal sumaba una sola hora al mes.
  function sumMinutesByType(
    sessions: { classType: string; startTime: string; endTime: string; date: Date; recurrence: "NONE" | "WEEKLY" | "WEEKDAYS"; recUntil: Date | null }[],
    from: Date,
    to: Date
  ) {
    let ep = 0;
    let group = 0;
    for (const s of sessions) {
      const minutes = (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) * occurrencesInRange(s, from, to).length;
      if (s.classType === "Personal Training") ep += minutes;
      else group += minutes;
    }
    return { ep, group };
  }
  const thisMonth = sumMinutesByType(monthSessions, monthStart, monthEnd);
  const prevMonth = sumMinutesByType(prevMonthSessions, prevMonthStart, monthStart);
  const epHours = Number((thisMonth.ep / 60).toFixed(1));
  const groupHours = Number((thisMonth.group / 60).toFixed(1));
  const monthDelta = Number(((thisMonth.ep - prevMonth.ep) / 60).toFixed(1));

  const sparklineBuckets = Array.from({ length: 6 }, (_, i) => {
    const bucketStart = addDays(weekStart, -(5 - i) * 7);
    const bucketEnd = addDays(bucketStart, 7);
    return sparklineSessions.reduce(
      (sum, s) =>
        sum + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) * occurrencesInRange(s, bucketStart, bucketEnd).length,
      0
    );
  });
  const sparklineMax = Math.max(1, ...sparklineBuckets);
  const groupSparkline = sparklineBuckets.map((m) => Math.max(8, Math.round((m / sparklineMax) * 100)));

  // ---------- Aptitud: lectura única y auditada de salud para todos los clientes de EP ----------
  const canSeeHealth = canViewHealthData(actorRole);
  const memberIds = epClientsRaw.map((m) => m.id);
  const healthLightByMember = new Map<string, { light: AptitudeLight; zone: string | null; description: string; adaptation: string | null }>();

  if (canSeeHealth && memberIds.length) {
    const [healthRecords, aptitudeRules] = await Promise.all([
      prisma.healthRecord.findMany({
        where: { memberId: { in: memberIds }, status: "ACTIVE" },
        select: { memberId: true, zone: true, description: true },
      }),
      prisma.aptitudeRule.findMany({ where: { orgId } }),
    ]);
    const LIGHT_RANK: Record<AptitudeLight, number> = { RED: 2, AMBER: 1, GREEN: 0 };
    for (const record of healthRecords) {
      if (!record.memberId || !record.zone) continue;
      const rule = aptitudeRules
        .filter((r) => r.injuryZone === record.zone)
        .sort((a, b) => LIGHT_RANK[b.light] - LIGHT_RANK[a.light])[0];
      if (!rule) continue;
      const current = healthLightByMember.get(record.memberId);
      if (!current || LIGHT_RANK[rule.light] > LIGHT_RANK[current.light]) {
        healthLightByMember.set(record.memberId, { light: rule.light, zone: record.zone, description: record.description, adaptation: rule.adaptation });
      }
    }

    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: trainerUserId,
        action: "TRAINER_PANEL_HEALTH_READ",
        entityType: "Member",
        entityId: trainerUserId,
        metadata: { memberIds },
      },
    });
  }

  // ---------- Clientes de EP (tabla + KPI) ----------
  const nextBookingByMember = new Map<string, { date: Date; startTime: string }>();
  const futureBookings = await prisma.booking.findMany({
    where: { memberId: { in: memberIds }, status: "BOOKED", session: { orgId, date: { gte: today }, status: "SCHEDULED" } },
    include: { session: { select: { date: true, startTime: true } } },
    orderBy: { session: { date: "asc" } },
  });
  for (const b of futureBookings) {
    if (!nextBookingByMember.has(b.memberId)) nextBookingByMember.set(b.memberId, b.session);
  }

  const since90Bookings = await prisma.booking.findMany({
    where: { memberId: { in: memberIds }, status: { in: ["ATTENDED", "NO_SHOW"] }, session: { date: { gte: since90 } } },
    select: { memberId: true, status: true },
  });
  const adherenceByMember = new Map<string, number>();
  for (const memberId of memberIds) {
    const rows = since90Bookings.filter((b) => b.memberId === memberId);
    const attended = rows.filter((b) => b.status === "ATTENDED").length;
    adherenceByMember.set(memberId, rows.length ? Math.round((attended / rows.length) * 100) : 0);
  }

  const epClients = epClientsRaw.map((m) => {
    const next = nextBookingByMember.get(m.id);
    const health = healthLightByMember.get(m.id);
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      note: m.notes?.trim() || null,
      planNames: m.subscriptions.map((s) => s.plan.name).join(", "),
      attendedCount: m.bookings.length,
      adherencePct: adherenceByMember.get(m.id) ?? 0,
      nextLabel: next ? formatNextLabel(next.date, next.startTime, today) : "Sin cita",
      light: health?.light ?? null,
    };
  });
  const newThisMonth = epClientsRaw.filter((m) => m.joinedAt >= monthStart).length;

  const orgAttended = orgAdherenceBookings.filter((b) => b.status === "ATTENDED").length;
  const orgAdherencePct = orgAdherenceBookings.length ? Math.round((orgAttended / orgAdherenceBookings.length) * 100) : 0;
  const adherenceAvg = epClients.length ? Math.round(epClients.reduce((s, c) => s + c.adherencePct, 0) / epClients.length) : 0;

  // ---------- Agenda de hoy + spotlight ----------
  // `sessionsInRangeWhere` es deliberadamente amplio a nivel de BD (deja pasar
  // cualquier fila de una serie recurrente vigente, sin comprobar el día de la
  // semana); sin proyectar con `expandOccurrences` antes de mapear, la agenda
  // mostraba también series que ese día en concreto no tienen ocurrencia.
  function buildSessionItem(s: (typeof todaySessionsRaw)[number], dayIsToday: boolean) {
    const startMin = timeToMinutes(s.startTime);
    const endMin = timeToMinutes(s.endTime);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const status: "past" | "current" | "upcoming" = !dayIsToday
      ? "upcoming"
      : nowMin >= endMin
        ? "past"
        : nowMin >= startMin
          ? "current"
          : "upcoming";
    const active = s.bookings.filter((b) => b.status !== "CANCELLED");
    const attended = active.filter((b) => b.status === "ATTENDED");
    const noShow = active.filter((b) => b.status === "NO_SHOW");
    const booked = active.filter((b) => b.status === "BOOKED");
    const isPersonal = s.classType === "Personal Training";
    const soloMember = isPersonal && active[0]?.member ? `${active[0].member.firstName} ${active[0].member.lastName}` : null;
    const briefOpened = briefOpenedLogs.some((l) => l.entityId === s.id);
    const room = s.room ?? "Sala sin asignar";

    let meta: string;
    let chipLabel: string;
    let chipTone: Tone;
    if (status === "past") {
      if (isPersonal) {
        const rpe = attended[0]?.debrief?.rpe;
        meta = `${room} · ${attended.length ? "asistió" : noShow.length ? "no asistió" : "sin registrar"}${rpe ? ` · RPE ${rpe}` : ""}`;
      } else {
        meta = `${room} · ${attended.length} de ${active.length} ${attended.length === 1 ? "asistió" : "asistieron"}${noShow.length ? ` · ${noShow.length} no-show` : ""}`;
      }
      const missingDebrief = attended.some((b) => !b.debrief);
      chipLabel = missingDebrief ? "Debrief pendiente" : "Debrief";
      chipTone = missingDebrief ? "warning" : "good";
    } else if (status === "current") {
      meta = `${room} · en curso ahora mismo`;
      chipLabel = "Ahora";
      chipTone = "neutral";
    } else {
      const memberLight = isPersonal ? healthLightByMember.get(active[0]?.member.id ?? "")?.light : undefined;
      meta = isPersonal
        ? `${room} · sesión con ${soloMember ?? "cliente"}`
        : `${room} · ${booked.length} de ${s.capacity} reservas${active.length - booked.length > 0 ? ` · ${active.length - booked.length} en lista de espera` : ""}`;
      if (memberLight === "RED") {
        chipLabel = "Aptitud roja";
        chipTone = "critical";
      } else if (memberLight === "AMBER") {
        chipLabel = "Aptitud ámbar";
        chipTone = "warning";
      } else if (!briefOpened) {
        chipLabel = "Brief sin abrir";
        chipTone = "gold";
      } else {
        const free = s.capacity - booked.length;
        chipLabel = free > 0 ? `${free} plazas libres` : "Completa";
        chipTone = "neutral";
      }
    }

    return {
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMin: endMin - startMin,
      title: isPersonal && soloMember ? `${s.classType} · ${soloMember}` : s.classType,
      classType: s.classType,
      status,
      meta,
      chipLabel,
      chipTone,
      progressPct: status === "current" ? Math.round(Math.min(100, Math.max(0, ((nowMin - startMin) / (endMin - startMin)) * 100))) : 0,
      minutesRemaining: status === "current" ? Math.max(0, endMin - nowMin) : null,
      minutesUntil: status === "upcoming" && dayIsToday ? Math.max(0, startMin - nowMin) : null,
      soloMember,
      soloMemberId: isPersonal ? active[0]?.member.id ?? null : null,
    };
  }

  const todaySessions = expandOccurrences(todaySessionsRaw, today, tomorrow).map(({ session }) => buildSessionItem(session, true));
  // Reutiliza `todaySessions` cuando se navega al día de hoy: mismo cálculo,
  // sin proyectar dos veces.
  const agendaSessions = agendaIsToday
    ? todaySessions
    : expandOccurrences(agendaDaySessionsRaw, selectedDay, addDays(selectedDay, 1)).map(({ session }) => buildSessionItem(session, false));

  const currentSession = todaySessions.find((s) => s.status === "current") ?? null;
  const nextSession = currentSession ? null : todaySessions.find((s) => s.status === "upcoming") ?? null;
  const completedCount = todaySessions.filter((s) => s.status === "past").length;
  const nextInMinutes = currentSession ? 0 : nextSession?.minutesUntil ?? null;

  // ---------- Pendientes: debriefs, briefs, aptitud ----------
  // `expandOccurrences` ordena ascendente; en Pendientes interesa lo más reciente arriba.
  const pendingDebriefs = expandOccurrences(pastWeekSessionsRaw, sevenDaysAgo, tomorrow)
    .reverse()
    .map(({ session: s, date }) => {
      const active = s.bookings;
      const attended = active.filter((b) => b.status === "ATTENDED");
      if (!attended.length || attended.every((b) => b.debrief)) return null;
      const endedAt = new Date(date);
      endedAt.setHours(...(s.endTime.split(":").map(Number) as [number, number]), 0, 0);
      // Una sesión de hoy solo tiene el debrief pendiente cuando ya ha acabado.
      if (endedAt > now) return null;
      const dayLabel =
        date.getTime() === today.getTime()
          ? "Hoy"
          : date.getTime() === addDays(today, -1).getTime()
            ? "Ayer"
            : date.toLocaleDateString("es-ES", { weekday: "long" });
      return {
        sessionId: s.id,
        occurrenceDate: formatDateParam(date),
        label: `${dayLabel} · ${s.startTime}`,
        relative: formatRelative(now.getTime() - endedAt.getTime()),
        title: s.classType,
        detail: `${attended.length} ${attended.length === 1 ? "asistente" : "asistentes"} · sin semáforo asignado`,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const pendingBriefs = todaySessions
    .filter((s) => s.status === "upcoming" && !briefOpenedLogs.some((l) => l.entityId === s.id))
    .map((s) => {
      const startMin = timeToMinutes(s.startTime);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      return {
        sessionId: s.id,
        occurrenceDate: formatDateParam(today),
        label: `Hoy · ${s.startTime}`,
        relative: formatRelative(-(startMin - nowMin) * 60000),
        title: s.title,
        detail: s.meta,
      };
    });

  const aptitudeAlerts = epClients
    .filter((c) => c.light === "AMBER" || c.light === "RED")
    .map((c) => {
      const health = healthLightByMember.get(c.id)!;
      return {
        memberId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        light: c.light as "AMBER" | "RED",
        zone: health.zone,
        description: health.description,
        adaptation: health.adaptation,
        meta: c.nextLabel === "Sin cita" ? "sin próxima cita" : `sesión ${c.nextLabel.toLowerCase()}`,
      };
    });

  // ---------- Huecos de EP de la semana ----------
  const slotsByDay = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const isToday = day.getTime() === today.getTime();
    const daySessions = epSlotSessionsRaw.filter((s) => occursOn(s, day));
    return {
      dayLabel: WEEKDAY_LABELS[i],
      isToday,
      reservedCount: daySessions.filter((s) => s.bookings.length > 0).length,
      freeCount: daySessions.filter((s) => s.bookings.length === 0).length,
    };
  });
  const slotsMax = Math.max(1, ...slotsByDay.map((d) => d.reservedCount + d.freeCount));
  const epSlots = slotsByDay.map((d) => ({
    ...d,
    reservedPct: Math.round((d.reservedCount / slotsMax) * 100),
    freePct: Math.round((d.freeCount / slotsMax) * 100),
  }));
  // Contados por ocurrencia de la semana, igual que las barras, no por fila.
  const epSlotsPublished = slotsByDay.reduce((sum, d) => sum + d.reservedCount + d.freeCount, 0);
  const epSlotsReserved = slotsByDay.reduce((sum, d) => sum + d.reservedCount, 0);

  return {
    epHours,
    groupHours,
    monthDelta,
    groupSparkline,
    epClients,
    epClientsNewThisMonth: newThisMonth,
    adherenceAvg,
    orgAdherencePct,
    todaySessions,
    currentSession,
    nextSession,
    completedCount,
    nextInMinutes,
    agendaDay: selectedDay,
    agendaIsToday,
    agendaSessions,
    pendingDebriefs,
    pendingBriefs,
    aptitudeAlerts,
    epSlots,
    epSlotsPublished,
    epSlotsReserved,
  };
}
