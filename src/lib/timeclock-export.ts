import { prisma } from "@/lib/prisma";

/**
 * E10-21 · Exportación de los fichajes ANTES de retirar el módulo.
 *
 * El módulo de fichajes se apaga (decisión tomada): el widget ya estaba
 * desmontado, `crossCheckHours` tenía cero consumidores, y si se reactivase tal
 * cual **no cumpliría** —`TimeClockEntry` admite una sola entrada y una sola
 * salida por día, lo que no permite pausas ni jornadas partidas, habituales con
 * turno de mañana y tarde, y no distingue ordinarias de extraordinarias.
 *
 * Pero apagar la funcionalidad NO apaga la obligación: el art. 34.9 ET y el
 * RDL 8/2019 exigen conservar el registro de jornada **cuatro años**, y ese
 * plazo sigue corriendo aunque la pantalla desaparezca. Lo que se registró se
 * exporta y se conserva; lo que se retira es el código.
 *
 * El formato es CSV a propósito: lo que hay que poder hacer con esto es
 * entregárselo a la Inspección de Trabajo o al propio trabajador, no volver a
 * cargarlo en la aplicación.
 */

export type TimeClockExportRow = {
  workDate: string;
  userName: string;
  userEmail: string;
  centerName: string;
  clockIn: string;
  clockOut: string | null;
  minutes: number | null;
  signedAt: string | null;
};

export const TIMECLOCK_EXPORT_HEADERS = [
  "fecha",
  "trabajador",
  "email",
  "centro",
  "entrada",
  "salida",
  "minutos",
  "firmado_el",
] as const;

/** Plazo del art. 34.9 ET / RDL 8/2019, en años. */
export const TIMECLOCK_RETENTION_YEARS = 4;

function minutesOf(clockIn: string, clockOut: string | null): number | null {
  if (!clockOut) return null;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const start = toMinutes(clockIn);
  const end = toMinutes(clockOut);
  if (start == null || end == null) return null;
  // Una salida anterior a la entrada es una jornada que cruza la medianoche.
  // `TimeClockEntry` no sabe representarla —es parte de por qué el módulo se
  // apaga— así que se exporta el dato tal cual y NO se inventa el cómputo.
  return end >= start ? end - start : null;
}

/** Escape de CSV (RFC 4180): comillas dobladas y campo entrecomillado. */
function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV con `;` como separador: es lo que abre Excel en español sin pedir nada,
 * y esto acaba en la mesa de una gestoría, no en un pipeline.
 */
export function buildTimeClockCsv(rows: TimeClockExportRow[]): string {
  const lines = [TIMECLOCK_EXPORT_HEADERS.join(";")];
  for (const row of rows) {
    lines.push(
      [
        row.workDate,
        row.userName,
        row.userEmail,
        row.centerName,
        row.clockIn,
        row.clockOut,
        row.minutes,
        row.signedAt,
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  // BOM para que Excel no destroce los acentos de los nombres.
  return `﻿${lines.join("\n")}\n`;
}

type Db = typeof prisma;

/** Todos los fichajes de una organización, ordenados por trabajador y día. */
export async function collectTimeClockEntries(orgId: string, db: Db = prisma): Promise<TimeClockExportRow[]> {
  const entries = await db.timeClockEntry.findMany({
    where: { orgId },
    orderBy: [{ userId: "asc" }, { workDate: "asc" }],
    include: { user: { select: { name: true, email: true } }, center: { select: { name: true } } },
  });

  return entries.map((e) => ({
    workDate: e.workDate.toISOString().slice(0, 10),
    userName: e.user.name,
    userEmail: e.user.email,
    centerName: e.center.name,
    clockIn: e.clockIn,
    clockOut: e.clockOut,
    minutes: minutesOf(e.clockIn, e.clockOut),
    signedAt: e.signedAt ? e.signedAt.toISOString() : null,
  }));
}
