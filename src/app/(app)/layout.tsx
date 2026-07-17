import { requireSession } from "@/lib/session";
import { NAV_BY_ROLE, ROLE_LABEL } from "@/lib/rbac";
import Sidebar from "./sidebar";
import UserMenu from "./user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const nav = NAV_BY_ROLE[session.user.role];

  return (
    <div className="flex min-h-screen">
      <Sidebar nav={nav} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-slate-500">
            TRAINING ZONE ·{" "}
            <span className="font-medium text-slate-700">
              {ROLE_LABEL[session.user.role]}
            </span>
          </div>
          <UserMenu name={session.user.name ?? session.user.email ?? ""} />
        </header>
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
