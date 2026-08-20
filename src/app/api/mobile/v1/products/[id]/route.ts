import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";
import { planTypeFor } from "../../_lib/products";

const MANAGER_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"];

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  priceCents: z.number().int().min(0).optional(),
  sessionsIncluded: z.number().int().min(1).nullable().optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  const body = parsed.data;

  const sessionsIncluded = body.sessionsIncluded !== undefined ? body.sessionsIncluded : plan.sessionsIncluded;

  await prisma.membershipPlan.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      ...(body.priceCents !== undefined ? { priceCents: body.priceCents } : {}),
      ...(body.sessionsIncluded !== undefined ? { sessionsIncluded: body.sessionsIncluded } : {}),
      ...(body.validityDays !== undefined ? { validityDays: body.validityDays } : {}),
      ...(body.serviceKind ? { type: planTypeFor(body.serviceKind, sessionsIncluded ?? null) } : {}),
      ...(body.visible !== undefined ? { active: body.visible } : {}),
    },
  });

  return apiOk({ updated: true });
}

// Regla de negocio del handoff (D4): un producto solo se puede borrar si no
// tiene suscriptores; si los tiene, se oculta (PATCH visible=false).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, MANAGER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const plan = await prisma.membershipPlan.findFirst({
    where: { id, orgId: claims.orgId },
    select: { id: true, _count: { select: { subscriptions: true } } },
  });
  if (!plan) return apiError("No se ha encontrado el producto.", 404);
  if (plan._count.subscriptions > 0) {
    return apiError("Este producto tiene socios suscritos: ocúltalo en vez de borrarlo.", 409);
  }

  await prisma.membershipPlan.delete({ where: { id } });
  return apiOk({ deleted: true });
}
