import { prisma } from "@/lib/prisma";

// D.1 — Anuncios y banners que el socio ve en su Dashboard. Alcance mixto:
// globales de la empresa (centerId null) + los del centro del socio. Vigencia
// opcional por fechas y segmentación por audiencia.

export type MemberAnnouncement = {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  category: string;
  tags: string[];
  pinned: boolean;
  createdAt: Date;
};

export async function getAnnouncementsForMember(member: {
  id: string;
  orgId: string;
  primaryCenterId: string;
  state: string;
}): Promise<MemberAnnouncement[]> {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      orgId: member.orgId,
      active: true,
      OR: [{ centerId: null }, { centerId: member.primaryCenterId }],
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
      // Audiencia: "MEMBERS" solo para socios activos; "ALL" para todos.
      ...(member.state === "ACTIVE" ? {} : { audience: "ALL" as const }),
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      body: true,
      imageUrl: true,
      category: true,
      tags: true,
      pinned: true,
      createdAt: true,
    },
  });
  return rows;
}

// RB-ANUN-003: registra una vista por (anuncio, socio) de forma idempotente,
// para la analítica que ve la dirección. No falla la carga del portal si algo
// va mal al registrar (mejor esfuerzo).
export async function registerAnnouncementViews(memberId: string, announcementIds: string[]) {
  if (announcementIds.length === 0) return;
  try {
    await prisma.announcementView.createMany({
      data: announcementIds.map((announcementId) => ({ announcementId, memberId })),
      skipDuplicates: true,
    });
  } catch {
    // best-effort: la analítica no bloquea el portal del socio
  }
}

// Vista de dirección: todos los anuncios del ámbito del gestor, con nº de vistas.
// OWNER/PLATFORM_ADMIN ven todos los de la org; CENTER_DIRECTOR ve los globales
// y los de su(s) centro(s).
export async function listAnnouncementsForManager(orgId: string, centerIds: string[] | null) {
  const rows = await prisma.announcement.findMany({
    where: {
      orgId,
      ...(centerIds ? { OR: [{ centerId: null }, { centerId: { in: centerIds } }] } : {}),
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: {
      center: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { views: true } },
    },
  });
  return rows;
}
