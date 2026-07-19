"use client";

import { signOut } from "next-auth/react";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function UserMenu({
  name,
  roleLabel,
}: {
  name: string;
  roleLabel: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2.5">
        <div className="w-[38px] h-[38px] rounded-full bg-tz-black flex items-center justify-center font-display font-extrabold text-sm text-tz-bone shrink-0">
          {initials(name)}
        </div>
        <div className="leading-[1.15] hidden sm:block">
          <div className="text-[13px] font-bold text-brand-text">{name}</div>
          <div className="text-xs text-brand-muted">{roleLabel}</div>
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-[13px] font-semibold text-brand-footer border border-brand-border bg-white rounded-lg px-3.5 py-2 transition-colors duration-[180ms] hover:bg-brand-ink hover:text-white hover:border-brand-ink"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
