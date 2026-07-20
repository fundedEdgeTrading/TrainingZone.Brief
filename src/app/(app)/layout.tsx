import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NAV_BY_ROLE, ROLE_LABEL, sectionLabelForRole, footerLabelForRole } from "@/lib/rbac";
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
  const nav = NAV_BY_ROLE[role];

  const center = centerId
    ? await prisma.center.findUnique({ where: { id: centerId }, select: { name: true } })
    : null;
  const centerName = center?.name?.replace(/^TRAINING ZONE\s*/i, "") || "";

  const subtitle =
    role === "MEMBER"
      ? `Training Zone · ${centerName}`
      : `${ROLE_LABEL[role]} · ${centerName || "Toda la organización"}`;

  const showCenterChip = role === "OWNER" || role === "PLATFORM_ADMIN";

  return (
    <MobileNavProvider>
      <div className="flex min-h-screen bg-brand-bg">
        <Sidebar nav={nav} sectionLabel={sectionLabelForRole(role)} footerLabel={footerLabelForRole(role)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            nav={nav}
            subtitle={subtitle}
            userName={name ?? email ?? ""}
            roleLabel={ROLE_LABEL[role]}
            centerChip={showCenterChip ? "Todos los centros" : undefined}
          />
          <main className="flex-1 overflow-y-auto p-4 pb-10 sm:p-6 lg:p-7 lg:px-8 lg:pb-12 bg-brand-bg">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
