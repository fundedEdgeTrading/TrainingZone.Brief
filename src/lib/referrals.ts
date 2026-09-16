/**
 * R1 · Referidos con recompensa — el enlace, el embudo y los estados.
 *
 * LA REGLA QUE MANDA SOBRE TODAS LAS DEMÁS: LA RECOMPENSA NO SE APLICA SOLA.
 * Se LIBERA en el alta del referido, y liberar significa CREAR UNA TAREA a
 * administración (`Notification`, que ya tiene motor) para validarla y marcarla
 * como pagada. Este módulo y `referral-rewards.ts` NO tocan un recibo, ni un
 * `Payment`, ni un cupón de Stripe, JAMÁS. Si en algún momento parece más
 * elegante aplicar el descuento automáticamente: no lo es, y es la única línea
 * del encargo que negocio subrayó. Un sistema que toca recibos por su cuenta
 * descuadra Stripe.
 *
 * EL EMBUDO NO SE DUPLICA. Quien entra por `/r/[code]` cae en `Lead` —el que ya
 * existe—, con `channel = "Referido"` (`LeadChannel` ya es configurable sin
 * desplegar, RB-LEAD-004) y `Lead.referredByMemberId` relleno, y SIGUE EL
 * EMBUDO NORMAL. No hay segundo embudo y no hay tabla de referidos.
 *
 * LOS ESTADOS SE DERIVAN, NO SE GUARDAN. invitado → valoración hecha → alta son
 * `Lead.status` y `Lead.convertedMemberId`, y la derivación vive en UNA función
 * —`referralStateOf`— que usan el panel y la recompensa. Por eso no existe
 * ninguna columna de estado del referido en el esquema (D-L3-8), y por eso no
 * hay que añadirla: dos estados en paralelo discrepan en una semana.
 */
import { randomInt } from "node:crypto";

import type { MemberState } from "@prisma/client";

import { isCenterInScope, isMemberInScope, type ScopedUser } from "@/lib/center-scope";
import { normalizeCouponCode } from "@/lib/coupon-code";
import { prisma } from "@/lib/prisma";
import {
  buildReferralCode,
  canBeAmbassador,
  CODE_ALPHABET,
  CODE_SUFFIX_LENGTH,
  isWellFormedReferralCode,
  REFERRAL_LEAD_CHANNEL,
  referralStateOf,
  type ReferralState,
} from "@/lib/referral-program";

/**
 * LA PARTE PURA VIVE EN `referral-program.ts` y se reexporta aquí: los estados
 * derivados, el formato del código, los rótulos y las tres reglas antifraude no
 * pueden vivir en un módulo con `prisma` dentro, porque el formulario del
 * programa y el panel del socio son componentes de CLIENTE y el build de Next
 * se llevaría Prisma al bundle del navegador. Mismo patrón que `coupon-code.ts`
 * respecto a `stripe-coupons.ts`. Los call sites de servidor siguen importando
 * todo de un solo sitio.
 */
export * from "@/lib/referral-program";

/* ------------------------------------------------------------------------- *
 * El canal, en el catálogo de la organización
 * ------------------------------------------------------------------------- */

/**
 * Autorreparación del catálogo, mismo patrón que `ensureAutomaticTagDefinitions`
 * (E1): la primera persona que abre su enlace no puede depender de que alguien
 * se acordara de teclear el canal en `/leads`. Si dirección lo desactivó a
 * mano, se respeta —el catálogo es suyo— y el lead se crea igual con el mismo
 * rótulo: el canal describe de dónde vino, y eso ya pasó.
 */
export async function ensureReferralLeadChannel(orgId: string): Promise<void> {
  const existing = await prisma.leadChannel.findFirst({
    where: { orgId, label: REFERRAL_LEAD_CHANNEL },
    select: { id: true },
  });
  if (existing) return;
  await prisma.leadChannel.create({ data: { orgId, label: REFERRAL_LEAD_CHANNEL } });
}

/* ------------------------------------------------------------------------- *
 * El sufijo aleatorio del código
 * ------------------------------------------------------------------------- */

/**
 * Se queda de este lado —y no en el módulo puro— porque usa `node:crypto`, que
 * es exactamente lo que no puede cruzar al navegador. El formato del código
 * (`buildReferralCode`) sí es compartido: el cliente tiene que poder pintarlo.
 */
export function randomCodeSuffix(pick: (max: number) => number = (max) => randomInt(max)): string {
  let out = "";
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i++) out += CODE_ALPHABET[pick(CODE_ALPHABET.length)];
  return out;
}

export type ReferralCodeView = {
  id: string;
  code: string;
  centerId: string;
  revokedAt: Date | null;
  createdAt: Date;
};

export type ReferralCodeResult = { ok: true; code: ReferralCodeView } | { ok: false; error: string };

/**
 * El código del socio, creándolo la primera vez que hace falta. Idempotente:
 * `ReferralCode.memberId` es `@unique`, así que dos pestañas a la vez no crean
 * dos códigos.
 *
 * El ámbito de centro se comprueba SIEMPRE (`isMemberInScope`), también cuando
 * lo pida la app móvil: el "espejo móvil" que se salta el ámbito es el fallo
 * que más se repite en este repositorio.
 */
export async function ensureReferralCode(user: ScopedUser, memberId: string): Promise<ReferralCodeResult> {
  if (!(await isMemberInScope(user, memberId))) return { ok: false, error: "Socio fuera de tu ámbito." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: user.orgId },
    select: { id: true, orgId: true, primaryCenterId: true, firstName: true, state: true },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const existing = await prisma.referralCode.findUnique({
    where: { memberId },
    select: { id: true, code: true, centerId: true, revokedAt: true, createdAt: true },
  });
  if (existing) return { ok: true, code: existing };

  if (!canBeAmbassador(member.state)) {
    return { ok: false, error: "Un socio de baja no puede invitar: su código caduca con la baja." };
  }

  // Colisión: el sufijo da 30^5 ≈ 24 millones por nombre, pero "improbable" no
  // es "imposible" y el `@unique` es global. Se reintenta unas cuantas veces y,
  // si aun así choca, se dice — no se devuelve un código de otro socio.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = buildReferralCode(member.firstName, randomCodeSuffix());
    const taken = await prisma.referralCode.findUnique({ where: { code }, select: { id: true } });
    if (taken) continue;
    try {
      const created = await prisma.referralCode.create({
        data: { orgId: member.orgId, centerId: member.primaryCenterId, memberId: member.id, code },
        select: { id: true, code: true, centerId: true, revokedAt: true, createdAt: true },
      });
      return { ok: true, code: created };
    } catch {
      // Carrera con otra pestaña: si el que ganó fue el mismo socio, su código
      // vale; si fue una colisión de `code`, se vuelve a intentar.
      const mine = await prisma.referralCode.findUnique({
        where: { memberId },
        select: { id: true, code: true, centerId: true, revokedAt: true, createdAt: true },
      });
      if (mine) return { ok: true, code: mine };
    }
  }
  return { ok: false, error: "No se ha podido generar un código único. Vuelve a intentarlo." };
}

/** Solo lectura: el código que ya tenga, sin crearlo. */
export async function referralCodeForMember(user: ScopedUser, memberId: string): Promise<ReferralCodeView | null> {
  if (!(await isMemberInScope(user, memberId))) return null;
  return prisma.referralCode.findFirst({
    where: { memberId, orgId: user.orgId },
    select: { id: true, code: true, centerId: true, revokedAt: true, createdAt: true },
  });
}

export type ResolvedReferralCode = {
  codeId: string;
  code: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgLogoUrl: string | null;
  centerId: string;
  centerName: string;
  referrerMemberId: string;
  referrerFirstName: string;
};

/**
 * Lo que necesita `/r/[code]`, que es una ruta PÚBLICA y por tanto no tiene
 * sesión ni ámbito de centro que aplicar: el centro sale del propio código.
 *
 * Devuelve `null` —y la ruta responde 404— cuando el código no existe, está
 * revocado, o el socio que lo comparte ya no puede invitar. Antifraude 3 se
 * comprueba aquí DOS VECES a propósito: `revokedAt`, que lo escribe la baja
 * (`member-lifecycle.ts`), y el estado vivo del socio, por si alguna vez
 * alguien vuelve a abrir un punto de escritura por su cuenta.
 */
export async function resolveReferralCode(rawCode: string): Promise<ResolvedReferralCode | null> {
  if (!isWellFormedReferralCode(rawCode)) return null;
  const code = normalizeCouponCode(rawCode);

  const row = await prisma.referralCode.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      orgId: true,
      centerId: true,
      revokedAt: true,
      organization: { select: { name: true, slug: true, logoUrl: true } },
      center: { select: { name: true } },
      member: { select: { id: true, firstName: true, state: true } },
    },
  });
  if (!row || row.revokedAt || !canBeAmbassador(row.member.state)) return null;

  return {
    codeId: row.id,
    code: row.code,
    orgId: row.orgId,
    orgName: row.organization.name,
    orgSlug: row.organization.slug,
    orgLogoUrl: row.organization.logoUrl,
    centerId: row.centerId,
    centerName: row.center.name,
    referrerMemberId: row.member.id,
    referrerFirstName: row.member.firstName,
  };
}

/* ------------------------------------------------------------------------- *
 * ANTIFRAUDE 3 · el código caduca con la baja
 * ------------------------------------------------------------------------- */

/**
 * El enganche de M4. `member-lifecycle.ts` es el ÚNICO punto de escritura de
 * las transiciones de estado de un socio, y esto se llama DESDE ahí: aquí no se
 * abre un segundo sitio desde el que se cambia el estado de nadie — lo único
 * que se toca es `ReferralCode.revokedAt`, que es del programa de referidos.
 *
 * Se REVOCA, no se borra: un lead que entró con este código ayer tiene que
 * poder seguir señalando por dónde entró, que es lo que hace comprobable el
 * antifraude. Y si el socio vuelve, se reactiva la misma fila y conserva su
 * código de siempre — el que ya compartió por WhatsApp.
 *
 * Idempotente y sin `throw`: una transición de estado no puede fallar porque el
 * programa de referidos tenga un mal día.
 */
export async function syncReferralCodeWithMemberState(memberId: string, state: MemberState): Promise<void> {
  const code = await prisma.referralCode.findUnique({ where: { memberId }, select: { id: true, revokedAt: true } });
  if (!code) return;

  const shouldBeRevoked = !canBeAmbassador(state);
  if (shouldBeRevoked && !code.revokedAt) {
    await prisma.referralCode.update({ where: { id: code.id }, data: { revokedAt: new Date() } });
    return;
  }
  if (!shouldBeRevoked && code.revokedAt) {
    await prisma.referralCode.update({ where: { id: code.id }, data: { revokedAt: null } });
  }
}

/* ------------------------------------------------------------------------- *
 * El embudo de un embajador
 * ------------------------------------------------------------------------- */

export type ReferredLeadView = {
  leadId: string;
  firstName: string;
  lastName: string;
  centerId: string;
  createdAt: Date;
  state: ReferralState;
  convertedMemberId: string | null;
  viaLink: boolean;
};

/**
 * Los referidos de un socio con su estado DERIVADO. Es una lectura de `Lead`,
 * con su ámbito de centro puesto: el mismo criterio que `leadIsInScope`.
 */
export async function referralFunnelFor(user: ScopedUser, memberId: string): Promise<ReferredLeadView[]> {
  if (!(await isMemberInScope(user, memberId))) return [];

  const leads = await prisma.lead.findMany({
    where: { orgId: user.orgId, referredByMemberId: memberId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      centerId: true,
      createdAt: true,
      status: true,
      convertedMemberId: true,
      referralCodeId: true,
    },
    take: 200,
  });

  const visible = [] as ReferredLeadView[];
  for (const lead of leads) {
    if (!(await isCenterInScope(user, lead.centerId))) continue;
    visible.push({
      leadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      centerId: lead.centerId,
      createdAt: lead.createdAt,
      state: referralStateOf(lead),
      convertedMemberId: lead.convertedMemberId,
      // Distingue "entró por el enlace" de "lo apuntó recepción a mano", y esa
      // diferencia decide dinero (comentario de `Lead.referralCodeId`).
      viaLink: lead.referralCodeId !== null,
    });
  }
  return visible;
}
