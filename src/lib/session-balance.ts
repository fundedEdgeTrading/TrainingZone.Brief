// Modalidad de servicio de un bono y cuentas de saldo. Es la parte pura (sin
// Prisma) de members-queries.ts, que la reexporta para no tocar sus llamadas:
// vive aparte para poder cubrirla con test unitario y para que los componentes
// de cliente que solo necesitan estas cuentas (el bono del sidebar) no arrastren
// el cliente de base de datos.

// RB-PERFIL-001: secciones condicionales derivadas de las suscripciones activas,
// no de un flag nuevo. EP y online siempre tienen entrenador responsable
// explícito (RB-PERFIL-002/decisión §11.4); "solo grupos" no.
export type ServiceKind = "EP" | "GROUP" | "ONLINE";
const PLAN_TYPE_TO_SERVICE: Record<string, ServiceKind> = {
  PERSONAL_TRAINING: "EP",
  ONLINE: "ONLINE",
  MONTHLY: "GROUP",
  SESSION_PACK: "GROUP",
  DROP_IN: "GROUP",
  DUO: "GROUP",
};

// Servicio al que pertenece una sesión de agenda: las franjas de EP usan
// classType "Personal Training" (RB-AGENDA-002); el resto son de grupo. No hay
// sesiones presenciales "online" (el plan online es biblioteca de vídeo, D.2).
export function sessionServiceKind(classType: string): "EP" | "GROUP" {
  return classType === "Personal Training" ? "EP" : "GROUP";
}

export function getMemberServiceKinds(subscriptions: { status: string; plan: { type: string } }[]): ServiceKind[] {
  const kinds = new Set<ServiceKind>();
  for (const s of subscriptions) {
    if (s.status !== "ACTIVE") continue;
    const kind = PLAN_TYPE_TO_SERVICE[s.plan.type];
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

export function planServiceKind(planType: string): ServiceKind | undefined {
  return PLAN_TYPE_TO_SERVICE[planType];
}

// RB-AGENDA-003: bonos ACTIVE reducidos a (centro, modalidad) para el motor de
// reserva — un socio puede tener varios bonos a la vez, de distinta modalidad
// y distinto centro (getBookableSessions/bookSessionForMember en
// portal-queries.ts). Se ignoran los bonos ONLINE (biblioteca de vídeo, sin
// agenda presencial que reservar).
export function activeBookingSubscriptions(
  subscriptions: { status: string; centerId: string; plan: { type: string } }[]
): { centerId: string; kind: "EP" | "GROUP" }[] {
  return subscriptions
    .filter((s) => s.status === "ACTIVE")
    .map((s) => ({ centerId: s.centerId, kind: planServiceKind(s.plan.type) }))
    .filter((s): s is { centerId: string; kind: "EP" | "GROUP" } => s.kind === "EP" || s.kind === "GROUP");
}

/** Reparto de UN bono entre lo gastado y lo que queda. Siempre `used + remaining === total`. */
export type BonoUsage = { total: number; used: number; remaining: number };

/**
 * RB-RES-006: consumo de un bono concreto, tal y como se le enseña al socio
 * ("N gastadas de T del bono" junto a "R disponibles").
 *
 * `total` NO es `sessionsIncluded` a secas, sino la capacidad real del bono:
 * `max(sessionsIncluded, sessionsRemaining)`. El saldo puede superar lo
 * contratado —recepción lo ajusta a mano (members/[id]/bonos-actions.ts), y
 * cada bono contratado de más se suma al mismo servicio—, y tomando lo
 * contratado como total salían cuentas imposibles: "13 sesiones disponibles"
 * encima de "0 gastadas de 12 del bono". Contando esas sesiones de más como
 * parte del bono, lo gastado y lo disponible vuelven a sumar el total.
 *
 * `used` se deduce del propio bono y no del histórico de asistencias, que
 * incluiría bonos anteriores y sesiones que el entrenador agenda a mano.
 *
 * Devuelve null en el bono ilimitado (`sessionsRemaining` null: cuota mensual u
 * online), que no tiene saldo que repartir.
 */
export function bonoUsage(
  sessionsIncluded: number | null | undefined,
  sessionsRemaining: number | null
): BonoUsage | null {
  if (sessionsRemaining == null) return null;
  const remaining = Math.max(0, sessionsRemaining);
  const total = Math.max(sessionsIncluded ?? 0, remaining);
  return { total, used: total - remaining, remaining };
}

// RB-RES-006: saldo de sesiones que le queda al socio por tipo de servicio, a
// partir de sus bonos activos. Un bono con `sessionsRemaining` null = ilimitado
// (cuota mensual / online). Se agregan varios bonos del mismo servicio.
//
// Cada bono entra con su reparto de `bonoUsage`, así que la suma hereda su
// cuadratura: `used + remaining === total` también en el agregado. Un bono sin
// `sessionsIncluded` pero con saldo aporta ese saldo al total (antes solo
// contaba en `remaining`, y era la otra vía por la que las tres cifras dejaban
// de casar).
export type SessionBalance = {
  serviceKind: ServiceKind;
  remaining: number | null;
  unlimited: boolean;
  used: number | null;
  total: number | null;
};

export function getSessionBalances(
  subscriptions: {
    status: string;
    sessionsRemaining: number | null;
    plan: { type: string; sessionsIncluded?: number | null };
  }[]
): SessionBalance[] {
  const byKind = new Map<ServiceKind, { remaining: number; unlimited: boolean; used: number; total: number }>();
  for (const s of subscriptions) {
    if (s.status !== "ACTIVE") continue;
    const kind = PLAN_TYPE_TO_SERVICE[s.plan.type];
    if (!kind) continue;
    const acc = byKind.get(kind) ?? { remaining: 0, unlimited: false, used: 0, total: 0 };
    const usage = bonoUsage(s.plan.sessionsIncluded, s.sessionsRemaining);
    if (!usage) acc.unlimited = true;
    else {
      acc.remaining += usage.remaining;
      acc.total += usage.total;
      acc.used += usage.used;
    }
    byKind.set(kind, acc);
  }
  return [...byKind.entries()].map(([serviceKind, v]) => ({
    serviceKind,
    remaining: v.unlimited ? null : v.remaining,
    unlimited: v.unlimited,
    used: v.unlimited || v.total === 0 ? null : v.used,
    total: v.unlimited || v.total === 0 ? null : v.total,
  }));
}
