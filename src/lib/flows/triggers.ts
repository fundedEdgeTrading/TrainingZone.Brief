import type { FlowTriggerType, MemberState } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE, isBirthdayOn, zonedToday } from "@/lib/date-utils";
import { lastAttendanceByMember } from "@/lib/members-queries";
import { FLOW_TRIGGER_NUMBER } from "@/lib/flows/catalog";

/**
 * E2 · Los DISPARADORES, CABLEADOS a las señales que ya existen.
 *
 * Aquí no se calcula ninguna señal nueva. Cada disparador pregunta por el dato
 * que ya mantiene otra pista, y eso es deliberado: dos criterios distintos para
 * «lleva dos semanas sin venir» harían que la etiqueta de E1 y el flujo de
 * ausencia de E3 contestaran cosas distintas sobre el mismo socio, y nadie
 * sabría cuál mira dirección.
 *
 *   alta nueva            → `Member.joinedAt`
 *   primera sesión hecha  → la primera `Booking` ATTENDED (misma fuente que
 *                           «última visita» del listado)
 *   X sesiones sin venir  → `lastAttendanceByMember` (members-queries.ts), el
 *                           mismo dato que usa la etiqueta de E1
 *   el bono baja de N     → `Subscription.sessionsRemaining`, la misma condición
 *                           que `runLowPackBalanceRule`
 *   recibo fallido        → `Member.delinquentSince`, que escribe stripe-dunning
 *   cambio de estado      → el `AuditLog` que deja `member-lifecycle.ts` (M4),
 *                           que es el punto único de escritura de las transiciones
 *   aniversario/cumpleaños→ `Member.joinedAt` / `Member.birthDate`, en el
 *                           calendario del CENTRO (mismo criterio que birthday-jobs)
 *   formulario respondido → `MemberFormInvite.completedAt` (member-forms.ts, M5)
 *   valoración por debajo → `TrainerRating.score`
 *
 * LA VENTANA. Un disparador no pregunta «¿pasó exactamente hoy?» sino «¿pasó en
 * los últimos días?». Sin ventana, una pasada del cron perdida —un despliegue,
 * un fallo de red— deja fuera para siempre a los socios de ese día. Con
 * ventana no hay duplicados: de eso se encargan la regla 3 (90 días) y la
 * inscripción viva, que ya impiden que nadie entre dos veces.
 */

/** Días hacia atrás que mira un disparador de suceso. Ver la nota de arriba. */
export const TRIGGER_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export type TriggerContext = {
  orgId: string;
  centerId: string;
  triggerType: FlowTriggerType;
  triggerConfig: Record<string, unknown>;
  now: Date;
  /** `Center.timezone`, para los disparadores de calendario. */
  timeZone: string;
};

/** El número del disparador, con el valor por defecto del catálogo si falta. */
function triggerNumber(ctx: TriggerContext): number {
  const spec = FLOW_TRIGGER_NUMBER[ctx.triggerType];
  if (!spec) return 0;
  const raw = Number(ctx.triggerConfig[spec.field]);
  return Number.isFinite(raw) ? raw : spec.fallback;
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - TRIGGER_WINDOW_DAYS * DAY_MS);
}

/**
 * A quién se le puede escribir todavía. Un flujo de bienvenida que le escribe a
 * un excliente es el fallo que más rápido se nota, así que los estados que
 * siguen «en los libros» son la base de casi todos los disparadores. La
 * excepción es el cambio de estado, que precisamente sirve para hablar con
 * quien acaba de salir (la campaña de reactivación de E3).
 */
const ON_THE_BOOKS: MemberState[] = ["ACTIVE", "TRIAL", "DELINQUENT", "FROZEN"];

/** Socios del centro del flujo, en los estados que pide cada disparador. */
function memberScope(ctx: TriggerContext, states: MemberState[] = ON_THE_BOOKS) {
  return { orgId: ctx.orgId, primaryCenterId: ctx.centerId, state: { in: states } };
}

/**
 * Los candidatos a ENTRAR en el flujo. Solo ids: las condiciones se evalúan
 * después, sobre el fotograma que carga `engine.ts` de una vez para todos.
 */
export async function candidatesForTrigger(ctx: TriggerContext): Promise<string[]> {
  switch (ctx.triggerType) {
    case "MEMBER_JOINED": {
      const rows = await prisma.member.findMany({
        where: { ...memberScope(ctx), joinedAt: { gte: windowStart(ctx.now), lte: ctx.now } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "FIRST_SESSION_DONE": {
      // La PRIMERA sesión hecha: reservas asistidas en la ventana cuyo socio no
      // tenga ninguna anterior. Se resuelve con dos consultas y no con una por
      // socio — el patrón de siempre en este repositorio.
      const recientes = await prisma.booking.findMany({
        where: {
          status: "ATTENDED",
          occurrenceDate: { gte: windowStart(ctx.now), lte: ctx.now },
          member: memberScope(ctx),
        },
        select: { memberId: true, occurrenceDate: true },
      });
      if (recientes.length === 0) return [];

      const primeras = await prisma.booking.groupBy({
        by: ["memberId"],
        where: { status: "ATTENDED", memberId: { in: recientes.map((r) => r.memberId) } },
        _min: { occurrenceDate: true },
      });
      const primeraDe = new Map(primeras.map((p) => [p.memberId, p._min.occurrenceDate]));

      const salida = new Set<string>();
      for (const row of recientes) {
        const primera = primeraDe.get(row.memberId);
        if (primera && primera.getTime() === row.occurrenceDate.getTime()) salida.add(row.memberId);
      }
      return [...salida];
    }

    case "SESSIONS_ABSENCE": {
      // El MISMO dato que la etiqueta «2 semanas sin venir» de E1. Aquí se
      // reutiliza `lastAttendanceByMember` en vez de escribir otra consulta:
      // dos pantallas que digan fechas distintas de la última visita del mismo
      // socio es el fallo que esto evita.
      const dias = triggerNumber(ctx);
      const miembros = await prisma.member.findMany({ where: memberScope(ctx), select: { id: true } });
      const ids = miembros.map((m) => m.id);
      if (ids.length === 0) return [];

      const ultima = await lastAttendanceByMember(ids);
      const corte = ctx.now.getTime() - dias * DAY_MS;
      return ids.filter((id) => {
        const visita = ultima.get(id);
        // Sin ninguna visita no se dispara: «dejó de venir» presupone que vino.
        return visita ? visita.getTime() <= corte : false;
      });
    }

    case "PACK_BALANCE_BELOW": {
      // La misma condición que `runLowPackBalanceRule`: saldo por debajo del
      // umbral y todavía por encima de cero (un bono agotado es otra conversación).
      const umbral = triggerNumber(ctx);
      const rows = await prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          centerId: ctx.centerId,
          sessionsRemaining: { lte: umbral, gt: 0 },
          member: memberScope(ctx),
        },
        select: { memberId: true },
      });
      return [...new Set(rows.map((r) => r.memberId))];
    }

    case "PAYMENT_FAILED": {
      const rows = await prisma.member.findMany({
        where: {
          ...memberScope(ctx, ["ACTIVE", "TRIAL", "DELINQUENT", "FROZEN"]),
          delinquentSince: { gte: windowStart(ctx.now), lte: ctx.now },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "MEMBER_STATE_CHANGED": {
      // M4 centralizó las transiciones en `member-lifecycle.ts`, que deja
      // `AuditLog`. Preguntar por el rastro y no por `Member.state` a secas es
      // lo que distingue «acaba de pasar a excliente» de «lleva dos años siéndolo».
      const estado = String(ctx.triggerConfig.state ?? "");
      const accion = AUDIT_ACTION_BY_STATE[estado];
      if (!accion) return [];

      const rows = await prisma.auditLog.findMany({
        where: {
          orgId: ctx.orgId,
          action: accion,
          entityType: "Member",
          createdAt: { gte: windowStart(ctx.now), lte: ctx.now },
        },
        select: { memberId: true },
      });
      const candidatos = [...new Set(rows.map((r) => r.memberId).filter((id): id is string => Boolean(id)))];
      if (candidatos.length === 0) return [];

      // `AuditLog` no tiene relación con `Member` (es una tabla de solo
      // inserción y no cuelga de nadie), así que el ámbito de centro se cruza
      // en una segunda consulta. Aquí los estados NO se acotan a los que siguen
      // en los libros: este disparador existe precisamente para hablar con quien
      // acaba de salir — la campaña de reactivación de E3.
      const delCentro = await prisma.member.findMany({
        where: { id: { in: candidatos }, orgId: ctx.orgId, primaryCenterId: ctx.centerId },
        select: { id: true },
      });
      return delCentro.map((m) => m.id);
    }

    case "DATE_ANNIVERSARY": {
      // Aniversario del alta: los meses del disparador cumplidos HOY, en el
      // calendario del centro.
      const meses = triggerNumber(ctx);
      const hoy = zonedToday(ctx.timeZone || DEFAULT_TIMEZONE);
      const miembros = await prisma.member.findMany({
        where: memberScope(ctx),
        select: { id: true, joinedAt: true },
      });
      return miembros
        .filter((m) => isMonthAnniversaryOn(m.joinedAt, meses, hoy))
        .map((m) => m.id);
    }

    case "DATE_BIRTHDAY": {
      // Mismo criterio de zona y de 29 de febrero que `birthday-jobs.ts`: quien
      // nació ese día se felicita el 28 en los años no bisiestos.
      const hoy = zonedToday(ctx.timeZone || DEFAULT_TIMEZONE);
      const miembros = await prisma.member.findMany({
        where: { ...memberScope(ctx), birthDate: { not: null } },
        select: { id: true, birthDate: true },
      });
      return miembros.filter((m) => m.birthDate && isBirthdayOn(m.birthDate, hoy)).map((m) => m.id);
    }

    case "FORM_ANSWERED": {
      const rows = await prisma.memberFormInvite.findMany({
        where: {
          orgId: ctx.orgId,
          centerId: ctx.centerId,
          completedAt: { gte: windowStart(ctx.now), lte: ctx.now },
          memberId: { not: null },
        },
        select: { memberId: true },
      });
      return [...new Set(rows.map((r) => r.memberId).filter((id): id is string => Boolean(id)))];
    }

    case "RATING_BELOW": {
      const umbral = triggerNumber(ctx);
      const rows = await prisma.trainerRating.findMany({
        where: {
          orgId: ctx.orgId,
          score: { lt: umbral },
          createdAt: { gte: windowStart(ctx.now), lte: ctx.now },
          member: memberScope(ctx),
        },
        select: { memberId: true },
      });
      return [...new Set(rows.map((r) => r.memberId))];
    }

    default:
      return [];
  }
}

/** La acción de `AuditLog` que deja cada transición de `member-lifecycle.ts`. */
const AUDIT_ACTION_BY_STATE: Record<string, string | undefined> = {
  ACTIVE: "MEMBER_REACTIVATED",
  FROZEN: "MEMBER_FROZEN",
  DELINQUENT: "MEMBER_DELINQUENT",
  CANCELLED: "MEMBER_CANCELLED",
};

/**
 * ¿Hoy se cumplen exactamente `months` meses desde `joinedAt`?
 *
 * La trampa del día 31 es la misma que resuelve `addMonthsClamped` para las
 * valoraciones: quien se dio de alta el 31 de enero no tiene aniversario de mes
 * en febrero, y su hito cae el último día del mes que le toca. Se comparan
 * componentes de día suelto —`zonedToday` usa la misma codificación— para no
 * mezclar instantes con fechas de calendario.
 */
export function isMonthAnniversaryOn(joinedAt: Date, months: number, today: Date): boolean {
  if (months <= 0) return false;
  const target = new Date(joinedAt.getFullYear(), joinedAt.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(joinedAt.getDate(), lastDay));
  return (
    target.getFullYear() === today.getFullYear() &&
    target.getMonth() === today.getMonth() &&
    target.getDate() === today.getDate()
  );
}
