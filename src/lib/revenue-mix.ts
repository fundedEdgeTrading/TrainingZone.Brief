/**
 * M4 · Ingresos separados por concepto (E14-17).
 *
 * `Payment` NO TIENE CAMPO DE CONCEPTO Y NO SE LE VA A AÑADIR: sí tiene
 * `subscriptionId`, y de ahí se deriva todo.
 *
 *   ALTA NUEVA      — primer cobro de una suscripción recién contratada.
 *   RENOVACIÓN      — los siguientes de la misma suscripción.
 *   SIN SUSCRIPCIÓN — los cobros con `subscriptionId` null (bonos sueltos,
 *                     drop-in, venta de mostrador). CUARTA categoría, no un
 *                     hueco: son más de los que parece, y si pesan mucho la
 *                     lectura de negocio cambia (el centro no vive de cuota).
 *   BAJA            — y esta NO es caja.
 *
 * «BAJA» ES INGRESO PERDIDO (D-L3-3, cerrada): la cuota mensual que se va con
 * los socios que causaron baja en la ventana, EN NEGATIVO. No es caja, no está
 * en Stripe y nadie la debe sumar a los ingresos, así que `cashTotalCents` es la
 * suma de LAS TRES primeras y la baja viaja aparte, en su propio campo y con su
 * propio rótulo. Es lo que contesta si el mes se sostiene.
 *
 * MISMAS DEFINICIONES QUE EL PANEL. Qué cuenta como cobrado: `status: "PAID"`,
 * igual que `getRevenueSeries`/`getKpiTiles`. Cómo se acota la ventana:
 * `comparisonWindow(range)` y el mismo `d >= from && d < to`. El total de las
 * tres líneas de caja tiene que dar EXACTAMENTE el KPI «Ingresos del mes»; si
 * no cuadra, uno de los dos está mal y hay que decirlo, no taparlo con un
 * redondeo (por eso `cashTotalCents` se devuelve en céntimos y sin redondear).
 *
 * ⚠️ Si M1 amplía qué cuenta como cobrado (E14-03, incluir el PENDING de SEPA),
 * este módulo tiene que moverse en el mismo cambio. Está pedido en
 * `docs/hu/M4-peticion-dashboard-queries.md`.
 */
import { prisma } from "@/lib/prisma";
import { comparisonWindow, type DashboardOpts } from "@/lib/dashboard-range";
import { isRecurring } from "@/lib/plan-recurrence";

// ---------------------------------------------------------------------------
// La clasificación: aritmética pura, se prueba sin base de datos
// ---------------------------------------------------------------------------

/** Las tres líneas de CAJA. La baja no está aquí porque no es caja. */
export type RevenueConcept = "ALTA" | "RENOVACION" | "SIN_SUSCRIPCION";

export const REVENUE_CONCEPT_LABEL: Record<RevenueConcept, string> = {
  ALTA: "Altas nuevas",
  RENOVACION: "Renovaciones",
  SIN_SUSCRIPCION: "Sin suscripción",
};

export const REVENUE_CONCEPT_ORDER: RevenueConcept[] = ["ALTA", "RENOVACION", "SIN_SUSCRIPCION"];

export type ClassifiablePayment = {
  id: string;
  subscriptionId: string | null;
  date: Date;
  amountCents: number;
};

/**
 * Cuándo el primer cobro que vemos de una suscripción NO es un alta.
 *
 * Un socio importado de otra plataforma llega con su suscripción real —con su
 * `startDate` verdadero, de hace dos años— pero SIN histórico de cobros: su
 * próximo recibo sería «el primero de esa suscripción» y contaría como alta
 * nueva, inflando la captación del mes con gente que lleva años pagando. Lo
 * mismo pasa con cualquier suscripción anterior a que se registraran cobros.
 *
 * El corte es la distancia entre el arranque de la suscripción y ese primer
 * cobro: 45 días cubren con margen lo legítimo —un adeudo SEPA tarda días en
 * liquidar, y una cuota contratada a mitad de mes puede facturarse hasta un mes
 * después— sin tragarse una suscripción heredada.
 */
export const NEW_SUBSCRIPTION_GRACE_DAYS = 45;

const DAY_MS = 86_400_000;

/**
 * El concepto de UN cobro. Pura: recibe el cobro, los cobros anteriores de su
 * MISMA suscripción y cuándo arrancó esa suscripción.
 *
 * Los casos raros salen solos de clasificar por SUSCRIPCIÓN y no por socio:
 *
 *   · dos suscripciones a la vez del mismo socio → cada una tiene su primer
 *     cobro, así que puede haber dos altas del mismo socio el mismo mes, y eso
 *     es exactamente lo que ha pasado;
 *   · socio que se va y vuelve → al volver contrata una suscripción NUEVA, con
 *     su propio primer cobro: es un alta, no una renovación de la antigua;
 *   · socio importado sin histórico → el `startDate` heredado delata que la
 *     suscripción no es nueva y su primer recibo entra como renovación.
 */
export function classifyPayment(
  payment: ClassifiablePayment,
  context: {
    /** Cobros de la MISMA suscripción anteriores a este (cualquier fecha). */
    earlierPaymentsOfSubscription: number;
    /** Arranque de la suscripción. `null` = desconocido: se trata como nueva. */
    subscriptionStartDate: Date | null;
  },
): RevenueConcept {
  if (!payment.subscriptionId) return "SIN_SUSCRIPCION";
  if (context.earlierPaymentsOfSubscription > 0) return "RENOVACION";

  const start = context.subscriptionStartDate;
  if (!start) return "ALTA";
  const ageDays = (payment.date.getTime() - start.getTime()) / DAY_MS;
  return ageDays > NEW_SUBSCRIPTION_GRACE_DAYS ? "RENOVACION" : "ALTA";
}

/**
 * Clasifica un lote entero. Se le pasan TODOS los cobros conocidos de las
 * suscripciones implicadas (no solo los de la ventana): «primer cobro» es una
 * propiedad del histórico, no del mes que se está mirando, y mirar solo la
 * ventana convertiría en alta la renovación de cada enero.
 */
export function classifyPayments(
  windowPayments: ClassifiablePayment[],
  history: {
    /** Todos los cobros conocidos, dentro y fuera de la ventana. */
    allPayments: ClassifiablePayment[];
    /** Arranque de cada suscripción implicada. */
    subscriptionStart: Map<string, Date>;
  },
): Map<string, RevenueConcept> {
  const earlierBySubscription = new Map<string, ClassifiablePayment[]>();
  for (const p of history.allPayments) {
    if (!p.subscriptionId) continue;
    const list = earlierBySubscription.get(p.subscriptionId) ?? [];
    list.push(p);
    earlierBySubscription.set(p.subscriptionId, list);
  }

  const out = new Map<string, RevenueConcept>();
  for (const payment of windowPayments) {
    const siblings = payment.subscriptionId ? (earlierBySubscription.get(payment.subscriptionId) ?? []) : [];
    // Empate de fecha al milisegundo (dos recibos importados el mismo día): el
    // id desempata, para que el reparto sea estable entre ejecuciones y no haya
    // dos «primeros cobros» de la misma suscripción.
    const earlier = siblings.filter(
      (s) => s.date < payment.date || (s.date.getTime() === payment.date.getTime() && s.id < payment.id),
    ).length;
    out.set(
      payment.id,
      classifyPayment(payment, {
        earlierPaymentsOfSubscription: earlier,
        subscriptionStartDate: payment.subscriptionId
          ? (history.subscriptionStart.get(payment.subscriptionId) ?? null)
          : null,
      }),
    );
  }
  return out;
}

/** La cuota mensual que se pierde con una baja. Pura, y separa el «sin cuota» del cero. */
export function lostMonthlyFeeCents(
  subscriptions: { priceCents: number; recurring: boolean; startDate: Date; endDate: Date | null }[],
  cancelledAt: Date,
): number {
  return subscriptions
    .filter(
      (s) =>
        s.recurring &&
        s.startDate <= cancelledAt &&
        // La baja cierra la suscripción, así que su `endDate` (si lo tiene) no
        // puede ser anterior al día en que el socio se fue: si lo es, esa cuota
        // ya se había perdido antes y no cuenta en esta ventana.
        (s.endDate === null || s.endDate >= cancelledAt),
    )
    .reduce((sum, s) => sum + s.priceCents, 0);
}

// ---------------------------------------------------------------------------
// La consulta
// ---------------------------------------------------------------------------

export type RevenueMixLine = {
  concept: RevenueConcept;
  label: string;
  amountCents: number;
  count: number;
  /** Peso sobre la caja de la ventana, 0-100. */
  pct: number;
};

export type RevenueMix = {
  lines: RevenueMixLine[];
  /** Suma de las TRES líneas de caja. Tiene que dar el KPI «Ingresos …» del panel. */
  cashTotalCents: number;
  /** Lo mismo en el tramo anterior, para la comparativa. */
  prevCashTotalCents: number;
  churn: {
    /**
     * Cuota mensual perdida, EN NEGATIVO. No es caja: no se suma a
     * `cashTotalCents` ni se busca en Stripe.
     */
    lostMonthlyCents: number;
    /** Socios que causaron baja en la ventana. */
    members: number;
    /** De esos, cuántos no tenían cuota recurrente (solo bonos): pierden 0 €/mes. */
    membersWithoutFee: number;
  };
  /** Rótulos del periodo, los mismos del resto del panel. */
  scopeLabel: string;
  deltaHint: string;
};

/** Cobros del ámbito. Copia deliberada de `paymentScope` de `dashboard-queries.ts`
 *  —`Payment` no tiene centro, lo hereda del socio que paga—, con `centerIds`
 *  añadido para el director imputado a varios centros. Ese fichero es de M1 y no
 *  exporta el helper; está pedido en `docs/hu/M4-peticion-dashboard-queries.md`. */
function paymentScope(orgId: string, opts: DashboardOpts) {
  const memberWhere = memberScopeInner(opts);
  return memberWhere ? { orgId, member: memberWhere } : { orgId };
}

function memberScopeInner(opts: DashboardOpts) {
  if (opts.centerId) return { primaryCenterId: opts.centerId };
  if (opts.centerIds !== undefined) return { primaryCenterId: { in: opts.centerIds } };
  return null;
}

function memberScope(orgId: string, opts: DashboardOpts) {
  const inner = memberScopeInner(opts);
  return inner ? { orgId, ...inner } : { orgId };
}

export async function getRevenueMix(orgId: string, opts: DashboardOpts = {}): Promise<RevenueMix> {
  const range = opts.range ?? "mes";
  const win = comparisonWindow(range);

  // Los cobros de la ventana y del tramo anterior, y —por separado— TODO el
  // histórico de las suscripciones implicadas, que es lo que decide si un cobro
  // es el primero de su suscripción.
  const [windowPayments, prevPayments] = await Promise.all([
    prisma.payment.findMany({
      where: { ...paymentScope(orgId, opts), status: "PAID", date: { gte: win.from, lt: win.to } },
      select: { id: true, subscriptionId: true, date: true, amountCents: true },
    }),
    prisma.payment.findMany({
      where: { ...paymentScope(orgId, opts), status: "PAID", date: { gte: win.prevFrom, lt: win.prevTo } },
      select: { id: true, amountCents: true },
    }),
  ]);

  const subscriptionIds = [...new Set(windowPayments.map((p) => p.subscriptionId).filter((id): id is string => !!id))];

  const [history, subscriptions, cancelled] = await Promise.all([
    subscriptionIds.length
      ? prisma.payment.findMany({
          where: { orgId, status: "PAID", subscriptionId: { in: subscriptionIds } },
          select: { id: true, subscriptionId: true, date: true, amountCents: true },
        })
      : Promise.resolve([]),
    subscriptionIds.length
      ? prisma.subscription.findMany({
          where: { id: { in: subscriptionIds } },
          select: { id: true, startDate: true },
        })
      : Promise.resolve([]),
    // La baja: quien causó baja DENTRO de la ventana, con las suscripciones que
    // tenía vivas ese día.
    prisma.member.findMany({
      where: { ...memberScope(orgId, opts), cancelledAt: { gte: win.from, lt: win.to } },
      select: {
        id: true,
        cancelledAt: true,
        subscriptions: {
          select: { priceCents: true, startDate: true, endDate: true, plan: { select: { type: true } } },
        },
      },
    }),
  ]);

  const concepts = classifyPayments(windowPayments, {
    allPayments: history,
    subscriptionStart: new Map(subscriptions.map((s) => [s.id, s.startDate])),
  });

  const totals = new Map<RevenueConcept, { amountCents: number; count: number }>(
    REVENUE_CONCEPT_ORDER.map((c) => [c, { amountCents: 0, count: 0 }]),
  );
  for (const p of windowPayments) {
    const concept = concepts.get(p.id) ?? "SIN_SUSCRIPCION";
    const bucket = totals.get(concept)!;
    bucket.amountCents += p.amountCents;
    bucket.count += 1;
  }

  const cashTotalCents = windowPayments.reduce((sum, p) => sum + p.amountCents, 0);
  const prevCashTotalCents = prevPayments.reduce((sum, p) => sum + p.amountCents, 0);

  let lostMonthlyCents = 0;
  let membersWithoutFee = 0;
  for (const member of cancelled) {
    const lost = lostMonthlyFeeCents(
      member.subscriptions.map((s) => ({
        priceCents: s.priceCents,
        recurring: isRecurring(s.plan.type),
        startDate: s.startDate,
        endDate: s.endDate,
      })),
      member.cancelledAt!,
    );
    if (lost === 0) membersWithoutFee += 1;
    lostMonthlyCents += lost;
  }

  const lines: RevenueMixLine[] = REVENUE_CONCEPT_ORDER.map((concept) => {
    const bucket = totals.get(concept)!;
    return {
      concept,
      label: REVENUE_CONCEPT_LABEL[concept],
      amountCents: bucket.amountCents,
      count: bucket.count,
      pct: cashTotalCents > 0 ? (bucket.amountCents / cashTotalCents) * 100 : 0,
    };
  });

  return {
    lines,
    cashTotalCents,
    prevCashTotalCents,
    churn: {
      // En negativo: es lo que se pierde, y el signo es parte del dato.
      lostMonthlyCents: -lostMonthlyCents,
      members: cancelled.length,
      membersWithoutFee,
    },
    scopeLabel: win.scopeLabel,
    deltaHint: win.deltaHint,
  };
}
