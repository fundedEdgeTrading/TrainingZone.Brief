"use client";

import { usePathname } from "next/navigation";
import { getPageTitle } from "@/lib/rbac";
import UserMenu from "./user-menu";

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
  const title = getPageTitle(nav, pathname);
  const showChip = centerChip && pathname === "/dashboard";

  return (
    <header
      className="h-[88px] shrink-0 bg-brand-card border-b border-brand-border flex items-center justify-between px-8 tz-head-in"
    >
      <div className="flex items-center gap-3.5">
        <span className="w-1.5 h-[34px] bg-brand-yellow rounded-[2px]" />
        <div>
          <div className="font-display font-extrabold text-[22px] leading-none tracking-[-.01em] uppercase text-brand-text">
            {title}
          </div>
          <div className="text-[13px] text-brand-muted mt-[3px]">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {showChip && (
          <div className="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-brand-text-2 cursor-pointer transition-colors duration-[180ms] hover:border-brand-ink hover:bg-white">
            <span className="w-2 h-2 rounded-full bg-brand-ink" />
            {centerChip}
          </div>
        )}
        <UserMenu name={userName} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
