/**
 * E14-08 · Bonos por centro: canjeadas, restantes y caducidad.
 *
 * «Un bono acabándose es el momento de venta». El saldo vivía en la ficha de
 * cada socio y no estaba sumado en ninguna parte, así que dirección no tenía
 * forma de saber en qué centro se está agotando el stock de sesiones ni a quién
 * hay que llamar esta semana.
 *
 * ---------------------------------------------------------------------------
 * DE DÓNDE SALE CADA CIFRA, Y POR QUÉ
 * ---------------------------------------------------------------------------
 *
 * **Canjeadas y devoluciones salen de `SessionLedger`**, nunca de restar
 * `sessionsRemaining` a `sessionsIncluded`. Esa resta es exactamente el fallo
 * que el libro mayor vino a arreglar: recepción sube el saldo a mano
 * (`bonos-actions.ts::adjustSubscriptionSessions`), y en cuanto lo hace la
 * resta miente — lee el comentario de `Subscription.sessionsIncluded`
 * (RB-RES-006), donde está el caso medido: un bono de 4 agotado + 2 sesiones de
 * regalo se veía «6/6» en vez de «4/6». Un panel de dirección construido sobre
 * esa resta le diría al centro que no ha consumido nada.
 *
 * **Y no todo asiento negativo es una sesión canjeada.** `EXPIRY` también
 * descuenta, y una sesión que caduca es lo contrario de una sesión usada: es la
 * que había que haber vendido. Contarlas juntas convertiría el indicador de
 * salud del centro en su propio maquillaje. Por eso el reparto de aquí abajo va
 * motivo a motivo y ninguno cae en un `default`.
 *
 * **Flujo y stock no son lo mismo, y la pantalla tiene que decirlo.** Las
 * canjeadas, las devueltas, las caducadas y los ajustes son FLUJO: pasan dentro
 * del periodo de `DashboardOpts.range`, igual que el resto del panel. Las
 * restantes, los ilimitados y la caducidad son STOCK: son el saldo de HOY. No
 * hay «restantes del trimestre pasado» que se pueda leer sin reconstruir el
 * libro asiento a asiento, y fingir que sí es cómo se acaba comparando dos
 * cosas distintas bajo el mismo rótulo.
 *
 * ---------------------------------------------------------------------------
 * LA CADUCIDAD SE DERIVA DE `endDate`, NO DEL MOTIVO `EXPIRY`
 * ---------------------------------------------------------------------------
 *
 * `SessionLedgerReason.EXPIRY` está en el enum desde el lote 2 y **hoy no lo
 * escribe nadie**: no hay ningún job que caduque bonos (comprobado contra el
 * árbol: `EXPIRY` solo aparece en el enum y en su rótulo). Así que preguntarle
 * al libro «¿qué ha caducado?» devuelve cero siempre, y cero no es la
 * respuesta: la respuesta está en `Subscription.endDate`, que sí está poblado.
 *
 * Esta agregación lee `endDate` y cuenta igualmente los asientos `EXPIRY` para
 * el día que ese job exista. Mientras no exista, «caducado sin consumir» es
 * saldo que sigue vivo en la tabla aunque su fecha haya pasado — que es
 * justamente el aviso que dirección necesita.
 */

import type { SessionLedgerReason, SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { comparisonWindow, type DashboardOpts } from "@/lib/dashboard-range";

/**
 * A partir de aquí un bono es «momento de venta». Mismo número que el aviso
 * rojo de la columna «Bono usado» de `/members`, y vive aquí para que la card y
 * el listado no puedan discrepar sobre qué es «acabándose».
 */
export const LOW_SESSIONS_THRESHOLD = 2;

/** Ventana de la caducidad próxima, en días. Es la que pidió negocio. */
export const EXPIRY_HORIZON_DAYS = 30;

/**
 * Cuántos bonos a punto de acabarse se pintan.
 *
 * Seis, y no «todos». La card vive ENCIMA del listado de socios: una lista de
 * veinte nombres empuja la tabla de socios fuera de la pantalla y convierte la
 * pantalla de trabajo en un panel. Seis son las llamadas de una mañana, y el
 * pie dice cuántas quedan detrás.
 */
export const RUNNING_OUT_LIMIT = 6;

const DAY_MS = 86_400_000;

/**
 * Estados de bono que cuentan como saldo vivo.
 *
 * `PENDING_CONFIRMATION` (SEPA en vuelo) NO entra: el motor de reservas filtra
 * por `ACTIVE`, así que ese saldo todavía no se puede gastar y sumarlo daría un
 * stock que no existe. `PAUSED` y `FROZEN` tampoco: el socio no está
 * entrenando, y meterlos en «restantes» pinta un centro con más margen del que
 * tiene.
 */
const LIVE_STATUSES: SubscriptionStatus[] = ["ACTIVE"];

/**
 * Estados en los que un saldo sin consumir y con fecha pasada es una pérdida y
 * no otra cosa. Un bono `CANCELLED` con saldo se fue por la baja del socio, que
 * es un problema distinto (y lo mide el desglose de ingresos de M4).
 */
const EXPIRABLE_STATUSES: SubscriptionStatus[] = ["ACTIVE", "EXPIRED"];

// ---------------------------------------------------------------------------
// La parte pura: aritmética sobre el libro, sin base de datos detrás
// ---------------------------------------------------------------------------

/** Un bono, reducido a lo que necesita la agregación. */
export type PackSubscription = {
  id: string;
  centerId: string;
  /** `null` = bono ilimitado (cuota mensual u online). No es un cero. */
  sessionsRemaining: number | null;
  status: SubscriptionStatus;
  /** Fecha de caducidad del bono. `null` = sin fecha, no caduca. */
  endDate: Date | null;
  member: { id: string; firstName: string; lastName: string };
  planName: string;
};

/** Un asiento del libro, reducido a lo que necesita la agregación. */
export type PackLedgerEntry = {
  subscriptionId: string;
  /** Firmado: negativo consume, positivo devuelve. Nunca 0. */
  delta: number;
  reason: SessionLedgerReason;
};

export type PackCenterSummary = {
  centerId: string;
  centerName: string;

  // --- Flujo del periodo (sale del libro) ---
  /** Sesiones CANJEADAS: asientos `BOOKING` de bonos con saldo. */
  redeemed: number;
  /** Sesiones devueltas: `CANCELLATION` + `NO_SHOW_REFUND`. */
  refunded: number;
  /** Sesiones perdidas por caducidad (asientos `EXPIRY`). Nunca se suman a las canjeadas. */
  expiredSessions: number;
  /** Saldo movido a mano por recepción, con signo. Es el que rompe la resta ingenua. */
  adjusted: number;
  /**
   * Sesiones consumidas por bonos ILIMITADOS en el periodo. Van aparte porque no
   * descuentan de ningún saldo: sumarlas a `redeemed` inflaría el consumo del
   * centro con sesiones que nadie compró por unidades.
   */
  unlimitedRedeemed: number;

  // --- Stock de hoy ---
  /** Sesiones RESTANTES: la suma de los saldos vivos. Los ilimitados no entran. */
  remaining: number;
  /** Bonos con saldo vivo (los que suman en `remaining`). */
  packs: number;
  /** Bonos ilimitados vivos. Contados aparte: no son bonos de cero sesiones. */
  unlimitedPacks: number;

  // --- Caducidad ---
  /** Bonos con saldo que caducan dentro de `EXPIRY_HORIZON_DAYS`. */
  expiringSoonPacks: number;
  /** Sesiones que se pierden si esos bonos no se usan a tiempo. */
  expiringSoonSessions: number;
  /** Bonos con fecha ya pasada y saldo SIN consumir. */
  expiredUnusedPacks: number;
  /** Sesiones que ya se han perdido ahí. */
  expiredUnusedSessions: number;
};

/** Una fila de la lista accionable: a quién llamar, de qué centro y por qué. */
export type PackRunningOut = {
  subscriptionId: string;
  memberId: string;
  memberName: string;
  centerId: string;
  centerName: string;
  planName: string;
  remaining: number;
  endDate: Date | null;
  /** Días hasta la caducidad. Negativo = ya caducó. `null` = el bono no caduca. */
  daysToExpiry: number | null;
  /** Por qué está en la lista. Se escribe en la fila: una lista sin motivo no se acciona. */
  reason: "saldo" | "caduca" | "caducado";
};

function emptySummary(centerId: string, centerName: string): PackCenterSummary {
  return {
    centerId,
    centerName,
    redeemed: 0,
    refunded: 0,
    expiredSessions: 0,
    adjusted: 0,
    unlimitedRedeemed: 0,
    remaining: 0,
    packs: 0,
    unlimitedPacks: 0,
    expiringSoonPacks: 0,
    expiringSoonSessions: 0,
    expiredUnusedPacks: 0,
    expiredUnusedSessions: 0,
  };
}

/** Días naturales de `from` a `to`, redondeando hacia arriba: «caduca en 1 día» es hoy + algo. */
function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * El reparto de UN asiento, motivo a motivo.
 *
 * Es un `switch` exhaustivo a propósito y sin `default`: cuando el esquema gane
 * un motivo nuevo, TypeScript rompe aquí en vez de que el motivo caiga en
 * silencio en el saco equivocado. Es la única defensa real contra que una
 * caducidad acabe contada como una sesión vendida.
 */
function applyEntry(acc: PackCenterSummary, entry: PackLedgerEntry, unlimited: boolean): void {
  switch (entry.reason) {
    case "BOOKING":
      // El signo importa: `-delta` porque un consumo es negativo en el libro.
      if (unlimited) acc.unlimitedRedeemed += Math.max(0, -entry.delta);
      else acc.redeemed += Math.max(0, -entry.delta);
      return;
    case "CANCELLATION":
    case "NO_SHOW_REFUND":
      if (!unlimited) acc.refunded += Math.max(0, entry.delta);
      return;
    case "EXPIRY":
      // Una sesión caducada NO es una sesión canjeada: es la que había que
      // haber vendido. Cifra propia, siempre.
      acc.expiredSessions += Math.max(0, -entry.delta);
      return;
    case "MANUAL_ADJUSTMENT":
      acc.adjusted += entry.delta;
      return;
    case "PURCHASE":
    case "CORRECTION":
      // `PURCHASE` es la venta (el alta del bono), no un consumo. `CORRECTION`
      // incluye el saldo de apertura del histórico previo
      // (`backfillOpeningEntries`), que es un asiento técnico: contarlo como
      // movimiento del periodo inventaría consumo el día que se migró.
      return;
  }
}

/**
 * La agregación completa. Función pura: recibe los bonos, los asientos YA
 * acotados al periodo y los nombres de centro, y devuelve una fila por centro.
 *
 * `centers` manda sobre lo que aparece: un centro sin un solo bono sale con sus
 * ceros, porque «este centro no vende bonos» es justo la lectura que interesa y
 * un centro que desaparece de la tabla se lee como «no hay datos todavía».
 */
export function summarisePacksByCenter(
  subscriptions: PackSubscription[],
  entries: PackLedgerEntry[],
  centers: { id: string; name: string }[],
  now: Date,
): PackCenterSummary[] {
  const byCenter = new Map(centers.map((c) => [c.id, emptySummary(c.id, c.name)]));
  const subById = new Map(subscriptions.map((s) => [s.id, s]));

  for (const sub of subscriptions) {
    const acc = byCenter.get(sub.centerId);
    if (!acc) continue; // fuera del ámbito de centro de quien mira

    const live = LIVE_STATUSES.includes(sub.status);
    if (live) {
      if (sub.sessionsRemaining == null) acc.unlimitedPacks++;
      else if (sub.sessionsRemaining > 0) {
        acc.remaining += sub.sessionsRemaining;
        acc.packs++;
      }
    }

    // Caducidad: solo tiene sentido en un bono con saldo por gastar.
    const balance = sub.sessionsRemaining ?? 0;
    if (balance > 0 && sub.endDate && EXPIRABLE_STATUSES.includes(sub.status)) {
      const days = daysBetween(now, sub.endDate);
      if (days < 0) {
        acc.expiredUnusedPacks++;
        acc.expiredUnusedSessions += balance;
      } else if (days <= EXPIRY_HORIZON_DAYS) {
        acc.expiringSoonPacks++;
        acc.expiringSoonSessions += balance;
      }
    }
  }

  for (const entry of entries) {
    const sub = subById.get(entry.subscriptionId);
    if (!sub) continue;
    const acc = byCenter.get(sub.centerId);
    if (!acc) continue;
    applyEntry(acc, entry, sub.sessionsRemaining == null);
  }

  return [...byCenter.values()].sort((a, b) => a.centerName.localeCompare(b.centerName, "es"));
}

/**
 * Los bonos a punto de acabarse, ordenados por urgencia real.
 *
 * Tres motivos de entrada, y cada fila dice el suyo: queda poco saldo, caduca
 * pronto, o ya caducó con saldo dentro. Sin el motivo escrito la lista es un
 * montón de nombres y nadie sabe qué decirle a cada uno al teléfono.
 */
export function packsRunningOut(
  subscriptions: PackSubscription[],
  centers: { id: string; name: string }[],
  now: Date,
  limit = RUNNING_OUT_LIMIT,
): { rows: PackRunningOut[]; total: number } {
  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  const rows: PackRunningOut[] = [];

  for (const sub of subscriptions) {
    if (!LIVE_STATUSES.includes(sub.status)) continue;
    const name = centerName.get(sub.centerId);
    if (name === undefined) continue;
    const remaining = sub.sessionsRemaining;
    // Un bono ilimitado no se acaba: no tiene sitio en esta lista.
    if (remaining == null || remaining <= 0) continue;

    const daysToExpiry = sub.endDate ? daysBetween(now, sub.endDate) : null;
    const expired = daysToExpiry != null && daysToExpiry < 0;
    const expiringSoon = daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= EXPIRY_HORIZON_DAYS;
    const lowBalance = remaining <= LOW_SESSIONS_THRESHOLD;
    if (!expired && !expiringSoon && !lowBalance) continue;

    rows.push({
      subscriptionId: sub.id,
      memberId: sub.member.id,
      memberName: `${sub.member.firstName} ${sub.member.lastName}`.trim(),
      centerId: sub.centerId,
      centerName: name,
      planName: sub.planName,
      remaining,
      endDate: sub.endDate,
      daysToExpiry,
      reason: expired ? "caducado" : expiringSoon ? "caduca" : "saldo",
    });
  }

  // Primero lo ya perdido (se puede recuperar hablando hoy), luego lo que
  // caduca antes, y a igualdad de fecha el que menos saldo le queda.
  const rank = { caducado: 0, caduca: 1, saldo: 2 } as const;
  rows.sort(
    (a, b) =>
      rank[a.reason] - rank[b.reason] ||
      (a.daysToExpiry ?? Number.MAX_SAFE_INTEGER) - (b.daysToExpiry ?? Number.MAX_SAFE_INTEGER) ||
      a.remaining - b.remaining ||
      a.memberName.localeCompare(b.memberName, "es"),
  );
  // El total viaja aparte del recorte: «y 23 más» es una cifra que cambia la
  // decisión (no es lo mismo llamar a seis personas que a veintinueve), y sin
  // ella la lista parece ser todo lo que hay.
  return { rows: rows.slice(0, limit), total: rows.length };
}

/** Las cifras de una fila, sin la identidad del centro: es la forma del total. */
export type PackTotals = Omit<PackCenterSummary, "centerId" | "centerName">;

/** Los totales de la organización, para la fila de cierre de la tabla. */
export function totalPacks(rows: PackCenterSummary[]): PackTotals {
  const total: PackTotals = {
    redeemed: 0,
    refunded: 0,
    expiredSessions: 0,
    adjusted: 0,
    unlimitedRedeemed: 0,
    remaining: 0,
    packs: 0,
    unlimitedPacks: 0,
    expiringSoonPacks: 0,
    expiringSoonSessions: 0,
    expiredUnusedPacks: 0,
    expiredUnusedSessions: 0,
  };
  for (const row of rows) {
    for (const key of Object.keys(total) as (keyof PackTotals)[]) total[key] += row[key];
  }
  return total;
}

// ---------------------------------------------------------------------------
// La parte con Prisma: dos consultas, ni una por fila
// ---------------------------------------------------------------------------

/**
 * Cruce del ámbito de centro con el selector, con la MISMA regla que el resto
 * del panel: `centerId` es la elección puntual, `centerIds` el ámbito de quien
 * mira (`center-scope.ts`), y la lista vacía significa «ningún centro visible»
 * y no «sin filtro». Tratarla como «sin filtro» devolvería la organización
 * entera, que es exactamente al revés.
 */
function centerFilter(opts: DashboardOpts): string[] | undefined {
  if (opts.centerId) {
    if (opts.centerIds && !opts.centerIds.includes(opts.centerId)) return [];
    return [opts.centerId];
  }
  return opts.centerIds;
}

export type PackSummaryResult = {
  rows: PackCenterSummary[];
  total: PackTotals;
  runningOut: PackRunningOut[];
  /** Cuántos hay en total, antes del recorte a `RUNNING_OUT_LIMIT`. */
  runningOutTotal: number;
  /** Ventana de la que salen las cifras de FLUJO. Las de stock son de hoy. */
  window: { from: Date; to: Date };
};

/**
 * E14-08 · Los bonos del ámbito, agregados por centro.
 *
 * Dos consultas y una agregación en memoria: los bonos del ámbito y los
 * asientos de esos bonos dentro del periodo. Nada por fila.
 */
export async function getPackSummaryByCenter(
  orgId: string,
  opts: DashboardOpts = {},
  now: Date = new Date(),
): Promise<PackSummaryResult> {
  const centerIds = centerFilter(opts);
  const { from, to } = comparisonWindow(opts.range ?? "mes", now);

  if (centerIds?.length === 0) {
    return { rows: [], total: totalPacks([]), runningOut: [], runningOutTotal: 0, window: { from, to } };
  }

  const centers = await prisma.center.findMany({
    where: { orgId, ...(centerIds ? { id: { in: centerIds } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (centers.length === 0) {
    return { rows: [], total: totalPacks([]), runningOut: [], runningOutTotal: 0, window: { from, to } };
  }
  const visibleCenterIds = centers.map((c) => c.id);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      centerId: { in: visibleCenterIds },
      // El `orgId` del centro es la frontera dura; `centerId` ya viene cruzado
      // contra el ámbito, pero la organización se comprueba igual porque es la
      // única que no puede depender de un parámetro de pantalla.
      center: { orgId },
    },
    select: {
      id: true,
      centerId: true,
      sessionsRemaining: true,
      status: true,
      endDate: true,
      plan: { select: { name: true } },
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const packs: PackSubscription[] = subscriptions.map((s) => ({
    id: s.id,
    centerId: s.centerId,
    sessionsRemaining: s.sessionsRemaining,
    status: s.status,
    endDate: s.endDate,
    member: s.member,
    planName: s.plan.name,
  }));

  const entries = packs.length
    ? await prisma.sessionLedger.findMany({
        where: {
          orgId,
          subscriptionId: { in: packs.map((p) => p.id) },
          createdAt: { gte: from, lte: to },
        },
        select: { subscriptionId: true, delta: true, reason: true },
      })
    : [];

  const rows = summarisePacksByCenter(packs, entries, centers, now);
  const runningOut = packsRunningOut(packs, centers, now);
  return {
    rows,
    total: totalPacks(rows),
    runningOut: runningOut.rows,
    runningOutTotal: runningOut.total,
    window: { from, to },
  };
}
