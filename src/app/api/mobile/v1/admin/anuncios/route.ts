import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { listAnnouncementsForManager } from "@/lib/announcements-queries";
import { getCentersForUser } from "@/lib/agenda-queries";
import { canManageAnnouncements, canManageOrg } from "@/lib/rbac";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

const MANAGER_ROLES = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"] as const;

type AnnouncementBody = {
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
};

// Espejo de src/app/(app)/anuncios/page.tsx.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, [...MANAGER_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageAnnouncements(claims.role)) return apiError("No tienes permiso para gestionar anuncios.", 403);

  const centers = await getCentersForUser({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
  const scopeCenterIds = canManageOrg(claims.role) ? null : centers.map((c) => c.id);
  const rows = await listAnnouncementsForManager(claims.orgId, scopeCenterIds);

  return apiOk({
    centers: centers.map((c) => ({ id: c.id, name: c.name })),
    announcements: rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      category: a.category,
      audience: a.audience,
      tags: a.tags,
      pinned: a.pinned,
      active: a.active,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      centerName: a.center?.name ?? "Global",
      createdByName: a.createdBy?.name ?? null,
      viewsCount: a._count.views,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

// Igual validación que src/app/(app)/anuncios/actions.ts createAnnouncement, con JSON en vez de FormData.
export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, [...MANAGER_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageAnnouncements(claims.role)) return apiError("No tienes permiso para gestionar anuncios.", 403);

  const body = (await req.json().catch(() => null)) as AnnouncementBody | null;
  const title = body?.title?.trim();
  if (!title) return apiError("El anuncio necesita un título.", 400);
  if (!body?.body?.trim() && !body?.imageUrl?.trim()) return apiError("Añade un texto o una imagen al anuncio.", 400);

  const centerId = body.centerId ?? null;
  if (centerId) {
    const centers = await getCentersForUser({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
    if (!centers.some((c) => c.id === centerId)) return apiError("No puedes publicar en ese centro.", 403);
  }

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (startsAt && endsAt && endsAt < startsAt) return apiError("La fecha de fin no puede ser anterior a la de inicio.", 400);

  const created = await prisma.announcement.create({
    data: {
      orgId: claims.orgId,
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
      createdById: claims.sub,
    },
  });

  return apiOk({ id: created.id });
}
