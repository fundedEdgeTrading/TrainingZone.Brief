"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { isMemberInScope } from "@/lib/center-scope";
import {
  issueRefund,
  previewCancellationProration,
  REFUND_OUT_OF_SCOPE,
  REFUND_REASON_REQUIRED,
  type IssueRefundResult,
  type ProrationPreview,
} from "@/lib/stripe-refunds";

/**
 * HU-ST-20 · Acciones de la pantalla de devoluciones (decisión D-S7).
 *
 * `requireRole` con dirección y nada más: es la misma frontera que aplica
 * `canIssueRefund` dentro de `issueRefund`, y están las dos porque protegen
 * cosas distintas. Esta corta la navegación (recepción no entra en la
 * pantalla); la del motor corta la operación (venga de donde venga la llamada).
 * Quitar cualquiera de las dos deja un agujero: la primera sola se salta con un
 * POST a mano, la segunda sola enseña a recepción una pantalla que no puede usar.
 */
const DIRECCION = ["OWNER", "CENTER_DIRECTOR"] as const;

export async function issueRefundAction(formData: FormData): Promise<IssueRefundResult> {
  const session = await requireRole([...DIRECCION]);

  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();

  if (!reason) return { ok: false, error: REFUND_REASON_REQUIRED };

  // El importe viaja en EUROS desde el formulario y se opera en céntimos: sin
  // el redondeo explícito, 12,30 € entra como 1229,9999… y Stripe rechaza el
  // refund por importe no entero.
  let amountCents: number | undefined;
  if (amountRaw) {
    const euros = Number(amountRaw.replace(",", "."));
    if (!Number.isFinite(euros) || euros <= 0) return { ok: false, error: "Introduce un importe válido." };
    amountCents = Math.round(euros * 100);
  }

  const result = await issueRefund({ actor: session.user, paymentId, amountCents, reason });

  if (result.ok) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { memberId: true } });
    revalidatePath("/billing/reembolsos");
    revalidatePath("/billing");
    if (payment) revalidatePath(`/members/${payment.memberId}`);
  }

  return result;
}

/**
 * HU-ST-20, escenario "cuota prorrateada": solo previsualiza. No cancela la
 * suscripción ni devuelve nada — el importe vuelve al formulario y dirección
 * decide.
 */
export async function previewProrationAction(subscriptionId: string): Promise<ProrationPreview> {
  const session = await requireRole([...DIRECCION]);

  // Ámbito de centro también en la LECTURA: el `subscriptionId` llega del
  // cliente, y el importe prorrateado de un socio de otro centro es un dato de
  // ese centro.
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, member: { orgId: session.user.orgId } },
    select: { memberId: true },
  });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };
  if (!(await isMemberInScope(session.user, subscription.memberId))) {
    return { ok: false, error: REFUND_OUT_OF_SCOPE };
  }

  return previewCancellationProration(session.user.orgId, subscriptionId);
}
