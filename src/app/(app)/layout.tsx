import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NAV_BY_ROLE, ROLE_LABEL, footerLabelForRole, filterNavByFeatures } from "@/lib/rbac";
import { featuresForOrg, isPlatformOperational } from "@/lib/entitlements";
import { listNotificationsForUser } from "@/lib/notifications";
import { membershipsFor } from "@/lib/identity";
import { getMemberForUser, getPendingSessionFeedbackCountForUser, getMemberUpcomingBookings, isLiveBooking } from "@/lib/portal-queries";
import { isRecurring } from "@/lib/member-billing";
import { planServiceKind } from "@/lib/members-queries";
import { resolveTimezone } from "@/lib/timezone";
import { TimezoneSync } from "@/components/timezone-sync";
import Sidebar, { type MemberSidebarData } from "./sidebar";
import Header from "./header";
import { MobileNavProvider } from "./mobile-nav";
import { AccountMenuProvider } from "./account-menu";
import { ToastProvider } from "@/components/ui/toast";
import { CelebrateProvider } from "@/components/ui/celebrate";
import { RouteProgress } from "@/components/ui/route-progress";

const SERVICE_LABEL: Record<"EP" | "GROUP" | "ONLINE", string> = {
  EP: "Entrenamiento personal",
  GROUP: "Grupos reducidos",
  ONLINE: "Online",
};

/** "HOY 19:00" / "MAÑANA 19:00" / "MAR 19:00" para la meta de "Reservar clase" en el sidebar. */
function shortDayTimeLabel(startsAt: Date, startTime: string, timezone: string) {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  today.setHours(0, 0, 0, 0);
  const day = new Date(startsAt.toLocaleString("en-US", { timeZone: timezone }));
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return `HOY ${startTime}`;
  if (diffDays === 1) return `MAÑANA ${startTime}`;
  const weekday = startsAt.toLocaleDateString("es-ES", { weekday: "short", timeZone: timezone });
  return `${weekday.replace(".", "").toUpperCase()} ${startTime}`;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const { role, centerId, name, email } = session.user;

  // El centro se resuelve antes que el resto: de él sale la zona horaria con la
  // que se calculan todas las horas de pared de la app (ver `resolveTimezone`).
  const center = centerId
    ? await prisma.center.findUnique({ where: { id: centerId }, select: { name: true, logoUrl: true, timezone: true } })
    : null;
  const timezone = await resolveTimezone(center?.timezone);

  const [org, notifications, pendingPlanCount, memberships, features, member] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true, logoUrl: true, platformStatus: true },
    }),
    listNotificationsForUser(session.user.orgId, session.user.id),
    role === "MEMBER" ? getPendingSessionFeedbackCountForUser(session.user.id, timezone) : Promise.resolve(0),
    membershipsFor(session.user.identityId),
    featuresForOrg(session.user.orgId),
    role === "MEMBER" ? getMemberForUser(session.user.id) : Promise.resolve(null),
  ]);

  // RB-PLAT-001: el acceso a la app se gatea por platformStatus. PLATFORM_ADMIN
  // (soporte de Apta) queda exento para poder gestionar cualquier org.
  if (role !== "PLATFORM_ADMIN" && org && !isPlatformOperational(org.platformStatus)) {
    redirect(role === "MEMBER" ? "/servicio-no-disponible" : "/activar");
  }

  // Meta de "Reservar clase": próxima reserva viva del socio, si tiene alguna.
  const nextBooking =
    role === "MEMBER" && member
      ? (await getMemberUpcomingBookings(member.id, timezone)).find(isLiveBooking)
      : undefined;

  // Badge de "pendientes" en Mi membresía (F16/valoración de sesiones): solo el socio.
  const roleNav = NAV_BY_ROLE[role].map((item) => {
    if (item.href === "/portal/membresia" && pendingPlanCount > 0) return { ...item, badge: pendingPlanCount };
    if (item.href === "/portal/agenda" && nextBooking) {
      return { ...item, meta: shortDayTimeLabel(nextBooking.startsAt, nextBooking.startTime, timezone) };
    }
    return item;
  });
  // RB-PLAN-003: lo que el plan no incluye no se enseña. El soporte de Apta lo ve todo.
  const nav = role === "PLATFORM_ADMIN" ? roleNav : filterNavByFeatures(roleNav, features);

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

  // Tarjeta de bono del sidebar premium (RB-VENTA): solo si hay suscripción activa.
  let memberSidebar: MemberSidebarData | undefined;
  if (role === "MEMBER" && member) {
    const activeSub = member.subscriptions[0];
    memberSidebar = {
      name: name ?? email ?? "",
      roleLabel: ROLE_LABEL.MEMBER,
      centerName,
      bono: activeSub
        ? {
            serviceLabel: SERVICE_LABEL[planServiceKind(activeSub.plan.type) ?? "GROUP"],
            planName: activeSub.plan.name,
            recurring: isRecurring(activeSub.plan.type),
            sessionsRemaining: activeSub.sessionsRemaining,
            sessionsIncluded: activeSub.plan.sessionsIncluded,
            nextChargeLabel: activeSub.endDate
              ? activeSub.endDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
              : null,
          }
        : null,
    };
  }

  return (
    <MobileNavProvider>
      <AccountMenuProvider>
        <ToastProvider>
          <CelebrateProvider>
            <TimezoneSync current={timezone} />
            <div className="flex min-h-screen bg-brand-bg">
              <Sidebar
                nav={nav}
                footerLabel={footerLabelForRole(role)}
                logoUrl={logoUrl}
                brandName={brandName}
                member={memberSidebar}
              />
              <div className="flex-1 flex flex-col min-w-0">
                <Header
                  nav={nav}
                  subtitle={subtitle}
                  userName={name ?? email ?? ""}
                  roleLabel={ROLE_LABEL[role]}
                  centerChip={showCenterChip ? "Todos los centros" : undefined}
                  notifications={notifications}
                  organizations={memberships.map((m) => ({ orgId: m.orgId, orgName: m.orgName }))}
                  activeOrgId={session.user.orgId}
                  isMember={role === "MEMBER"}
                />
                <main className="flex-1 overflow-y-auto p-4 pb-10 sm:p-6 lg:p-7 lg:px-8 lg:pb-12 bg-brand-bg">
                  <RouteProgress />
                  {children}
                </main>
              </div>
            </div>
          </CelebrateProvider>
        </ToastProvider>
      </AccountMenuProvider>
    </MobileNavProvider>
  );
}
