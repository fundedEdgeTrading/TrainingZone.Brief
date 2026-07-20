"use client";

import { usePathname } from "next/navigation";
import { getPageTitle } from "@/lib/rbac";
import UserMenu from "./user-menu";
import { useMobileNav } from "./mobile-nav";

export default function Header({
  nav,
  subtitle,
  userName,
  roleLabel,
  centerChip,
}: {
  nav: { href: string; label: string }[];
  subtitle: string;
  userName: string;
  roleLabel: string;
  centerChip?: string;
}) {
  const pathname = usePathname();
  const { setOpen } = useMobileNav();
  const title = getPageTitle(nav, pathname);
  const showChip = centerChip && pathname === "/dashboard";

  return (
    <header
      className="h-[72px] lg:h-[88px] shrink-0 bg-brand-card border-b border-brand-border flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 tz-head-in"
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
        <span className="hidden sm:block w-1.5 h-[34px] bg-tz-black rounded-[2px] shrink-0" />
        <div className="min-w-0">
          <div className="font-display font-extrabold text-lg sm:text-[22px] leading-none tracking-[-.01em] uppercase text-brand-text truncate">
            {title}
          </div>
          <div className="text-xs sm:text-[13px] text-brand-muted mt-[3px] truncate">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {showChip && (
          <div className="hidden md:flex items-center gap-2 bg-brand-bg border border-brand-border rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-brand-text-2 cursor-pointer transition-colors duration-[180ms] hover:border-brand-ink hover:bg-white">
            <span className="w-2 h-2 rounded-full bg-brand-ink" />
            {centerChip}
          </div>
        )}
        <UserMenu name={userName} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
