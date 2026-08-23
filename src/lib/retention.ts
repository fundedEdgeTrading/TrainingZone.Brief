import type { RetentionRiskLevel } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { orgHasFeature } from "@/lib/entitlements";

/**
 * El cliente con el que trabaja el motor. La app pasa el singleton; el seed
 * pasa el suyo (tiene su propio `PrismaClient` y su propio `$disconnect`), que
 * es lo que permite que ambos compartan ESTE cálculo en vez de tener cada uno
 * el suyo, que es como empezó todo.
 */
type Db = typeof prisma;

/**
 * Motor de retención (G.3): caída de frecuencia de asistencia respecto a la
 * línea base personal del socio.
 *
 * Hasta ahora esta lógica solo existía dentro de `prisma/seed.ts`, así que las
 * `RetentionAlert` se calculaban UNA vez —al sembrar la demo— y nunca más: en
 * un despliegue real la señal nacía congelada. El cálculo vive aquí y lo dispara
 * el cron (`/api/jobs/run`) como una regla más, junto al resto de reglas
 * temporales; el seed llama a esta misma función para no tener dos criterios.
 *
 * No hay pantalla propia: la señal se lee donde dirección ya mira —el listado de
 * socios y su ficha— y alimenta `attendanceDropping` en `stall-detection.ts`.
 */

/** Ventana de la línea base: de -98 a -14 días, es decir 12 semanas cerradas. */
const BASELINE_FROM_DAYS = 98;
const BASELINE_WEEKS = 12;
/** Ventana reciente: las 2 últimas semanas. */
const RECENT_DAYS = 14;
const RECENT_WEEKS = 2;

/**
 * Por debajo de esta línea base no hay hábito del que caerse: quien venía media
 * vez por semana no genera señal, solo ruido.
 */
const MIN_BASELINE_FREQ = 0.4;

/** Caída (negativa) a partir de la cual hay alerta, y a partir de la cual es alta. */
const MEDIUM_DROP = -0.6;
const HIGH_DROP = -0.85;

/**
 * Al recuperarse un socio se cierra su alerta, pero no se vuelve a abrir otra
 * hasta pasada esta ventana: sin ella, quien oscila alrededor del umbral genera
 * una fila nueva en cada pasada del cron.
 */
const REALERT_COOLDOWN_DAYS = 14;

const DAY_MS = 86_400_000;

export type RetentionSignal = {
  /** Sesiones/semana en las 12 semanas previas a la ventana reciente. */
  baselineFreq: number;
  /** Sesiones/semana en las 2 últimas semanas. */
  recentFreq: number;
  /** Caída porcentual, NEGATIVA (-76 = ha bajado un 76 %). */
  dropPct: number;
  riskLevel: RetentionRiskLevel;
};

function daysBefore(today: Date, days: number): Date {
  return new Date(today.getTime() - days * DAY_MS);
}

/**
 * Núcleo del motor, sin base de datos para poder probarlo: dadas las fechas de
 * asistencia de un socio, ¿hay caída de frecuencia? `null` = no hay señal.
 */
export function computeRetentionSignal(attendanceDates: Date[], today: Date): RetentionSignal | null {
  const baselineFrom = daysBefore(today, BASELINE_FROM_DAYS);
  const recentFrom = daysBefore(today, RECENT_DAYS);

  const baselineCount = attendanceDates.filter((d) => d >= baselineFrom && d < recentFrom).length;
  const recentCount = attendanceDates.filter((d) => d >= recentFrom).length;

  const baselineFreq = baselineCount / BASELINE_WEEKS;
  const recentFreq = recentCount / RECENT_WEEKS;

  if (baselineFreq < MIN_BASELINE_FREQ) return null;

  const drop = (recentFreq - baselineFreq) / baselineFreq;
  if (drop > MEDIUM_DROP) return null;

  return {
    baselineFreq: Number(baselineFreq.toFixed(2)),
    recentFreq: Number(recentFreq.toFixed(2)),
    dropPct: Number((drop * 100).toFixed(0)),
    riskLevel: drop <= HIGH_DROP ? "HIGH" : "MEDIUM",
  };
}

/**
 * Frase corta que acompaña a la alerta: desde cuándo no viene.
 *
 * El seed metía aquí la lesión activa del socio ("Reportó lumbalgia el 12/3").
 * No se replica: eso es copiar un `HealthRecord` a una tabla que no es de salud,
 * fuera del único punto de lectura auditado (`health-access.ts`) y en claro. La
 * alerta viaja a sitios —el listado de socios— donde llega recepción, que por la
 * matriz de permisos (A.2.4/A.2.5) no puede ver datos de salud. La causa clínica
 * se mira en la ficha, por su camino, que además deja rastro en `AuditLog`.
 */
export function buildAlertContext(attendanceDates: Date[], today: Date): string | null {
  const last = attendanceDates.length ? attendanceDates[attendanceDates.length - 1] : null;
  if (!last) return "Sin asistencias registradas en las últimas semanas.";
  return `Última clase hace ${Math.round((today.getTime() - last.getTime()) / DAY_MS)} días.`;
}

/**
 * Recalcula las alertas de una organización. Devuelve cuántas ha abierto.
 *
 * Es idempotente: sobre un socio que ya tiene alerta abierta refresca las cifras
 * en vez de apilar filas —el problema original era justamente una lista con
 * números congelados—, y cierra como `RECOVERED` la de quien ha vuelto.
 */
export async function runRetentionAlertRule(orgId: string, now: Date = new Date(), db: Db = prisma): Promise<number> {
  // RB-PLAN-003: la retención es inteligencia construida sobre el dato, no el
  // dato en sí, así que va con el plan contratado. Sin esto, un cliente Esencial
  // acumularía alertas que su plan no le deja ver.
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !orgHasFeature(org, "retencion")) return 0;

  const members = await db.member.findMany({
    where: { orgId, state: "ACTIVE" },
    select: { id: true },
  });
  if (members.length === 0) return 0;

  const memberIds = members.map((m) => m.id);
  const baselineFrom = daysBefore(now, BASELINE_FROM_DAYS);

  const [attendance, liveAlerts] = await Promise.all([
    db.booking.findMany({
      where: { memberId: { in: memberIds }, status: "ATTENDED", occurrenceDate: { gte: baselineFrom } },
      select: { memberId: true, occurrenceDate: true },
      orderBy: { occurrenceDate: "asc" },
    }),
    db.retentionAlert.findMany({
      where: { memberId: { in: memberIds } },
      select: { id: true, memberId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const datesByMember = new Map<string, Date[]>();
  for (const row of attendance) {
    const list = datesByMember.get(row.memberId);
    if (list) list.push(row.occurrenceDate);
    else datesByMember.set(row.memberId, [row.occurrenceDate]);
  }

  // `orderBy` desc + primer valor que gana = la más reciente de cada socio.
  const openByMember = new Map<string, { id: string }>();
  const lastAlertAtByMember = new Map<string, Date>();
  for (const alert of liveAlerts) {
    if (!lastAlertAtByMember.has(alert.memberId)) lastAlertAtByMember.set(alert.memberId, alert.createdAt);
    if (alert.status === "OPEN" && !openByMember.has(alert.memberId)) {
      openByMember.set(alert.memberId, { id: alert.id });
    }
  }

  const cooldownFrom = daysBefore(now, REALERT_COOLDOWN_DAYS);
  let created = 0;

  for (const memberId of memberIds) {
    const dates = datesByMember.get(memberId) ?? [];
    const signal = computeRetentionSignal(dates, now);
    const open = openByMember.get(memberId);

    if (!signal) {
      // Ha vuelto a su ritmo: la alerta se cierra sola. Sin esto, y sin pantalla
      // donde despacharlas a mano, una alerta abierta no se cerraría nunca.
      if (open) {
        await db.retentionAlert.update({
          where: { id: open.id },
          data: { status: "RECOVERED", resolvedAt: now },
        });
      }
      continue;
    }

    const context = buildAlertContext(dates, now);

    if (open) {
      await db.retentionAlert.update({
        where: { id: open.id },
        data: { ...signal, context },
      });
      continue;
    }

    const lastAlertAt = lastAlertAtByMember.get(memberId);
    if (lastAlertAt && lastAlertAt >= cooldownFrom) continue;

    await db.retentionAlert.create({ data: { memberId, ...signal, context } });
    created++;
  }

  return created;
}

/**
 * Alertas abiertas de un conjunto de socios, para pintar la señal en el listado
 * y en la ficha. Devuelve un mapa por `memberId` (a lo sumo una por socio: el
 * motor mantiene una única abierta).
 */
export async function openRetentionAlertsByMember(memberIds: string[], db: Db = prisma) {
  if (memberIds.length === 0) return new Map<string, RetentionSignal>();

  const alerts = await db.retentionAlert.findMany({
    where: { memberId: { in: memberIds }, status: "OPEN" },
    select: { memberId: true, baselineFreq: true, recentFreq: true, dropPct: true, riskLevel: true },
  });

  const out = new Map<string, RetentionSignal>();
  for (const a of alerts) {
    out.set(a.memberId, {
      baselineFreq: a.baselineFreq,
      recentFreq: a.recentFreq,
      dropPct: a.dropPct,
      riskLevel: a.riskLevel,
    });
  }
  return out;
}
