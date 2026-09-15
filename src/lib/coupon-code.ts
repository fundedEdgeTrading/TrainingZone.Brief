/**
 * HU-ST-27 · La parte de los cupones que **no habla con Stripe ni con la base
 * de datos**: normalizar el código, validarlo y rotularlo.
 *
 * Vive aparte de `stripe-coupons.ts` por un motivo concreto: el formulario de
 * alta es un componente de cliente y necesita normalizar el código MIENTRAS se
 * teclea, para que quien escribe "verano 25" vea el "VERANO-25" que va a quedar
 * creado. Importarlo de `stripe-coupons.ts` arrastraría Prisma al bundle del
 * navegador (el build de Next lo corta en seco, y hace bien). Mismo patrón que
 * `plan-recurrence.ts` respecto a `member-billing.ts`.
 *
 * `stripe-coupons.ts` lo reexporta: los call sites de servidor siguen buscando
 * todo en un solo sitio, y la regla de normalización sigue siendo una sola —que
 * es lo que importa: si el cliente y el servidor normalizaran distinto, el
 * espejo acabaría con dos filas para el mismo código.
 */

/**
 * Stripe admite en el código del `PromotionCode` letras, dígitos y guiones —ni
 * espacios, ni guiones bajos, ni acentos— y lo compara sin distinguir
 * mayúsculas. Se normaliza antes de validar para que "verano 25" y "VERANO-25"
 * no acaben siendo dos códigos distintos en el espejo.
 */
export function normalizeCouponCode(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export type CouponInput = {
  code: string;
  name?: string | null;
  /** Uno de los dos, nunca los dos (Stripe no admite porcentaje e importe a la vez). */
  percentOff?: number | null;
  amountOffCents?: number | null;
  /** Último día en que el código se puede canjear. Opcional. */
  redeemBy?: Date | null;
};

export type CouponValidation = { ok: true; value: CouponInput & { code: string } } | { ok: false; error: string };

/** Ni Stripe ni el espejo admiten un cupón a medias: se valida antes de llamar a nadie. */
export function validateCouponInput(input: CouponInput, now: Date = new Date()): CouponValidation {
  const code = normalizeCouponCode(input.code ?? "");
  if (!code) return { ok: false, error: "El código es obligatorio." };
  if (code.length < 3 || code.length > 40) return { ok: false, error: "El código debe tener entre 3 y 40 caracteres." };
  if (!/^[A-Z0-9-]+$/.test(code)) return { ok: false, error: "El código solo admite letras, números y guiones." };

  const hasPercent = input.percentOff !== null && input.percentOff !== undefined;
  const hasAmount = input.amountOffCents !== null && input.amountOffCents !== undefined;
  if (hasPercent === hasAmount) {
    return { ok: false, error: "Elige descuento en porcentaje O en importe, no los dos." };
  }
  if (hasPercent) {
    const percent = Number(input.percentOff);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { ok: false, error: "El porcentaje debe estar entre 0 y 100." };
    }
  }
  if (hasAmount) {
    const cents = Number(input.amountOffCents);
    if (!Number.isInteger(cents) || cents <= 0) {
      return { ok: false, error: "El importe del descuento debe ser mayor que cero." };
    }
  }
  if (input.redeemBy && input.redeemBy.getTime() <= now.getTime()) {
    return { ok: false, error: "La fecha de caducidad tiene que ser futura." };
  }

  return { ok: true, value: { ...input, code } };
}

/** Etiqueta del descuento para la pantalla: "20 %" o "10,00 €". */
export function couponDiscountLabel(coupon: { percentOff: number | null; amountOffCents: number | null }): string {
  if (coupon.percentOff !== null && coupon.percentOff !== undefined) {
    return `${coupon.percentOff.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
  }
  if (coupon.amountOffCents !== null && coupon.amountOffCents !== undefined) {
    return (coupon.amountOffCents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  }
  // Espejo perezoso de un cupón del Dashboard: se sabe que existe y cuánto ha
  // traído, pero no su regla. Mejor decirlo que inventar un 0 %.
  return "—";
}
