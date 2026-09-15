import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { couponKey, promotionCodeKey } from "@/lib/stripe-idempotency";
// El código, su normalización y su validación viven en `coupon-code.ts` (ver
// allí por qué: el formulario de alta es de cliente y no puede arrastrar
// Prisma). Se reexportan desde aquí, que es donde los buscan los call sites de
// servidor. Mismo patrón que `plan-recurrence.ts` en `member-billing.ts`.
import { validateCouponInput, type CouponInput } from "@/lib/coupon-code";

/**
 * HU-ST-27 · Cupones y códigos promocionales **medibles**.
 *
 * Los tres escenarios de la historia:
 *
 *  1. **Alta**: el cupón se crea en la cuenta CONECTADA del gimnasio (nunca en
 *     la de Apta) y queda espejado en `StripeCoupon`.
 *  2. **Uso**: el checkout admite el código y el `Payment` registra el
 *     descuento aplicado. La creación del checkout vive en `member-billing.ts`
 *     (pista P1) y la conciliación en `stripe-checkout.ts`: aquí está TODA la
 *     lógica —`recordCheckoutDiscount` / `recordInvoiceDiscount`— para que el
 *     cambio en esos ficheros sea un import y una llamada. Está pedido en
 *     `docs/hu/P5-peticion-member-billing.md`.
 *  3. **Medición**: `getCouponPerformance` responde cuántas ventas y cuánto
 *     importe ha traído cada código, con ámbito de centro.
 *
 * ## Invariantes que se aplican aquí
 *
 * - **Nada se borra jamás** (RB-VENTA-002, extendido al cupón): retirar un
 *   código es archivarlo. `stripe.coupons.del` NO se llama en ningún sitio, y
 *   hay un test estructural que lo comprueba. Borrar el `Coupon` dejaría
 *   huérfanos los `Payment` que ya lo aplicaron y falsearía la medición hacia
 *   atrás, que es justo lo único que esta historia pide.
 * - **Toda creación contra Stripe lleva clave de idempotencia** (HU-ST-04 /
 *   RB-PAGO-022): `couponKey` y `promotionCodeKey`, registradas en
 *   `stripe-idempotency.ts`.
 * - **Ámbito de centro**: el cupón NO tiene centro —vive en la cuenta de Stripe
 *   del gimnasio, que es de la organización entera, y el esquema no le pone
 *   `centerId`—. Por eso el ámbito se aplica donde SÍ hay centro: la medición
 *   cuenta solo los `Payment` de socios de los centros de quien mira
 *   (`centerIds`, mismo criterio que `billing-queries.ts`), y crear o archivar
 *   un código queda reservado a dirección de organización, porque es una
 *   decisión que afecta a todos los centros a la vez.
 *
 * ## Lo que deliberadamente NO se parametriza
 *
 * `duration` se fija a `once` y no se ofrece en el formulario. Un cupón
 * `forever` sobre una cuota recurrente es un recorte permanente de ingresos, y
 * —lo que lo hace inaceptable aquí— el espejo (`StripeCoupon`, esquema
 * congelado) no tiene dónde guardarlo: la pantalla enseñaría un cupón "del 20 %"
 * sin decir que es del 20 % para siempre. Lo mismo con `max_redemptions`: el
 * límite que sí se puede espejar y enseñar es `redeemBy`, y es el que se usa.
 */

/** Acciones de `AuditLog`. Mismo criterio que `stripe-catalog.ts` con los precios. */
export const COUPON_CREATED_ACTION = "STRIPE_COUPON_CREATED";
export const COUPON_ARCHIVED_ACTION = "STRIPE_COUPON_ARCHIVED";

export {
  normalizeCouponCode,
  validateCouponInput,
  couponDiscountLabel,
  type CouponInput,
  type CouponValidation,
} from "@/lib/coupon-code";

export type CouponMirror = {
  id: string;
  stripeCouponId: string;
  stripePromotionCodeId: string | null;
  code: string | null;
  name: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  active: boolean;
  redeemBy: Date | null;
};

export type CouponResult = { ok: true; coupon: CouponMirror } | { ok: false; error: string };

/**
 * Escenario "alta de cupón": se crea en la cuenta conectada y queda espejado.
 *
 * Son dos objetos en Stripe y uno en Apta: el `Coupon` lleva el descuento, el
 * `PromotionCode` lleva el código que el socio teclea, y `StripeCoupon` los une
 * para poder medir sin volver a llamar a Stripe en cada informe.
 */
export async function createCoupon(orgId: string, input: CouponInput, actorUserId?: string | null): Promise<CouponResult> {
  const validated = validateCouponInput(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const { code, name, percentOff, amountOffCents, redeemBy } = validated.value;

  // El espejo es lo que mira la pantalla: un código repetido confundiría la
  // medición aunque Stripe lo aceptara. Se corta antes de crear nada.
  const duplicate = await prisma.stripeCoupon.findFirst({ where: { orgId, code, active: true }, select: { id: true } });
  if (duplicate) return { ok: false, error: `Ya hay un código activo con el nombre ${code}.` };

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  try {
    const coupon = await stripe.coupons.create(
      {
        // `once`: el descuento se aplica al primer cobro. Ver la nota de
        // cabecera sobre por qué no se ofrece `forever` ni `repeating`.
        duration: "once",
        name: name?.trim() || code,
        ...(percentOff !== null && percentOff !== undefined
          ? { percent_off: percentOff }
          : { amount_off: amountOffCents as number, currency: "eur" }),
        ...(redeemBy ? { redeem_by: Math.floor(redeemBy.getTime() / 1000) } : {}),
      },
      { stripeAccount: accountId, idempotencyKey: couponKey(orgId, code) }
    );

    const promotionCode = await stripe.promotionCodes.create(
      {
        promotion: { type: "coupon", coupon: coupon.id },
        code,
        ...(redeemBy ? { expires_at: Math.floor(redeemBy.getTime() / 1000) } : {}),
      },
      { stripeAccount: accountId, idempotencyKey: promotionCodeKey(orgId, code) }
    );

    const mirror = await prisma.stripeCoupon.upsert({
      where: { orgId_stripeCouponId: { orgId, stripeCouponId: coupon.id } },
      update: { stripePromotionCodeId: promotionCode.id, code, name: name?.trim() || null, redeemBy: redeemBy ?? null, active: true },
      create: {
        orgId,
        stripeCouponId: coupon.id,
        stripePromotionCodeId: promotionCode.id,
        code,
        name: name?.trim() || null,
        percentOff: percentOff ?? null,
        amountOffCents: amountOffCents ?? null,
        currency: amountOffCents !== null && amountOffCents !== undefined ? "eur" : null,
        redeemBy: redeemBy ?? null,
      },
      select: COUPON_MIRROR_SELECT,
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorUserId ?? null,
        action: COUPON_CREATED_ACTION,
        entityType: "StripeCoupon",
        entityId: mirror.id,
        metadata: { code, percentOff: percentOff ?? null, amountOffCents: amountOffCents ?? null, stripeCouponId: coupon.id },
      },
    });

    return { ok: true, coupon: mirror };
  } catch (error) {
    console.error("[stripe-coupons] no se pudo crear el cupón en la cuenta conectada", { orgId, code, error });
    return { ok: false, error: "No se pudo crear el cupón en Stripe." };
  }
}

/**
 * Escenario implícito en el invariante: **un cupón retirado se archiva, no se
 * borra**.
 *
 * En Stripe un `Coupon` no tiene `active`: lo que se desactiva es su
 * `PromotionCode` (`active:false`), y eso basta para que nadie más pueda
 * teclearlo. `stripe.coupons.del` no se llama aquí ni en ningún otro sitio —se
 * llevaría por delante el `Coupon` al que apuntan los `Payment` ya cobrados—.
 *
 * El fallo de Stripe no impide archivar en Apta: dejar el código visible y
 * canjeable en la pantalla porque la pasarela no respondió es peor que tener
 * que desactivarlo a mano en el Dashboard.
 */
export async function archiveCoupon(orgId: string, couponId: string, actorUserId?: string | null): Promise<CouponResult> {
  const existing = await prisma.stripeCoupon.findFirst({ where: { id: couponId, orgId }, select: COUPON_MIRROR_SELECT });
  if (!existing) return { ok: false, error: "Cupón no encontrado." };
  if (!existing.active) return { ok: true, coupon: existing };

  if (existing.stripePromotionCodeId) {
    const resolved = await stripeForOrg(orgId);
    if (resolved.ok) {
      try {
        await resolved.stripe.promotionCodes.update(
          existing.stripePromotionCodeId,
          { active: false },
          { stripeAccount: resolved.accountId }
        );
      } catch (error) {
        console.error("[stripe-coupons] no se pudo desactivar el código en Stripe", { orgId, couponId, error });
      }
    }
  }

  const archived = await prisma.stripeCoupon.update({
    where: { id: existing.id },
    data: { active: false },
    select: COUPON_MIRROR_SELECT,
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: actorUserId ?? null,
      action: COUPON_ARCHIVED_ACTION,
      entityType: "StripeCoupon",
      entityId: archived.id,
      metadata: { code: archived.code, stripeCouponId: archived.stripeCouponId },
    },
  });

  return { ok: true, coupon: archived };
}

const COUPON_MIRROR_SELECT = {
  id: true,
  stripeCouponId: true,
  stripePromotionCodeId: true,
  code: true,
  name: true,
  percentOff: true,
  amountOffCents: true,
  currency: true,
  active: true,
  redeemBy: true,
} as const;

/** El espejo, tal cual: los activos primero y, dentro, el más reciente arriba. */
export async function listCoupons(orgId: string, opts: { includeArchived?: boolean } = {}): Promise<CouponMirror[]> {
  return prisma.stripeCoupon.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { active: true }) },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: COUPON_MIRROR_SELECT,
  });
}

// ---------------------------------------------------------------------------
// Escenario "uso": el descuento aplicado, registrado en el Payment
// ---------------------------------------------------------------------------

/** Lo que se puede saber de un descuento leyendo el objeto que manda el webhook. */
type DiscountRef = {
  amountCents: number;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  code: string | null;
  name: string | null;
};

function refFromCoupon(coupon: string | Stripe.Coupon | null | undefined): { id: string | null; name: string | null } {
  if (!coupon) return { id: null, name: null };
  if (typeof coupon === "string") return { id: coupon, name: null };
  return { id: coupon.id, name: coupon.name ?? null };
}

function refFromPromotionCode(promo: string | Stripe.PromotionCode | null | undefined): { id: string | null; code: string | null } {
  if (!promo) return { id: null, code: null };
  if (typeof promo === "string") return { id: promo, code: null };
  return { id: promo.id, code: promo.code ?? null };
}

/**
 * Descuento de una sesión de checkout. `total_details.amount_discount` es el
 * importe agregado —lo que de verdad se dejó de cobrar— y `discounts[0]` dice
 * de qué cupón vino.
 *
 * Con importe pero sin cupón identificable (un descuento puesto a mano en el
 * Dashboard) se devuelve el importe igual: perder la cifra sería perder la
 * mitad de la medición.
 */
export function readCheckoutDiscount(session: Stripe.Checkout.Session): DiscountRef | null {
  const amountCents = session.total_details?.amount_discount ?? 0;
  if (!amountCents || amountCents <= 0) return null;

  const applied = session.discounts?.[0];
  const coupon = refFromCoupon(applied?.coupon);
  const promo = refFromPromotionCode(applied?.promotion_code);
  return {
    amountCents,
    stripeCouponId: coupon.id,
    stripePromotionCodeId: promo.id,
    code: promo.code,
    name: coupon.name,
  };
}

/** Lo mismo para una factura de Stripe Billing (cuota recurrente con código). */
export function readInvoiceDiscount(invoice: Stripe.Invoice): DiscountRef | null {
  const amountCents = (invoice.total_discount_amounts ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  if (!amountCents || amountCents <= 0) return null;

  const first: string | Stripe.Discount | Stripe.DeletedDiscount | undefined =
    (invoice.total_discount_amounts ?? [])[0]?.discount ?? invoice.discounts?.[0];
  // `deleted` no significa "no existió": un Discount consumido sigue teniendo
  // cupón, y el importe ya está contado arriba. Lo que no sirve es una
  // referencia sin expandir (una cadena), de la que no se puede sacar el cupón.
  if (!first || typeof first === "string") {
    return { amountCents, stripeCouponId: null, stripePromotionCodeId: null, code: null, name: null };
  }
  // Ojo con la versión de API fijada (2026-07-29.dahlia): el cupón del
  // `Discount` ya NO cuelga de `discount.coupon`, sino de `discount.source`
  // (`{ type: "coupon", coupon }`). El de la sesión de checkout
  // (`Session.Discount`) sí sigue siendo plano — son dos formas distintas.
  const coupon = refFromCoupon(first.source?.coupon);
  const promo = refFromPromotionCode(first.promotion_code);
  return { amountCents, stripeCouponId: coupon.id, stripePromotionCodeId: promo.id, code: promo.code, name: coupon.name };
}

/**
 * Espejo perezoso: un cupón creado directamente en el Dashboard de Stripe no
 * está en `StripeCoupon`, y sin fila local la venta se perdería para la
 * medición. Se crea con lo que se sepa —a veces solo el identificador— y se
 * completa en cuanto un evento posterior traiga el código o el nombre.
 */
async function mirrorCouponRef(orgId: string, ref: DiscountRef): Promise<string | null> {
  if (!ref.stripeCouponId) return null;
  const mirror = await prisma.stripeCoupon.upsert({
    where: { orgId_stripeCouponId: { orgId, stripeCouponId: ref.stripeCouponId } },
    update: {
      ...(ref.stripePromotionCodeId ? { stripePromotionCodeId: ref.stripePromotionCodeId } : {}),
      ...(ref.code ? { code: ref.code } : {}),
      ...(ref.name ? { name: ref.name } : {}),
    },
    create: {
      orgId,
      stripeCouponId: ref.stripeCouponId,
      stripePromotionCodeId: ref.stripePromotionCodeId,
      code: ref.code,
      name: ref.name,
    },
    select: { id: true },
  });
  return mirror.id;
}

/**
 * Escenario "uso", lado Apta: deja escrito en el `Payment` cuánto descuento se
 * aplicó y con qué código.
 *
 * Idempotente: una reentrega del webhook escribe exactamente lo mismo. No crea
 * el `Payment` —eso es de quien concilia— y calla si todavía no existe, que es
 * lo mismo que hace `reconcileMemberCheckoutSession` en ese caso.
 */
export async function recordCheckoutDiscount(orgId: string, session: Stripe.Checkout.Session): Promise<void> {
  const ref = readCheckoutDiscount(session);
  if (!ref) return;

  const payment = await prisma.payment.findFirst({
    where: { orgId, stripeCheckoutSessionId: session.id },
    select: { id: true },
  });
  if (!payment) return;

  const couponId = await mirrorCouponRef(orgId, ref);
  await prisma.payment.update({
    where: { id: payment.id },
    data: { discountAmountCents: ref.amountCents, couponId },
  });
}

/** Igual, para el `Payment` que nace de una factura recurrente ya conciliada. */
export async function recordInvoiceDiscount(orgId: string, invoice: Stripe.Invoice, paymentId: string): Promise<void> {
  const ref = readInvoiceDiscount(invoice);
  if (!ref) return;

  const payment = await prisma.payment.findFirst({ where: { id: paymentId, orgId }, select: { id: true } });
  if (!payment) return;

  const couponId = await mirrorCouponRef(orgId, ref);
  await prisma.payment.update({ where: { id: payment.id }, data: { discountAmountCents: ref.amountCents, couponId } });
}

// ---------------------------------------------------------------------------
// Escenario "medición": cuántas ventas y cuánto importe ha traído cada código
// ---------------------------------------------------------------------------

export type CouponPerformance = CouponMirror & {
  /** Ventas cobradas con este código dentro del ámbito y del periodo pedidos. */
  sales: number;
  /** Lo que entró: suma de lo que pagaron los socios, ya descontado. */
  grossCents: number;
  /** Lo que costó: suma de los descuentos aplicados. */
  discountCents: number;
};

export type CouponPerformanceOpts = {
  /**
   * Ámbito de centro (`center-scope.ts`). `undefined` = sin filtro (dirección
   * de organización); presente —aunque venga vacío— manda siempre. Mismo
   * criterio que `billing-queries.ts`: un ámbito vacío no ve nada, no lo ve todo.
   */
  centerIds?: string[];
  from?: Date;
  to?: Date;
  includeArchived?: boolean;
};

/**
 * "Dirección ve cuántas ventas y cuánto importe ha traído cada código."
 *
 * Los códigos sin ninguna venta salen también, a cero: un cupón que no ha
 * traído nada es justo lo que hay que ver para retirarlo.
 */
export async function getCouponPerformance(orgId: string, opts: CouponPerformanceOpts = {}): Promise<CouponPerformance[]> {
  const coupons = await prisma.stripeCoupon.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { active: true }) },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: COUPON_MIRROR_SELECT,
  });
  if (coupons.length === 0) return [];

  const grouped = await prisma.payment.groupBy({
    by: ["couponId"],
    where: {
      orgId,
      status: "PAID",
      couponId: { in: coupons.map((c) => c.id) },
      ...(opts.centerIds !== undefined ? { member: { primaryCenterId: { in: opts.centerIds } } } : {}),
      ...(opts.from || opts.to
        ? { date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } }
        : {}),
    },
    _count: { _all: true },
    _sum: { amountCents: true, discountAmountCents: true },
  });

  const byCoupon = new Map(grouped.map((row) => [row.couponId, row]));
  return coupons.map((coupon) => {
    const row = byCoupon.get(coupon.id);
    return {
      ...coupon,
      sales: row?._count._all ?? 0,
      grossCents: row?._sum.amountCents ?? 0,
      discountCents: row?._sum.discountAmountCents ?? 0,
    };
  });
}
