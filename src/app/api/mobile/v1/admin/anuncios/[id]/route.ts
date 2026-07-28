import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCentersForUser } from "@/lib/agenda-queries";
import { canManageAnnouncements } from "@/lib/rbac";
import { requireApiRole } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

const MANAGER_ROLES = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"] as const;

type AnnouncementPatchBody = {
  title?: string;
  body?: string | null;
  imageUrl?: string | null;
  category?: "NEWS" | "EVENT" | "PROMO" | "ALERT";
  audience?: "ALL" | "MEMBERS";
  centerId?: string | null;
  pinned?: boolean;
  tags?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, [...MANAGER_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageAnnouncements(claims.role)) return apiError("No tienes permiso para gestionar anuncios.", 403);
  const { id } = await params;

  const existing = await prisma.announcement.findFirst({ where: { id, orgId: claims.orgId } });
  if (!existing) return apiError("No se ha encontrado el anuncio.", 404);

  const body = (await req.json().catch(() => null)) as AnnouncementPatchBody | null;
  if (!body) return apiError("Cuerpo inválido.", 400);

  // Solo cambiar de estado (activo/inactivo), sin tocar el resto de campos.
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    await prisma.announcement.update({ where: { id }, data: { active: body.active } });
    return apiOk({ updated: true });
  }

  const title = body.title?.trim();
  if (!title) return apiError("El anuncio necesita un título.", 400);
  if (!body.body?.trim() && !body.imageUrl?.trim()) return apiError("Añade un texto o una imagen al anuncio.", 400);

  const centerId = body.centerId ?? null;
  if (centerId) {
    const centers = await getCentersForUser({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
    if (!centers.some((c) => c.id === centerId)) return apiError("No puedes publicar en ese centro.", 403);
  }

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (startsAt && endsAt && endsAt < startsAt) return apiError("La fecha de fin no puede ser anterior a la de inicio.", 400);

  await prisma.announcement.update({
    where: { id },
    data: {
      centerId,
      title,
      body: body.body?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
      category: body.category ?? "NEWS",
      audience: body.audience ?? "ALL",
      tags: body.tags ?? [],
      pinned: Boolean(body.pinned),
      startsAt,
      endsAt,
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    },
  });

  return apiOk({ updated: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, [...MANAGER_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageAnnouncements(claims.role)) return apiError("No tienes permiso para gestionar anuncios.", 403);
  const { id } = await params;

  const existing = await prisma.announcement.findFirst({ where: { id, orgId: claims.orgId } });
  if (!existing) return apiError("No se ha encontrado el anuncio.", 404);

  await prisma.announcement.delete({ where: { id } });
  return apiOk({ deleted: true });
}
