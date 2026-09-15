import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { createNotificationOnce } from "@/lib/notifications";
import { renderPaymentFailedEmail } from "@/lib/emails/templates";
import { generateMemberDunningToken, memberBillingUrlFor } from "@/lib/email-verification";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { absoluteUrl } from "@/lib/site";

/**
 * HU-ST-18 · Motor de morosidad. **PISTA P1.**
 *
 * Aquí vive todo lo que pasa cuando un cobro no entra: el socio pasa a
 * DELINQUENT, se le avisa UNA vez por factura, se abre la tarea de recepción y
 * —al agotarse el periodo de gracia de su organización (D-S5)— se le corta la
 * reserva de nuevas sesiones.
 *
 * Está en un módulo propio y no dentro de `member-billing.ts` porque hay cuatro
 * puertas distintas por las que se entra en morosidad y las cuatro tienen que
 * hacer exactamente lo mismo:
 *   · `invoice.payment_failed` (tarjeta rechazada, cuota recurrente),
 *   · `checkout.session.async_payment_failed` (el adeudo SEPA no llega a
 *     cargarse, HU-ST-12),
 *   · la devolución bancaria posterior —R-transaction— de un adeudo que YA
 *     estaba conciliado (HU-ST-12),
 *   · el contracargo de una tarjeta (HU-ST-21, P2).
 *
 * El invariante del trimestre que aquí importa: **cortar el acceso por
 * morosidad no consume ni devuelve saldo**. No se toca `sessionsRemaining` en
 * ninguna de estas rutas, así que tampoco hay asiento en `SessionLedger` que
 * escribir — el socio recupera su bono intacto en cuanto paga.
 */

/**
 * Registro de envío del aviso de impago. Va en `AuditLog` (append-only, no
 * exige cuenta de usuario) y no en el propio `Payment`, porque la fila de pago
 * se actualiza en cada reintento y no sirve de marca de "ya avisado".
 *
 * La clave es la FACTURA (o el cargo devuelto), no el socio: Stripe reintenta
 * la misma factura varias veces en un ciclo de dunning, y el socio debe recibir
 * un aviso por cobro fallido, no uno por reintento.
 */
export const DUNNING_ENTITY = "DunningNotice";
export const DUNNING_SENT_ACTION = "DUNNING_NOTICE_SENT";

/**
 * Motivo por el que se abre la morosidad. Solo cambia el texto del aviso
 * interno: el efecto sobre el socio es el mismo en los cuatro casos.
 */
export type DelinquencyReason = "INVOICE_FAILED" | "SEPA_ASYNC_FAILED" | "SEPA_RETURNED" | "DISPUTE";

const REASON_LABEL: Record<DelinquencyReason, string> = {
  INVOICE_FAILED: "Stripe no ha podido cobrar la cuota de este mes. Revisa el método de pago del socio.",
  SEPA_ASYNC_FAILED:
    "El adeudo SEPA no ha llegado a cargarse en la cuenta del socio. Revisa la domiciliación con él.",
  SEPA_RETURNED:
    "El banco ha devuelto un adeudo SEPA que ya estaba cobrado. El dinero ha salido de la cuenta del gimnasio.",
  DISPUTE: "El banco del socio ha abierto una disputa sobre un cobro. Revísalo en el Dashboard de Stripe.",
};

export async function sendDunningNoticeOnce(
  orgId: string,
  memberId: string,
  /** Clave del aviso: la factura, o el cargo cuando no hay factura detrás. */
  noticeKey: string,
  amountCents: number
): Promise<void> {
  const already = await prisma.auditLog.findFirst({
    where: { entityType: DUNNING_ENTITY, entityId: noticeKey },
    select: { id: true },
  });
  if (already) return;

  const [org, member] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        firstName: true,
        email: true,
        user: { select: { email: true } },
        primaryCenter: { select: { address: true } },
        subscriptions: {
          where: { status: { in: ["ACTIVE", "FROZEN"] }, plan: { type: { in: ["MONTHLY", "ONLINE"] } } },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { plan: { select: { name: true } } },
        },
      },
    }),
  ]);
  const to = member?.user?.email ?? member?.email;
  if (!member || !to) return;

  // Se registra ANTES de enviar: si el correo falla, el socio se queda sin
  // aviso de ESTA factura, que es preferible a recibir uno por cada reintento
  // del banco. Recepción lo ve igual en la lista de morosos.
  await prisma.auditLog.create({
    data: {
      orgId,
      action: DUNNING_SENT_ACTION,
      entityType: DUNNING_ENTITY,
      entityId: noticeKey,
      memberId,
      metadata: { amountCents },
    },
  });

  const brandName = org?.name ?? "Training Zone";
  // Correo de servicio: NO lleva `unsubscribeUrl`. Un socio no puede darse de
  // baja de enterarse de que su cuota no se ha cobrado — sin este aviso pierde
  // el acceso sin saber por qué. El pie sí enlaza sus preferencias.
  const footer = memberEmailFooterLinks(memberId);
  void sendMail({
    to,
    fromName: brandName,
    subject: "No hemos podido cobrar tu cuota",
    html: renderPaymentFailedEmail({
      memberFirstName: member.firstName,
      brandName,
      brandLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      amountLabel: new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amountCents / 100),
      portalUrl: memberBillingUrlFor(generateMemberDunningToken(memberId)),
      planName: member.subscriptions[0]?.plan.name,
      postalAddress: member.primaryCenter.address ?? undefined,
      prefsToken: footer.token,
    }),
  });
}

/**
 * Abre (o mantiene) la morosidad de un socio: **la única puerta** por la que se
 * escribe `Member.state = DELINQUENT`.
 *
 * `delinquentSince` es lo que hace medible el periodo de gracia, y por eso solo
 * se pone si no había ya un impago abierto: los reintentos de Stripe generan
 * varios fallos sobre la misma deuda, y reiniciar el reloj en cada uno le
 * regalaba al moroso una gracia infinita.
 */
export async function openDelinquency(params: {
  orgId: string;
  memberId: string;
  /** Clave del aviso al socio (factura o cargo). Sin ella no se manda correo. */
  noticeKey?: string | null;
  amountCents: number;
  reason: DelinquencyReason;
  now?: Date;
}): Promise<void> {
  const { orgId, memberId, amountCents, reason } = params;
  const now = params.now ?? new Date();

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, firstName: true, lastName: true, delinquentSince: true },
  });
  if (!member) return;

  await prisma.member.update({
    where: { id: member.id },
    data: {
      state: "DELINQUENT",
      // El reloj de la gracia arranca en el PRIMER impago y no se reinicia.
      ...(member.delinquentSince ? {} : { delinquentSince: now }),
    },
  });

  if (params.noticeKey) {
    await sendDunningNoticeOnce(orgId, memberId, params.noticeKey, amountCents);
  }

  // Aviso a recepción: reutiliza el motor de notificaciones de F10
  // (lib/notifications.ts), con el mismo grupo de roles que ya puede cobrar a
  // socios (billing/actions.ts) — createNotificationOnce evita duplicar el
  // aviso mientras la factura siga sin resolverse.
  const recipients = await prisma.user.findMany({
    where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR", "RECEPTION"] }, deactivatedAt: null },
    select: { id: true },
  });
  const memberName = `${member.firstName} ${member.lastName}`;
  const title =
    reason === "SEPA_RETURNED"
      ? `${memberName}: adeudo SEPA devuelto por el banco`
      : `${memberName}: cobro recurrente fallido`;
  for (const recipient of recipients) {
    await createNotificationOnce({
      orgId,
      recipientUserId: recipient.id,
      kind: "ALERT",
      title,
      body: REASON_LABEL[reason],
      entityType: "Member",
      entityId: memberId,
    });
  }
}

/**
 * Cierra la morosidad: el cobro entró. Limpia el reloj de gracia y resuelve el
 * aviso de recepción — dejarlo abierto manda a alguien a perseguir a un socio
 * que está al corriente.
 */
export async function closeDelinquency(orgId: string, memberId: string): Promise<void> {
  await prisma.member.updateMany({
    where: { id: memberId, orgId, state: "DELINQUENT" },
    data: { state: "ACTIVE", delinquentSince: null },
  });
  // El `delinquentSince` se limpia también si el socio ya no estaba DELINQUENT
  // (recepción pudo devolverlo a ACTIVE a mano): un reloj colgado sin impago
  // abierto corta el acceso de alguien que paga.
  await prisma.member.updateMany({
    where: { id: memberId, orgId, delinquentSince: { not: null }, state: { not: "DELINQUENT" } },
    data: { delinquentSince: null },
  });

  await prisma.notification.updateMany({
    where: { orgId, entityType: "Member", entityId: memberId, kind: "ALERT", resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}
