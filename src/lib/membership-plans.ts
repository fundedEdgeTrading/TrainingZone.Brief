import type { PlanType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planServiceKind, type ServiceKind } from "@/lib/session-balance";

/**
 * E4-29 · Guardar un producto: UNA función para la web y para la app.
 *
 * Editar el mismo producto hacía cosas distintas según por dónde entraras:
 *
 *  · La web declaraba el `type` con sus seis valores; la app mandaba una
 *    modalidad de tres y la traducía, así que `DROP_IN` y `DUO` eran
 *    inalcanzables **y editar un `DROP_IN` desde la app lo convertía en
 *    `SESSION_PACK`**.
 *  · `description` e `imageUrl` —lo que el socio ve en el catálogo y en
 *    `/hazte-socio`— solo existían en el formulario de la app: un gimnasio que
 *    solo usara la web no podía rellenarlos nunca.
 *  · Cambiar el precio desde la web invalidaba el espejo de Stripe; desde la
 *    app, no. Había un cobro con precio obsoleto esperando a ocurrir.
 *  · Borrar desde la web archivaba; desde la app, `delete()`.
 */

export const PLAN_TYPES: PlanType[] = ["MONTHLY", "SESSION_PACK", "DROP_IN", "PERSONAL_TRAINING", "DUO", "ONLINE"];

/** Rótulo único de cada tipo de producto, compartido por las dos superficies. */
export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  MONTHLY: "Cuota mensual",
  SESSION_PACK: "Bono de sesiones",
  DROP_IN: "Sesión suelta",
  PERSONAL_TRAINING: "Entrenamiento personal",
  DUO: "Dúo",
  ONLINE: "Online",
};

/** Tipos que consumen sesiones de un bono: para ellos las sesiones incluidas son obligatorias. */
export const PACK_TYPES: PlanType[] = ["SESSION_PACK", "PERSONAL_TRAINING", "DUO"];

/** Traducción de la modalidad de tres valores de la app al tipo del dominio. */
export function planTypeFor(serviceKind: ServiceKind, sessionsIncluded: number | null): PlanType {
  if (serviceKind === "EP") return "PERSONAL_TRAINING";
  if (serviceKind === "ONLINE") return "ONLINE";
  return sessionsIncluded ? "SESSION_PACK" : "MONTHLY";
}

/**
 * Qué tipo queda tras guardar.
 *
 * La regla que faltaba: si quien edita manda una MODALIDAD y el producto ya es
 * de esa modalidad, se conserva su tipo. Sin esto, guardar una "sesión suelta"
 * desde la app la convertía en bono de sesiones sin que nadie lo pidiera —
 * traducir `GROUP` siempre daba `SESSION_PACK` o `MONTHLY`.
 */
export function resolvePlanType(
  current: PlanType | null,
  input: { planType?: PlanType | null; serviceKind?: ServiceKind | null; sessionsIncluded: number | null }
): PlanType {
  if (input.planType) return input.planType;
  if (!input.serviceKind) return current ?? planTypeFor("GROUP", input.sessionsIncluded);
  if (current && planServiceKind(current) === input.serviceKind) return current;
  return planTypeFor(input.serviceKind, input.sessionsIncluded);
}

export type SaveMembershipPlanInput = {
  /** Ausente = alta. Presente = edición del producto de esa organización. */
  planId?: string | null;
  name: string;
  /** El tipo explícito de los seis. Alternativa: `serviceKind` (compatibilidad con la app). */
  planType?: PlanType | null;
  serviceKind?: ServiceKind | null;
  priceCents: number;
  sessionsIncluded?: number | null;
  validityDays?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Visibilidad en el catálogo. En un alta, por defecto visible. */
  active?: boolean;
};

export type SaveMembershipPlanResult =
  | { ok: true; id: string; priceChanged: boolean }
  | { ok: false; error: string };

/** Valida lo que no depende de la base de datos. Mismo mensaje en las dos superficies. */
export function validateMembershipPlan(input: SaveMembershipPlanInput, currentType: PlanType | null): string | null {
  if (!input.name.trim()) return "Indica el nombre del producto.";
  if (input.planType && !PLAN_TYPES.includes(input.planType)) return "Tipo de producto no válido.";
  if (!Number.isFinite(input.priceCents) || input.priceCents <= 0) return "El precio debe ser mayor que 0.";
  if (!Number.isInteger(input.priceCents)) return "El precio debe ser mayor que 0.";

  const sessions = input.sessionsIncluded ?? null;
  if (sessions !== null && (!Number.isInteger(sessions) || sessions <= 0)) {
    return "Las sesiones incluidas deben ser un número entero mayor que 0.";
  }
  const validity = input.validityDays ?? null;
  if (validity !== null && (!Number.isInteger(validity) || validity <= 0)) {
    return "La validez en días debe ser un número entero mayor que 0.";
  }

  const type = resolvePlanType(currentType, { ...input, sessionsIncluded: sessions });
  if (PACK_TYPES.includes(type) && sessions === null) {
    return "Un bono necesita indicar cuántas sesiones incluye.";
  }
  return null;
}

/**
 * Alta o edición de un producto. Devuelve `priceChanged` para que quien llame
 * pueda contarlo (traza, aviso), no para que decida nada: la invalidación del
 * espejo de Stripe se hace AQUÍ, en las dos superficies.
 */
export async function saveMembershipPlan(
  orgId: string,
  input: SaveMembershipPlanInput
): Promise<SaveMembershipPlanResult> {
  const existing = input.planId
    ? await prisma.membershipPlan.findFirst({
        where: { id: input.planId, orgId },
        select: { id: true, type: true, priceCents: true, sessionsIncluded: true, validityDays: true },
      })
    : null;
  if (input.planId && !existing) return { ok: false, error: "Producto no encontrado." };

  const name = input.name.trim();
  // Al editar, lo que no venga se conserva: la app no manda validez, y mandar
  // `null` la BORRABA en cada guardado.
  const sessionsIncluded =
    input.sessionsIncluded !== undefined ? input.sessionsIncluded : (existing?.sessionsIncluded ?? null);
  const validityDays = input.validityDays !== undefined ? input.validityDays : (existing?.validityDays ?? null);

  const error = validateMembershipPlan({ ...input, name, sessionsIncluded, validityDays }, existing?.type ?? null);
  if (error) return { ok: false, error };

  const type = resolvePlanType(existing?.type ?? null, { ...input, sessionsIncluded });

  const duplicate = await prisma.membershipPlan.findFirst({
    where: {
      orgId,
      name: { equals: name, mode: "insensitive" },
      active: true,
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) return { ok: false, error: "Ya tienes un producto activo con ese nombre." };

  const data: Prisma.MembershipPlanUncheckedCreateInput = {
    orgId,
    name,
    type,
    priceCents: input.priceCents,
    sessionsIncluded,
    validityDays,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };

  if (!existing) {
    const created = await prisma.membershipPlan.create({ data, select: { id: true } });
    return { ok: true, id: created.id, priceChanged: false };
  }

  // F5/RB-VENTA-002: los precios de Stripe son inmutables — si cambia el
  // importe, el espejo (`stripePriceId`) queda obsoleto y hay que invalidarlo
  // para que `ensureStripePrice` cree uno nuevo en el próximo checkout. Las
  // `Subscription` ya vivas no se ven afectadas: siguen colgando del precio
  // anterior, que nunca se borra. Esto valía solo para la web, y por eso desde
  // la app quedaba un cobro con precio obsoleto esperando a ocurrir.
  const priceChanged = input.priceCents !== existing.priceCents;
  const { orgId: _unused, ...updatable } = data;
  void _unused; // el `orgId` ya está fijado por la fila: no se reescribe al editar.
  await prisma.membershipPlan.update({
    where: { id: existing.id },
    data: { ...updatable, ...(priceChanged ? { stripePriceId: null } : {}) },
  });
  return { ok: true, id: existing.id, priceChanged };
}

/**
 * Archivar, NUNCA borrar (RB-VENTA-002): un producto tiene suscripciones y
 * pagos colgando, y borrarlo dejaría el histórico de cobros sin referencia.
 * Archivado desaparece de los selectores de venta y del catálogo del socio, y
 * sigue visible en el histórico y para quien ya lo tiene contratado.
 */
export async function setMembershipPlanActive(
  orgId: string,
  planId: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId }, select: { id: true } });
  if (!plan) return { ok: false, error: "Producto no encontrado." };
  await prisma.membershipPlan.update({ where: { id: plan.id }, data: { active } });
  return { ok: true };
}
