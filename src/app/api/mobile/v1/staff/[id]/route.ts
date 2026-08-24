import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageStaff, canManageOrg } from "@/lib/rbac";
import { removeStaffMember } from "@/lib/staff-lifecycle";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

// D7 del handoff: ficha de equipo — foto, rol, visibilidad en la app del socio
// e imputación a centros (la suma no puede pasar de 100 %).
const READ_ROLES: Role[] = ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER", "CENTER_DIRECTOR"];

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER", "PLATFORM_ADMIN"]).optional(),
  image: z.string().trim().nullable().optional(),
  visibleInApp: z.boolean().optional(),
  allocations: z.array(z.object({ centerId: z.string().trim().min(1), pct: z.number().int().min(0).max(100) })).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, READ_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageStaff(claims.role)) return apiError("No tienes permiso para gestionar el equipo.", 403);
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, orgId: claims.orgId, role: { not: "MEMBER" }, deactivatedAt: null },
    select: { id: true, role: true },
  });
  if (!user) return apiError("No se ha encontrado a esa persona.", 404);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  const body = parsed.data;

  const targetRole = body.role ?? user.role;
  if ((targetRole === "OWNER" || targetRole === "PLATFORM_ADMIN" || user.role === "OWNER") && !canManageOrg(claims.role)) {
    return apiError("No tienes permiso para editar ese rol.", 403);
  }

  if (body.allocations) {
    const total = body.allocations.reduce((sum, a) => sum + a.pct, 0);
    if (total > 100) return apiError("La imputación a centros no puede pasar del 100 %.", 400);

    const centers = await prisma.center.findMany({
      where: { orgId: claims.orgId, id: { in: body.allocations.map((a) => a.centerId) } },
      select: { id: true },
    });
    if (centers.length !== body.allocations.length) return apiError("Alguno de los centros no es de tu organización.", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.image !== undefined ? { image: body.image } : {}),
        ...(body.visibleInApp !== undefined ? { visibleInApp: body.visibleInApp } : {}),
      },
    });

    if (!body.allocations) return;

    // Un 0 % equivale a no imputar: la fila se borra en vez de quedarse a cero.
    const keep = body.allocations.filter((a) => a.pct > 0);
    await tx.centerMembership.deleteMany({
      where: { userId: id, orgId: claims.orgId, centerId: { notIn: keep.map((a) => a.centerId) } },
    });
    for (const allocation of keep) {
      await tx.centerMembership.upsert({
        where: { userId_centerId: { userId: id, centerId: allocation.centerId } },
        create: {
          orgId: claims.orgId,
          userId: id,
          centerId: allocation.centerId,
          role: targetRole,
          isPrimary: false,
          allocationPct: allocation.pct,
        },
        update: { role: targetRole, allocationPct: allocation.pct },
      });
    }
  });

  return apiOk({ updated: true });
}

/**
 * "Dar de baja del equipo" (RB-RRHH-014). Hacía media baja —quitaba la
 * imputación y la visibilidad en la app, pero la persona seguía pudiendo
 * entrar—; ahora comparte núcleo con la sección Equipo de `/organization`
 * (`lib/staff-lifecycle.ts`), así que también le corta el acceso, respeta las
 * sesiones que tenga por delante y deja la baja en el registro de auditoría.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, READ_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageStaff(claims.role)) return apiError("No tienes permiso para gestionar el equipo.", 403);
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, orgId: claims.orgId, role: { not: "MEMBER" } },
    select: { id: true, name: true, email: true, role: true, centerId: true, deactivatedAt: true },
  });
  if (!user) return apiError("No se ha encontrado a esa persona.", 404);
  if (user.role === "OWNER" && !canManageOrg(claims.role)) return apiError("No tienes permiso para dar de baja a dirección.", 403);

  const result = await removeStaffMember({ orgId: claims.orgId, actorUserId: claims.sub, target: user });
  if (!result.ok) return apiError(result.error, 400);

  return apiOk({ removed: true, purged: result.purged });
}
