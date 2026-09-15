import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderCardExpiringEmail } from "@/lib/emails/templates";
import { generateMemberDunningToken, memberBillingUrlFor } from "@/lib/email-verification";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { absoluteUrl } from "@/lib/site";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-22 · Tarjetas por caducar. **PISTA P1.**
 *
 * Los dos eventos son las dos caras de lo mismo y por eso comparten
 * reconciliador:
 *   · `customer.source.expiring` → la tarjeta caduca el mes que viene: hay que
 *     avisar al socio con enlace a su método de pago (HU-ST-17/HU-ST-19).
 *   · `payment_method.automatically_updated` → la red (Visa/Mastercard Account
 *     Updater) ya ha refrescado la tarjeta sola: el aviso deja de aplicar y hay
 *     que retirarlo, o dirección persigue a un socio cuyo cobro va a entrar sin
 *     problema.
 *
 * Se recibe el `Stripe.Event` entero y no el objeto porque los dos eventos
 * traen tipos DISTINTOS (`Card`/`Source` frente a `PaymentMethod`).
 *
 * **El estado vive en `AuditLog`, no en una columna nueva** (el esquema está
 * congelado este trimestre, y a propósito): por cada socio vale el ÚLTIMO
 * apunte —`CARD_EXPIRING` o `CARD_UPDATED`—, así que el panel de dirección se
 * calcula y el orden de entrega de los eventos deja de importar. Es el mismo
 * patrón con el que HU-ST-12 frena el cobro asíncrono.
 *
 * Esto NO es morosidad: una tarjeta por caducar no corta nada ni marca a nadie
 * (HU-ST-18). Es justo el aviso que evita llegar a ese punto.
 */

const EXPIRY_ENTITY = "CardExpiry";
const EXPIRING_ACTION = "CARD_EXPIRING";
const UPDATED_ACTION = "CARD_UPDATED";
/** Sello del correo: uno por tarjeta y caducidad, no uno por evento. */
const EXPIRY_NOTICE_ENTITY = "CardExpiryNotice";
const EXPIRY_NOTICE_ACTION = "CARD_EXPIRY_NOTICE_SENT";

type CardFacts = {
  customerId: string | null;
  cardId: string | null;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

/**
 * Los mismos cuatro datos, vengan en la forma que vengan: `customer.source.expiring`
 * entrega una `Card` (o una `Source`) con los campos en la raíz, y
 * `payment_method.automatically_updated` un `PaymentMethod` que los lleva
 * dentro de `card`.
 */
function readCard(object: unknown): CardFacts {
  const o = (object ?? {}) as Record<string, unknown>;
  const card = (o.card ?? o) as Record<string, unknown>;
  const customer = o.customer;
  return {
    customerId: typeof customer === "string" ? customer : ((customer as { id?: string } | null)?.id ?? null),
    cardId: typeof o.id === "string" ? o.id : null,
    brand: typeof card.brand === "string" ? card.brand : null,
    last4: typeof card.last4 === "string" ? card.last4 : null,
    expMonth: typeof card.exp_month === "number" ? card.exp_month : null,
    expYear: typeof card.exp_year === "number" ? card.exp_year : null,
  };
}

/** "VISA ···· 4242", o lo que se pueda con lo que traiga el evento. */
export function cardLabel(facts: Pick<CardFacts, "brand" | "last4">): string {
  const brand = facts.brand ? facts.brand.toUpperCase() : "Tarjeta";
  return facts.last4 ? `${brand} ···· ${facts.last4}` : brand;
}

/** "10/2026", que es como lo lee el socio en su propia tarjeta. */
export function expiryLabel(month: number | null, year: number | null): string | null {
  if (!month || !year) return null;
  return `${String(month).padStart(2, "0")}/${year}`;
}

export async function reconcileCardExpiry(orgId: string, event: Stripe.Event): Promise<ReconcileResult> {
  const facts = readCard(event.data.object);
  if (!facts.customerId) return { ok: true };

  const member = await prisma.member.findFirst({
    where: { orgId, stripeCustomerId: facts.customerId },
    select: {
      id: true,
      firstName: true,
      email: true,
      user: { select: { email: true } },
      primaryCenter: { select: { address: true } },
    },
  });
  // Cliente que no reconocemos (cuenta de pruebas, socio borrado): se descarta
  // sin escribir, como cualquier evento de una cuenta que no es nuestra.
  if (!member) return { ok: true };

  if (event.type === "payment_method.automatically_updated") {
    await clearExpiryWarning(orgId, member.id, facts);
    return { ok: true };
  }

  await markExpiring(orgId, member.id, facts);
  await sendExpiryNoticeOnce(orgId, { ...member, orgId }, facts);
  return { ok: true };
}

/** Deja al socio marcado como "método a punto de caducar". */
async function markExpiring(orgId: string, memberId: string, facts: CardFacts): Promise<void> {
  if (await hasExpiringCard(memberId)) return; // ya marcado: no se repite el apunte
  await prisma.auditLog.create({
    data: {
      orgId,
      action: EXPIRING_ACTION,
      entityType: EXPIRY_ENTITY,
      entityId: memberId,
      memberId,
      metadata: {
        cardId: facts.cardId,
        brand: facts.brand,
        last4: facts.last4,
        expMonth: facts.expMonth,
        expYear: facts.expYear,
      },
    },
  });
}

/**
 * Retira el aviso: la red ha actualizado la tarjeta sola, o el socio la ha
 * cambiado. El apunte anterior NO se borra —`AuditLog` es append-only— sino que
 * se anota encima, que es lo que hace que valga el último.
 */
export async function clearExpiryWarning(
  orgId: string,
  memberId: string,
  facts: Partial<CardFacts> = {}
): Promise<void> {
  if (!(await hasExpiringCard(memberId))) return;
  await prisma.auditLog.create({
    data: {
      orgId,
      action: UPDATED_ACTION,
      entityType: EXPIRY_ENTITY,
      entityId: memberId,
      memberId,
      metadata: { cardId: facts.cardId ?? null, brand: facts.brand ?? null, last4: facts.last4 ?? null },
    },
  });
}

/** ¿Este socio tiene ahora mismo el método de pago a punto de caducar? */
export async function hasExpiringCard(memberId: string): Promise<boolean> {
  const last = await prisma.auditLog.findFirst({
    where: { entityType: EXPIRY_ENTITY, entityId: memberId },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  return last?.action === EXPIRING_ACTION;
}

/**
 * Escenario "panel": cuántos socios tienen el método a punto de caducar.
 *
 * Se CALCULA, no se persiste. Se leen los apuntes de la organización y se queda
 * el último de cada socio: sin columna nueva y sin depender de que los eventos
 * lleguen en orden.
 */
export async function countMembersWithExpiringCard(orgId: string, centerIds?: string[]): Promise<number> {
  const rows = await prisma.auditLog.findMany({
    where: { orgId, entityType: EXPIRY_ENTITY },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, action: true },
  });

  const seen = new Set<string>();
  const expiring: string[] = [];
  for (const row of rows) {
    if (seen.has(row.entityId)) continue; // ya se vio el más reciente de este socio
    seen.add(row.entityId);
    if (row.action === EXPIRING_ACTION) expiring.push(row.entityId);
  }
  if (expiring.length === 0) return 0;

  // El ámbito de centro se aplica sobre el SOCIO y no sobre el apunte: el log
  // no cuelga de un centro (`AuditLog.memberId` es una columna suelta, sin
  // relación), y recepción de un centro no puede contar socios de otro. De paso,
  // un socio borrado deja de contar sin tener que tocar el log.
  return prisma.member.count({
    where: {
      id: { in: expiring },
      orgId,
      ...(centerIds !== undefined ? { primaryCenterId: { in: centerIds } } : {}),
    },
  });
}

/**
 * El aviso al socio, una sola vez por tarjeta y caducidad.
 *
 * Stripe manda `customer.source.expiring` el mes anterior a la caducidad, y
 * puede reentregar el evento; el socio tiene que enterarse una vez, no una por
 * entrega. Mismo patrón de sello que `sendDunningNoticeOnce`.
 *
 * No es correo de servicio obligatorio como el preaviso SEPA, pero tampoco es
 * comercial: sin él, el cobro del mes que viene falla y el socio se entera por
 * el corte de acceso. Va por el mismo camino que el aviso de impago, con el pie
 * enlazando sus preferencias.
 */
async function sendExpiryNoticeOnce(
  orgId: string,
  member: {
    id: string;
    orgId: string;
    firstName: string;
    email: string | null;
    user: { email: string } | null;
    primaryCenter: { address: string | null } | null;
  },
  facts: CardFacts
): Promise<void> {
  const noticeKey = `${member.id}:${facts.cardId ?? "card"}:${facts.expYear ?? "?"}-${facts.expMonth ?? "?"}`;
  const already = await prisma.auditLog.findFirst({
    where: { entityType: EXPIRY_NOTICE_ENTITY, entityId: noticeKey },
    select: { id: true },
  });
  if (already) return;

  const to = member.user?.email ?? member.email;
  if (!to) return;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, logoUrl: true },
  });

  // Se sella ANTES de enviar: si el correo falla, el socio se queda sin aviso de
  // ESA caducidad —recepción lo sigue viendo en el panel— en vez de recibir uno
  // por cada reentrega del evento.
  await prisma.auditLog.create({
    data: {
      orgId,
      action: EXPIRY_NOTICE_ACTION,
      entityType: EXPIRY_NOTICE_ENTITY,
      entityId: noticeKey,
      memberId: member.id,
      metadata: { cardId: facts.cardId, expMonth: facts.expMonth, expYear: facts.expYear },
    },
  });

  const brandName = org?.name ?? "Training Zone";
  const footer = memberEmailFooterLinks(member.id);
  void sendMail({
    to,
    fromName: brandName,
    subject: "Tu tarjeta caduca pronto",
    html: renderCardExpiringEmail({
      memberFirstName: member.firstName,
      brandName,
      brandLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      cardLabel: cardLabel(facts),
      expiryLabel: expiryLabel(facts.expMonth, facts.expYear) ?? "el mes que viene",
      // El enlace aterriza en la pantalla de recuperación (HU-ST-19), que es la
      // que abre el Billing Portal de la cuenta conectada sin pedir contraseña.
      portalUrl: memberBillingUrlFor(generateMemberDunningToken(member.id)),
      postalAddress: member.primaryCenter?.address ?? undefined,
      prefsToken: footer.token,
    }),
  });
}
