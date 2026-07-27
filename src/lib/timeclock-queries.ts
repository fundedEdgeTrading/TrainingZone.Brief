import { prisma } from "@/lib/prisma";
import { zonedNow, zonedToday } from "@/lib/date-utils";

/**
 * `workDate` es un día suelto y `clockIn`/`clockOut` son "HH:MM" de reloj de
 * pared: los tres se leen de la hora del trabajador, no de la del servidor. Con
 * `new Date()` a secas, quien fichaba a las 08:21 en España veía "06:21" en su
 * jornada (y a primera hora de la mañana el fichaje caía en el día anterior).
 */
function nowHHmm(timeZone: string) {
  const d = zonedNow(timeZone);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type TimeClockResult = { ok: true } | { ok: false; error: string };

// RB-RRHH-001: entrada/salida/firma por jornada.
export async function clockIn(orgId: string, userId: string, centerId: string, timeZone: string): Promise<TimeClockResult> {
  const workDate = zonedToday(timeZone);
  const existing = await prisma.timeClockEntry.findFirst({ where: { orgId, userId, workDate } });
  if (existing) return { ok: false, error: "Ya has fichado la entrada hoy." };
  await prisma.timeClockEntry.create({ data: { orgId, userId, centerId, workDate, clockIn: nowHHmm(timeZone) } });
  return { ok: true };
}

export async function clockOut(orgId: string, userId: string, timeZone: string): Promise<TimeClockResult> {
  const workDate = zonedToday(timeZone);
  const entry = await prisma.timeClockEntry.findFirst({ where: { orgId, userId, workDate } });
  if (!entry) return { ok: false, error: "Todavía no has fichado la entrada hoy." };
  if (entry.clockOut) return { ok: false, error: "Ya has fichado la salida hoy." };
  await prisma.timeClockEntry.update({ where: { id: entry.id }, data: { clockOut: nowHHmm(timeZone) } });
  return { ok: true };
}

export async function signEntry(orgId: string, userId: string, entryId: string): Promise<TimeClockResult> {
  const entry = await prisma.timeClockEntry.findFirst({ where: { id: entryId, orgId, userId } });
  if (!entry) return { ok: false, error: "Fichaje no encontrado." };
  if (!entry.clockOut) return { ok: false, error: "Ficha primero la salida." };
  await prisma.timeClockEntry.update({ where: { id: entryId }, data: { signedAt: new Date() } });
  return { ok: true };
}

export async function listMyTimeClockEntries(orgId: string, userId: string, take = 31) {
  return prisma.timeClockEntry.findMany({ where: { orgId, userId }, orderBy: { workDate: "desc" }, take });
}

export async function listAllTimeClockEntries(orgId: string, take = 100) {
  return prisma.timeClockEntry.findMany({
    where: { orgId },
    include: { user: { select: { name: true } }, center: { select: { name: true } } },
    orderBy: { workDate: "desc" },
    take,
  });
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * RB-RRHH-002: comparativa (no bloqueante) entre horas fichadas y sesiones
 * dirigidas ese mismo día — herramienta de verificación para dirección.
 */
export async function crossCheckHours(orgId: string, timeZone: string, days = 14) {
  // `workDate` y `ClassSession.date` son días sueltos: el corte también.
  const since = zonedToday(timeZone);
  since.setDate(since.getDate() - days);

  const [entries, sessions] = await Promise.all([
    prisma.timeClockEntry.findMany({
      where: { orgId, workDate: { gte: since }, clockOut: { not: null } },
      include: { user: { select: { name: true } } },
    }),
    prisma.classSession.findMany({
      where: { orgId, date: { gte: since }, directedByUserId: { not: null } },
      select: { directedByUserId: true, date: true, startTime: true, endTime: true },
    }),
  ]);

  return entries.map((e) => {
    const clockedMinutes = timeToMinutes(e.clockOut!) - timeToMinutes(e.clockIn);
    const directedMinutes = sessions
      .filter((s) => s.directedByUserId === e.userId && s.date.toDateString() === e.workDate.toDateString())
      .reduce((sum, s) => sum + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)), 0);
    return {
      userId: e.userId,
      userName: e.user.name,
      workDate: e.workDate,
      clockedMinutes,
      directedMinutes,
      diffMinutes: clockedMinutes - directedMinutes,
    };
  });
}
