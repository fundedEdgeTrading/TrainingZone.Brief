import type Stripe from "stripe";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

/**
 * Lote 2 · Helpers COMPARTIDOS de cobro (S1).
 *
 * Están aquí, y en un solo sitio, porque siete pistas trabajan en paralelo
 * sobre lo mismo y cada una iba a inventarse el suyo: tres versiones distintas
 * de "¿esto se puede devolver?" y cuatro literales distintos de cuántos días
 * dura el periodo de gracia. Son mínimos a propósito — hacen lo que dicen y
 * nada más—, pero funcionan: no son esqueletos.
 *
 * Si necesitas ensanchar uno, ensánchalo aquí. No lo copies a tu pista: ese
 * duplicado es exactamente el fallo que ya está documentado con las tablas de
 * permisos "espejo".
 */

// ---------------------------------------------------------------------------
// HU-ST-20 · ¿Se puede devolver este cobro?
// ---------------------------------------------------------------------------

/** Lo mínimo que hace falta saber de un cobro para decidir si se devuelve. */
export type RefundablePayment = {
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  refundedAmountCents?: number | null;
  refundedAt?: Date | null;
  /** Referencias de Stripe: si no hay ninguna, no hay nada que devolver allí. */
  stripePaymentIntentId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeInvoiceId?: string | null;
};

export type RefundDecision =
  | {
      refundable: true;
      /**
       * `STRIPE`: hay que emitir el refund contra la cuenta conectada.
       * `LOCAL` : es un cobro de caja (efectivo, transferencia, datáfono…) y el
       *           flujo se queda en Apta. **No se llama a Stripe.**
       */
      via: "STRIPE" | "LOCAL";
      /** Cuánto queda por devolver. Un parcial previo ya está descontado. */
      maxRefundableCents: number;
    }
  | { refundable: false; error: string };

/**
 * HU-ST-20 · Guardián del lado de escritura del reembolso.
 *
 * NO lanza: devuelve una decisión, como el resto de la capa de cobro, para que
 * el call site enseñe el motivo en pantalla en vez de un 500.
 *
 * Los dos casos que la historia nombra explícitamente:
 *   · **Pago en efectivo** → `via: "LOCAL"`. Sigue el flujo local actual, sin
 *     llamar a Stripe. Llamar a Stripe con un cobro de caja es pedirle que
 *     devuelva dinero que nunca pasó por él.
 *   · **Pago ya devuelto** → `refundable: false`. Un doble clic de dirección no
 *     puede emitir dos refunds. (La clave de idempotencia de HU-ST-04 es la
 *     segunda red; esta es la primera, y la que da un mensaje entendible.)
 *
 * `amountCents` es el importe que se quiere devolver. Omitido = todo lo que
 * queda. Se admite un parcial y se rechaza pedir más de lo que queda: sin esta
 * comprobación, dos parciales seguidos devolvían más de lo cobrado.
 */
export function assertRefundable(payment: RefundablePayment, amountCents?: number): RefundDecision {
  if (payment.status === "REFUNDED" && !payment.refundedAmountCents) {
    // Devuelto del todo por el flujo antiguo, que no guardaba importe.
    return { refundable: false, error: "Este cobro ya está devuelto." };
  }
  if (payment.status === "FAILED") {
    return { refundable: false, error: "Este cobro nunca llegó a entrar, así que no hay nada que devolver." };
  }
  if (payment.status === "PENDING") {
    return {
      refundable: false,
      error: "Este cobro todavía no se ha confirmado. Espera a que se liquide o anúlalo.",
    };
  }

  const yaDevuelto = payment.refundedAmountCents ?? 0;
  const restante = payment.amountCents - yaDevuelto;
  if (restante <= 0) {
    return { refundable: false, error: "Este cobro ya está devuelto por completo." };
  }

  if (amountCents != null) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { refundable: false, error: "El importe a devolver tiene que ser un número de céntimos positivo." };
    }
    if (amountCents > restante) {
      return {
        refundable: false,
        error: `No se pueden devolver más de ${(restante / 100).toFixed(2)} €: es lo que queda de este cobro.`,
      };
    }
  }

  // Solo `STRIPE` es el cobro online conciliado por webhook (RB-PAGO-001). El
  // resto —efectivo, transferencia, Bizum o tarjeta cobrados en el centro— son
  // cobros de caja: se registran en Apta y se devuelven en Apta.
  if (payment.method !== "STRIPE") {
    return { refundable: true, via: "LOCAL", maxRefundableCents: restante };
  }

  const referencia =
    payment.stripePaymentIntentId ?? payment.stripeCheckoutSessionId ?? payment.stripeInvoiceId ?? null;
  if (!referencia) {
    // Cobro marcado como Stripe pero sin ninguna referencia con la que
    // localizarlo. Devolverlo "en local" dejaría el dinero en Stripe y el
    // recibo diciendo que se devolvió: mejor parar y decirlo.
    return {
      refundable: false,
      error:
        "Este cobro figura como cobrado por Stripe pero no tiene referencia con la que localizarlo. " +
        "Revísalo en el Dashboard de Stripe antes de devolverlo.",
    };
  }

  return { refundable: true, via: "STRIPE", maxRefundableCents: restante };
}

// ---------------------------------------------------------------------------
// HU-ST-18 · Periodo de gracia por morosidad (decisión D-S5)
// ---------------------------------------------------------------------------

/** D-S5. El mismo rango que garantiza el CHECK de la base de datos. */
export const GRACE_DAYS_MIN = 0;
export const GRACE_DAYS_MAX = 60;
export const GRACE_DAYS_DEFAULT = 7;

/** Encaja un valor en el rango válido. Úsalo al validar el formulario. */
export function clampGraceDays(days: number | null | undefined): number {
  if (days == null || !Number.isFinite(days)) return GRACE_DAYS_DEFAULT;
  return Math.min(GRACE_DAYS_MAX, Math.max(GRACE_DAYS_MIN, Math.floor(days)));
}

/**
 * HU-ST-18 · Días de gracia de ESTA organización, **leídos del servidor**.
 *
 * Ni la web ni la app pueden llevar el número escrito: es configuración del
 * centro, no una constante del producto, y un literal en el cliente significa
 * que un centro que fija 14 días sigue cortando el acceso a los 7.
 *
 * Se vuelve a encajar en el rango al leer, aunque el CHECK de la base ya lo
 * garantiza: una fila anterior a la restricción, o un valor traído de una
 * importación, no puede dejar a un socio sin periodo de gracia.
 */
export async function graceWindowFor(orgId: string): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { dunningGraceDays: true },
  });
  return clampGraceDays(org?.dunningGraceDays);
}

/**
 * Fin del periodo de gracia de un socio moroso: `Member.delinquentSince` más los
 * días de su organización. `null` si no hay impago abierto.
 *
 * Días NATURALES, como dice la historia — no laborables.
 */
export function graceDeadline(delinquentSince: Date | null | undefined, graceDays: number): Date | null {
  if (!delinquentSince) return null;
  const deadline = new Date(delinquentSince);
  deadline.setDate(deadline.getDate() + clampGraceDays(graceDays));
  return deadline;
}

/**
 * ¿Este socio todavía puede reservar pese a estar en impago?
 *
 * Un socio sin impago abierto siempre puede: `true` aquí no significa "está al
 * corriente", significa "la morosidad no le corta el acceso ahora mismo".
 */
export function isWithinGraceWindow(
  delinquentSince: Date | null | undefined,
  graceDays: number,
  now: Date = new Date()
): boolean {
  const deadline = graceDeadline(delinquentSince, graceDays);
  if (!deadline) return true;
  return now.getTime() < deadline.getTime();
}

// ---------------------------------------------------------------------------
// HU-ST-24 / HU-ST-26 · Cliente de SOLO LECTURA de la cuenta conectada
// ---------------------------------------------------------------------------

export type StripeReadClient =
  | { ok: true; stripe: Stripe; accountId: string; livemode: boolean }
  | { ok: false; error: string };

/**
 * Cliente para LEER de la cuenta conectada de un gimnasio: la consola de
 * dirección (HU-ST-24, P3) y los informes financieros (HU-ST-26, P4).
 *
 * Es distinto de `stripeForOrg()` en una cosa que importa: **no exige
 * `chargesEnabled`**. `stripeForOrg` se niega cuando la cuenta aún no puede
 * cobrar, y hace bien —es el guardián de la escritura—, pero aplicar esa misma
 * regla a la lectura dejaba la consola en blanco justo cuando más falta hace
 * mirarla: durante el onboarding de Connect, o después de que el gimnasio
 * revoque el acceso y haya que consultar lo que ya se cobró.
 *
 * "Solo lectura" es una CONVENCIÓN, no una barrera técnica: el SDK de Stripe no
 * tiene modo lectura y la clave es la misma de siempre (§0/RB-CONNECT-001, una
 * sola clave en todo el sistema). Lo que este helper garantiza es el sitio por
 * el que se pide un cliente cuando solo se va a listar. Si vas a ESCRIBIR
 * —emitir un refund, crear un cupón—, usa `stripeForOrg()`: te hará las
 * comprobaciones que este a propósito no hace.
 *
 * `livemode` sale del prefijo de la clave y es lo que pinta el distintivo
 * TEST/LIVE de HU-ST-24. Se resuelve aquí para que P3 y P4 no acaben con dos
 * maneras distintas de mirarlo.
 */
export async function stripeReadClient(orgId: string): Promise<StripeReadClient> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { ok: false, error: "Stripe no está configurado en este entorno (falta STRIPE_SECRET_KEY)." };
  }

  const account = await prisma.stripeAccount.findUnique({
    where: { orgId },
    select: { accountId: true },
  });
  if (!account) {
    return { ok: false, error: "Este gimnasio aún no ha conectado su cuenta de Stripe." };
  }

  return {
    ok: true,
    stripe,
    accountId: account.accountId,
    livemode: isLiveKey(process.env.STRIPE_SECRET_KEY),
  };
}

/**
 * ¿La clave configurada es de producción?
 *
 * Se mira el prefijo y no `sk_test_`: las claves restringidas empiezan por
 * `rk_`, y dar por "live" todo lo que no empiece por `sk_test_` pintaba el
 * distintivo LIVE en un entorno de pruebas con clave restringida.
 */
export function isLiveKey(key: string | undefined | null): boolean {
  return typeof key === "string" && /^(sk|rk)_live_/.test(key);
}
