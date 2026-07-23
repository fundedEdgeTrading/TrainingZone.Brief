import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NAV_BY_ROLE, ROLE_LABEL, footerLabelForRole } from "@/lib/rbac";
import { listNotificationsForUser } from "@/lib/notifications";
import { getPendingSessionFeedbackCountForUser } from "@/lib/portal-queries";
import Sidebar from "./sidebar";
import Header from "./header";
import { MobileNavProvider } from "./mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const { role, centerId, name, email } = session.user;

  const [org, center, notifications, pendingPlanCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true, logoUrl: true },
    }),
    centerId
      ? prisma.center.findUnique({ where: { id: centerId }, select: { name: true, logoUrl: true } })
      : Promise.resolve(null),
    listNotificationsForUser(session.user.orgId, session.user.id),
    role === "MEMBER" ? getPendingSessionFeedbackCountForUser(session.user.id) : Promise.resolve(0),
  ]);

  // Badge de "pendientes" en Mi plan (F16/valoración de sesiones): solo el socio.
  const nav = NAV_BY_ROLE[role].map((item) =>
    item.href === "/portal/plan" && pendingPlanCount > 0 ? { ...item, badge: pendingPlanCount } : item
  );

  // NavBar: logo del centro, si no el de la organización, si no el de Apta (null).
  const logoUrl = center?.logoUrl ?? org?.logoUrl ?? null;
  const brandName = org?.name ?? "Apta";

  let centerName = center?.name ?? "";
  if (org?.name && centerName.toUpperCase().startsWith(org.name.toUpperCase())) {
    centerName = centerName.slice(org.name.length).trim();
  }

  const subtitle =
    role === "MEMBER"
      ? `Training Zone · ${centerName}`
      : `${ROLE_LABEL[role]} · ${centerName || "Toda la organización"}`;

  const showCenterChip = role === "OWNER" || role === "PLATFORM_ADMIN";

  return (
    <MobileNavProvider>
      <div className="flex min-h-screen bg-brand-bg">
        <Sidebar
          nav={nav}
          footerLabel={footerLabelForRole(role)}
          logoUrl={logoUrl}
          brandName={brandName}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            nav={nav}
            subtitle={subtitle}
            userName={name ?? email ?? ""}
            roleLabel={ROLE_LABEL[role]}
            centerChip={showCenterChip ? "Todos los centros" : undefined}
            notifications={notifications}
          />
          <main className="flex-1 overflow-y-auto p-4 pb-10 sm:p-6 lg:p-7 lg:px-8 lg:pb-12 bg-brand-bg">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
