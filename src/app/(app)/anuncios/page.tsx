import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canManageAnnouncements, canManageOrg, defaultRouteForRole } from "@/lib/rbac";
import { getCentersForUser } from "@/lib/agenda-queries";
import { listAnnouncementsForManager } from "@/lib/announcements-queries";
import { PageHeader } from "@/components/ui/page-header";
import AnnouncementsManager, { type AnnouncementRow } from "./announcements-manager";

export default async function AnnouncementsPage() {
  const session = await requireSession();
  if (!canManageAnnouncements(session.user.role)) {
    redirect(defaultRouteForRole(session.user.role));
  }

  const centers = await getCentersForUser({
    id: session.user.id,
    role: session.user.role,
    orgId: session.user.orgId,
    centerId: session.user.centerId,
  });

  // OWNER/PLATFORM_ADMIN ven todos los anuncios de la org; el director de centro,
  // los globales y los de sus centros.
  const scopeCenterIds = canManageOrg(session.user.role) ? null : centers.map((c) => c.id);
  const rows = await listAnnouncementsForManager(session.user.orgId, scopeCenterIds);

  const announcements: AnnouncementRow[] = rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    imageUrl: a.imageUrl,
    category: a.category,
    audience: a.audience,
    tags: a.tags,
    pinned: a.pinned,
    active: a.active,
    centerId: a.centerId,
    centerName: a.center?.name ?? null,
    createdByName: a.createdBy?.name ?? null,
    viewCount: a._count.views,
    startsAt: a.startsAt ? a.startsAt.toISOString() : null,
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Comunicación"
        description="Publica anuncios y banners que tus socios ven al entrar en su portal: eventos del club, promociones o avisos. Puedes dirigirlos a toda la empresa o a un centro concreto, con vigencia opcional por fechas."
      />
      <AnnouncementsManager
        announcements={announcements}
        centers={centers.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
