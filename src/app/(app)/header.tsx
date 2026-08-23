"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPageTitle, PARENT_ROUTE } from "@/lib/rbac";
import UserMenu, { type OrgOption } from "./user-menu";
import { useMobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { AccountMenuTrigger, initials } from "./account-menu";
import { HeaderActionsTarget, useHeaderSubtitleOverride } from "./header-slot";

export default function Header({
  nav,
  subtitle,
  userName,
  roleLabel,
  centerChip,
  notifications,
  organizations,
  activeOrgId,
  isMember,
}: {
  nav: { href: string; label: string }[];
  subtitle: string;
  userName: string;
  roleLabel: string;
  centerChip?: string;
  notifications: {
    id: string;
    title: string;
    body: string | null;
    kind: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date;
  }[];
  organizations: OrgOption[];
  activeOrgId: string;
  /** El socio usa el chip + menú de cuenta nuevo; el resto de roles conservan el UserMenu de siempre. */
  isMember?: boolean;
}) {
  const pathname = usePathname();
  const { setOpen } = useMobileNav();
  const title = getPageTitle(nav, pathname);
  const showChip = centerChip && pathname === "/dashboard";
  // Pantallas que cuelgan de otra (el mapa de barrios, del panel): el header
  // pinta la vuelta, que si no solo existiría en el botón atrás del navegador.
  const parentRoute = PARENT_ROUTE[pathname];
  // Una pantalla con estado propio puede contar el suyo (ciudad activa, nº de
  // centros) en vez del subtítulo de sesión que pone el layout.
  const subtitleOverride = useHeaderSubtitleOverride();

  return (
    <header
      className="relative z-30 h-[72px] lg:h-[88px] shrink-0 bg-brand-card border-b border-brand-border flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 tz-head-in"
    >
      <div className="flex items-center gap-3 lg:gap-3.5 min-w-0">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="lg:hidden flex items-center justify-center w-10 h-10 -ml-1 shrink-0 rounded-[10px] border border-brand-border bg-white text-brand-text transition-colors duration-[180ms] hover:bg-tz-bone"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        {parentRoute && (
          <Link
            href={parentRoute}
            aria-label="Volver"
            className="flex items-center justify-center w-[38px] h-[38px] shrink-0 rounded-[10px] border border-brand-border text-brand-text-2 transition-colors duration-150 hover:bg-brand-bg hover:text-brand-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
        )}
        <span className="hidden sm:block w-1.5 h-[34px] bg-tz-black rounded-[2px] shrink-0" />
        <div className="min-w-0">
          {/* `key` por ruta: cada aterrizaje remonta el título y retriggerea
              `tzRollUp`, en el mismo compás que la píldora del sidebar. */}
          <div
            key={pathname}
            className="font-display font-extrabold text-lg sm:text-[22px] leading-none tracking-[-.01em] uppercase text-brand-text truncate"
            style={{ animation: "tzRollUp .42s var(--ease-out-soft) both" }}
          >
            {title}
          </div>
          <div className="text-xs sm:text-[13px] text-brand-muted mt-[3px] truncate">{subtitleOverride ?? subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <HeaderActionsTarget className="contents" />
        {showChip && (
          <div className="hidden md:flex items-center gap-2 bg-brand-bg border border-brand-border rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-brand-text-2 cursor-pointer transition-colors duration-[180ms] hover:border-brand-ink hover:bg-white">
            <span className="w-2 h-2 rounded-full bg-brand-ink" />
            {centerChip}
          </div>
        )}
        <NotificationBell notifications={notifications} />
        {isMember ? (
          <AccountMenuTrigger id="header-account" placement="down">
            {() => (
              <div className="flex items-center gap-2.5 border border-brand-border rounded-full py-[5px] pl-[6px] pr-3.5 transition-colors duration-150 hover:bg-brand-bg">
                <div className="w-[30px] h-[30px] rounded-full bg-brand-ink text-tz-bone flex items-center justify-center font-display font-extrabold text-xs shrink-0">
                  {initials(userName)}
                </div>
                <span className="hidden sm:inline text-[13px] font-bold text-brand-text">{userName.split(" ")[0]}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-muted)" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M7 10l5 5 5-5" />
                </svg>
              </div>
            )}
          </AccountMenuTrigger>
        ) : (
          <UserMenu
            name={userName}
            roleLabel={roleLabel}
            organizations={organizations}
            activeOrgId={activeOrgId}
          />
        )}
      </div>
    </header>
  );
}
