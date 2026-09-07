import type { PlanType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ServiceKind } from "@/lib/session-balance";
import { PACK_TYPES, PLAN_TYPES, resolvePlanType } from "@/lib/membership-plan-types";
import { hasOnlineContent } from "@/lib/online-queries";
// HU-ST-08: la propagación a Stripe cuelga de aquí para que las dos superficies
// la hereden. La lógica vive en `stripe-catalog.ts`.
import { readPlanSnapshot, syncPlanToStripe, type PlanStripeSync } from "@/lib/stripe-catalog";

/** E12-03: aviso cuando un plan ONLINE se guarda sin contenido que entregar. */
export const ONLINE_PLAN_NO_CONTENT_WARNING =
  "Este plan ONLINE se ha guardado oculto: hace falta subir al menos un vídeo antes de poder activarlo.";

export {
  PACK_TYPES,
  PLAN_TYPES,
  PLAN_TYPE_LABEL,
  planTypeFor,
  resolvePlanType,
} from "@/lib/membership-plan-types";

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
  | { ok: true; id: string; priceChanged: boolean; stripe: PlanStripeSync; warning?: string }
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
  input: SaveMembershipPlanInput,
  /** Quién guarda, para la traza del cambio de importe (HU-ST-08). */
  actorUserId?: string | null
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

  // E12-03: el plan ONLINE se sigue vendiendo (D-P6), pero no es vendible de
  // verdad sin contenido que entregar (RB pendiente). Si pide quedar visible
  // y no hay ni un vídeo publicado, se guarda oculto y se avisa.
  let active = input.active;
  let warning: string | undefined;
  if (type === "ONLINE" && active !== false && !(await hasOnlineContent(orgId))) {
    active = false;
    warning = ONLINE_PLAN_NO_CONTENT_WARNING;
  }

  const data: Prisma.MembershipPlanUncheckedCreateInput = {
    orgId,
    name,
    type,
    priceCents: input.priceCents,
    sessionsIncluded,
    validityDays,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(active !== undefined ? { active } : {}),
  };

  if (!existing) {
    const created = await prisma.membershipPlan.create({ data, select: { id: true } });
    // HU-ST-08: el alta crea Product y Price en la cuenta conectada. Sin Stripe
    // conectado el producto se queda solo en Apta, "pendiente de sincronizar".
    const stripe = await syncPlanToStripe(orgId, created.id, null, actorUserId);
    return { ok: true, id: created.id, priceChanged: false, stripe, warning };
  }

  // F5/RB-VENTA-002: los precios de Stripe son inmutables — si cambia el
  // importe, el espejo (`stripePriceId`) queda obsoleto y hay que invalidarlo
  // para que `ensureStripePrice` cree uno nuevo en el próximo checkout. Las
  // `Subscription` ya vivas no se ven afectadas: siguen colgando del precio
  // anterior, que nunca se borra. Esto valía solo para la web, y por eso desde
  // la app quedaba un cobro con precio obsoleto esperando a ocurrir.
  const priceChanged = input.priceCents !== existing.priceCents;
  // El espejo ANTES de tocarlo: `syncPlanToStripe` necesita el `stripePriceId`
  // viejo para archivarlo, y la línea de abajo lo pone a null.
  const before = await readPlanSnapshot(orgId, existing.id);
  const { orgId: _unused, ...updatable } = data;
  void _unused; // el `orgId` ya está fijado por la fila: no se reescribe al editar.
  await prisma.membershipPlan.update({
    where: { id: existing.id },
    data: { ...updatable, ...(priceChanged ? { stripePriceId: null } : {}) },
  });
  // HU-ST-08: nombre, descripción y foto se propagan al Product (sin generar
  // precio nuevo); un cambio de importe crea un Price nuevo y archiva el
  // anterior — nunca lo borra (RB-VENTA-007).
  const stripe = await syncPlanToStripe(orgId, existing.id, before, actorUserId);
  return { ok: true, id: existing.id, priceChanged, stripe, warning };
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
  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId }, select: { id: true, type: true } });
  if (!plan) return { ok: false, error: "Producto no encontrado." };
  if (active && plan.type === "ONLINE" && !(await hasOnlineContent(orgId))) {
    return { ok: false, error: ONLINE_PLAN_NO_CONTENT_WARNING };
  }
  const before = await readPlanSnapshot(orgId, plan.id);
  await prisma.membershipPlan.update({ where: { id: plan.id }, data: { active } });
  // HU-ST-08: ocultar en Apta oculta también en Stripe. Quien lo tiene
  // contratado sigue igual — archivar un producto no cancela suscripciones.
  await syncPlanToStripe(orgId, plan.id, before);
  return { ok: true };
}
