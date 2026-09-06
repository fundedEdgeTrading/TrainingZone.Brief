import type { NextRequest } from "next/server";
import { z } from "zod";
import type { PlanType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";
import { PLAN_TYPES, saveMembershipPlan, setMembershipPlanActive } from "@/lib/membership-plans";

const MANAGER_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"];

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  priceCents: z.number().int().min(0).optional(),
  sessionsIncluded: z.number().int().min(1).nullable().optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  planType: z.enum(PLAN_TYPES as [string, ...string[]]).optional(),
  serviceKind: z.enum(["EP", "GROUP", "ONLINE"]).optional(),
  visible: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, MANAGER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const plan = await prisma.membershipPlan.findFirst({ where: { id, orgId: claims.orgId } });
  if (!plan) return apiError("No se ha encontrado el producto.", 404);
  // E12-03/D-S3: el plan ONLINE se gestiona desde la web, no desde la app.
  if (plan.type === "ONLINE") return apiError("El plan ONLINE se gestiona desde la web.", 403);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  const body = parsed.data;

  // Misma función que la web (E4-29). En particular: si cambia el precio se
  // invalida el espejo de Stripe —desde la app no se invalidaba, y quedaba un
  // cobro con precio obsoleto esperando a ocurrir— y guardar una "sesión
  // suelta" ya no la convierte en bono de sesiones.
  const result = await saveMembershipPlan(claims.orgId, {
    planId: id,
    name: body.name ?? plan.name,
    description: body.description,
    imageUrl: body.imageUrl,
    priceCents: body.priceCents ?? plan.priceCents,
    sessionsIncluded: body.sessionsIncluded,
    validityDays: body.validityDays,
    planType: body.planType as PlanType | undefined,
    serviceKind: body.serviceKind,
    active: body.visible,
  });
  if (!result.ok) return apiError(result.error, 400);

  return apiOk({ updated: true });
}

/**
 * E4-29 / RB-VENTA-002: ARCHIVA, nunca borra. Aquí se ejecutaba
 * un borrado real de la fila mientras la web archivaba, así que el mismo
 * botón dejaba el histórico de cobros sin referencia o no, según por dónde
 * entraras. Un producto archivado desaparece del catálogo y de los selectores
 * de venta, y sigue vivo para quien ya lo tiene contratado.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, MANAGER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const result = await setMembershipPlanActive(claims.orgId, id, false);
  if (!result.ok) return apiError(result.error, 404);

  // `deleted` se mantiene en la respuesta: para quien lo pidió, el producto ha
  // desaparecido del catálogo. `archived` dice lo que ha pasado de verdad.
  return apiOk({ deleted: true, archived: true });
}
