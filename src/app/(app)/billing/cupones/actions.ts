"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { archiveCoupon, createCoupon, type CouponResult } from "@/lib/stripe-coupons";

/**
 * HU-ST-27 · Alta y retirada de códigos promocionales.
 *
 * **Solo dirección de organización.** Un cupón vive en la cuenta de Stripe del
 * gimnasio, que es de la organización entera: no tiene `centerId` ni puede
 * tenerlo, así que un código creado por la dirección de UN centro descontaría
 * también las ventas de los demás. En vez de fingir un ámbito que Stripe no
 * ofrece, la escritura se reserva a quien manda en toda la organización; la
 * lectura sí se acota por centro en la medición (`getCouponPerformance`).
 */
export type CouponActionResult = { ok: true } | { ok: false; error: string };

function toResult(result: CouponResult): CouponActionResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function createCouponAction(formData: FormData): Promise<CouponActionResult> {
  const session = await requireRole(["OWNER"]);

  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "percent");
  const value = Number(String(formData.get("value") ?? "").replace(",", "."));
  const redeemByRaw = String(formData.get("redeemBy") ?? "").trim();

  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Introduce un descuento válido." };

  // La fecha llega como `YYYY-MM-DD` de un `<input type="date">`: se toma el
  // final de ese día, que es lo que entiende quien escribe "vale hasta el 31".
  let redeemBy: Date | null = null;
  if (redeemByRaw) {
    const parsed = new Date(`${redeemByRaw}T23:59:59`);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: "La fecha de caducidad no es válida." };
    redeemBy = parsed;
  }

  const result = await createCoupon(
    session.user.orgId,
    {
      code,
      name,
      ...(kind === "amount"
        ? { amountOffCents: Math.round(value * 100) }
        : { percentOff: value }),
      redeemBy,
    },
    session.user.id
  );

  if (result.ok) revalidatePath("/billing/cupones");
  return toResult(result);
}

export async function archiveCouponAction(couponId: string): Promise<CouponActionResult> {
  const session = await requireRole(["OWNER"]);
  if (!couponId) return { ok: false, error: "Cupón no encontrado." };

  const result = await archiveCoupon(session.user.orgId, couponId, session.user.id);
  if (result.ok) revalidatePath("/billing/cupones");
  return toResult(result);
}
