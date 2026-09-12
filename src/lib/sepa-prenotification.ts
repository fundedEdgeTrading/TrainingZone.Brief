import type Stripe from "stripe";
import type { PaymentMethod } from "@prisma/client";

import { addMonthsClamped } from "@/lib/date-utils";
// HU-ST-16: solo el TIPO. Este módulo sigue sin importar nada con efectos en
// tiempo de ejecución, que es lo que permite probarlo sin base de datos.
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * E10-13 · Preaviso de cargo SEPA.
 *
 * El esquema SEPA Core exige **pre-notificación al deudor con al menos 14 días
 * naturales de antelación**, salvo pacto distinto recogido en las condiciones.
 * Se habilitó `sepa_debit` en el checkout (`member-billing.ts`) y de las once
 * plantillas de correo la única de cobro era la de **pago fallido**, que llega
 * DESPUÉS. Es decir: el socio se enteraba del cargo por el extracto.
 *
 * Este módulo es la mitad pura —fechas, plazos y decisiones— para poder
 * probarla sin base de datos; el envío vive en `sepa-prenotification-job.ts`.
 */

/** Plazo del esquema SEPA Core. Es el suelo por defecto, no un adorno. */
export const SEPA_DEFAULT_NOTICE_DAYS = 14;

/**
 * Plazo de devolución de un adeudo autorizado: 8 semanas desde el cargo, sin
 * tener que dar motivo. El preaviso tiene que informarlo.
 */
export const SEPA_REFUND_WEEKS = 8;

const DAY_MS = 86_400_000;

export type SepaNotice = {
  /** Días naturales de antelación que se van a aplicar. */
  days: number;
  /** ¿Es un plazo pactado distinto del general, o el general? */
  agreed: boolean;
  /** Frase que va al correo y a la traza: qué plazo se aplica y por qué. */
  basis: string;
};

/**
 * Plazo aplicable. Un plazo MÁS CORTO que el general solo vale si está pactado
 * por escrito: si alguien configura 3 días sin marcar el pacto, se aplica el
 * general y no el que le convenga al centro. Uno más largo siempre vale, porque
 * beneficia al deudor.
 */
export function resolveSepaNoticeDays(input: {
  configuredDays?: number | null;
  agreedInWriting?: boolean;
}): SepaNotice {
  const configured = input.configuredDays;
  if (configured == null || !Number.isFinite(configured) || configured < 1) {
    return {
      days: SEPA_DEFAULT_NOTICE_DAYS,
      agreed: false,
      basis: `Plazo general del esquema SEPA Core: ${SEPA_DEFAULT_NOTICE_DAYS} días naturales.`,
    };
  }
  const days = Math.floor(configured);
  if (days >= SEPA_DEFAULT_NOTICE_DAYS) {
    return {
      days,
      agreed: days > SEPA_DEFAULT_NOTICE_DAYS,
      basis:
        days > SEPA_DEFAULT_NOTICE_DAYS
          ? `Plazo pactado en las condiciones del servicio: ${days} días naturales, por encima del general.`
          : `Plazo general del esquema SEPA Core: ${SEPA_DEFAULT_NOTICE_DAYS} días naturales.`,
    };
  }
  if (!input.agreedInWriting) {
    return {
      days: SEPA_DEFAULT_NOTICE_DAYS,
      agreed: false,
      basis:
        `Se ha configurado un plazo de ${days} días, más corto que el general, sin constar el pacto por escrito: ` +
        `se aplica el general de ${SEPA_DEFAULT_NOTICE_DAYS} días naturales.`,
    };
  }
  return {
    days,
    agreed: true,
    basis: `Plazo pactado por escrito en las condiciones del servicio: ${days} días naturales.`,
  };
}

/**
 * Plazo configurado para el despliegue. Va por entorno y no por columna porque
 * el esquema está congelado este trimestre; el pacto, si lo hay, tiene que
 * constar además en las condiciones firmadas —la variable no es el pacto, es
 * su reflejo en la máquina.
 */
export function sepaNoticeFromEnv(env: NodeJS.ProcessEnv = process.env): SepaNotice {
  const raw = env.SEPA_PRENOTIFICATION_DAYS;
  return resolveSepaNoticeDays({
    configuredDays: raw ? Number(raw) : null,
    agreedInWriting: env.SEPA_PRENOTIFICATION_AGREED_IN_WRITING === "true",
  });
}

/**
 * ¿El cobro de esta suscripción es una domiciliación?
 *
 * Se decide por el método del último cobro registrado. Cuando la conciliación
 * de Stripe empiece a distinguir `sepa_debit` de tarjeta, ESTE es el único
 * sitio que hay que ensanchar: hoy los cobros de Stripe entran como `STRIPE` y
 * no se puede saber desde la base de datos con qué instrumento se cobraron.
 */
export function isSepaMandate(lastPaymentMethod: PaymentMethod | null): boolean {
  return lastPaymentMethod === "SEPA";
}

/**
 * Próxima fecha de cargo de una cuota mensual: el aniversario mensual de la
 * fecha de alta, estrictamente posterior a `from`. Con `addMonthsClamped` el
 * alta de un 31 no se desborda al mes siguiente en febrero.
 */
export function nextMonthlyChargeDate(startDate: Date, from: Date): Date {
  let months = 0;
  let candidate = startDate;
  // El bucle tiene tope: 600 meses son cincuenta años, y una suscripción
  // anterior a eso es un dato corrupto, no un caso de negocio.
  while (candidate.getTime() <= from.getTime() && months < 600) {
    months += 1;
    candidate = addMonthsClamped(startDate, months);
  }
  return candidate;
}

/** Días naturales enteros que faltan para el cargo. */
export function daysUntil(chargeDate: Date, now: Date): number {
  return Math.floor((chargeDate.getTime() - now.getTime()) / DAY_MS);
}

export type PrenotificationDecision =
  | { send: false; reason: "ya_enviado" | "aun_no_toca" | "cargo_pasado" | "sin_mandato" }
  | { send: true; chargeDate: Date; daysAhead: number; late: boolean };

/**
 * ¿Toca mandar el preaviso en esta pasada del cron?
 *
 * Se dispara en cuanto quedan `noticeDays` o menos, no exactamente ese día: si
 * el cron se salta una ejecución, mandarlo con 13 días es incumplir menos que
 * no mandarlo. Ese caso sale marcado como `late` para que quede en la traza y
 * no pase por bueno.
 */
export function decidePrenotification(input: {
  hasMandate: boolean;
  chargeDate: Date;
  noticeDays: number;
  now: Date;
  alreadySent: boolean;
}): PrenotificationDecision {
  if (!input.hasMandate) return { send: false, reason: "sin_mandato" };
  if (input.alreadySent) return { send: false, reason: "ya_enviado" };

  const ahead = daysUntil(input.chargeDate, input.now);
  if (ahead < 0) return { send: false, reason: "cargo_pasado" };
  if (ahead > input.noticeDays) return { send: false, reason: "aun_no_toca" };

  return { send: true, chargeDate: input.chargeDate, daysAhead: ahead, late: ahead < input.noticeDays };
}

/** Clave de idempotencia: un preaviso por suscripción y fecha de cargo. */
export function prenotificationKey(subscriptionId: string, chargeDate: Date): string {
  return `${subscriptionId}:${chargeDate.toISOString().slice(0, 10)}`;
}

/** Referencia del mandato que se enseña al socio. Nunca el IBAN completo. */
export function mandateReference(subscriptionId: string): string {
  return `TZ-${subscriptionId.slice(-8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// HU-ST-16 · Preaviso disparado por `invoice.upcoming`. **PISTA P1.**
//
// VACÍO A PROPÓSITO. S1 lo deja cableado al despachador de webhook para que P1
// no tenga que tocar el `switch` compartido: cinco pistas necesitaban añadirle
// casos y se habrían pisado las cinco. Firma decidida, evento registrado; el
// cuerpo lo escribe P1.
//
// AVISO IMPORTANTE PARA P1 — esto NO se construye desde cero, y sobre todo NO
// se duplica. Ya existe el preaviso de E10-13:
//   · La mitad pura (plazos, fechas, decisión) es todo lo de arriba en este
//     mismo fichero: `sepaNoticeFromEnv()`, `decidePrenotification()`,
//     `prenotificationKey()`.
//   · El envío por CRON vive en `sepa-prenotification-job.ts`
//     (`runSepaPrenotificationRule`), que deduce la fecha de cargo del
//     aniversario del alta y sella el envío en `AuditLog` con la acción
//     `SEPA_PRENOTIFICATION_SENT`.
//
// Lo que aporta `invoice.upcoming` es la fecha de cargo REAL de Stripe en vez
// de una deducida. Las dos vías tienen que compartir el MISMO sello de
// "ya enviado" en `AuditLog`, o el socio recibe el aviso dos veces: una del
// cron y otra del webhook.
//
// Y ojo: una `invoice.upcoming` **no tiene `id`** —todavía no existe como
// factura—, así que la clave de idempotencia sale de la suscripción y del
// periodo, que es justo lo que ya hace `prenotificationKey()`.
// ---------------------------------------------------------------------------

/**
 * `invoice.upcoming` · Stripe avisa X días antes del cargo. Es el único evento
 * que llega ANTES de mover dinero, y por eso es el que sirve de preaviso.
 *
 * Recordatorio de la historia: es correo de SERVICIO. Se envía aunque el socio
 * haya desactivado los avisos comerciales, y no lleva enlace de baja.
 */
export async function sendSepaPrenotification(
  orgId: string,
  invoice: Stripe.Invoice
): Promise<ReconcileResult> {
  console.info("[sepa-prenotification] invoice.upcoming pendiente de implementar (HU-ST-16, P1)", {
    orgId,
    amountDue: invoice.amount_due,
    periodEnd: invoice.period_end,
    customer: typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null),
  });
  return { ok: true };
}
