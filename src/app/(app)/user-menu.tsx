"use client";

import { useState, useTransition } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export type OrgOption = { orgId: string; orgName: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function UserMenu({
  name,
  roleLabel,
  organizations,
  activeOrgId,
}: {
  name: string;
  roleLabel: string;
  /** Todas las organizaciones de esta identidad. Con una sola no se muestra nada (D-11). */
  organizations: OrgOption[];
  activeOrgId: string;
}) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-4">
      <div className="flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] rounded-full bg-tz-black flex items-center justify-center font-display font-extrabold text-sm text-tz-bone shrink-0">
          {initials(name)}
        </div>
        <div className="leading-[1.15] hidden sm:block">
          <div className="text-[13px] font-bold text-brand-text">{name}</div>
          <div className="text-xs text-brand-muted">{roleLabel}</div>
        </div>
      </div>
      {organizations.length > 1 && <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-[13px] font-semibold text-brand-footer border border-brand-border bg-white rounded-lg px-3 py-2 sm:px-3.5 whitespace-nowrap transition-colors duration-[180ms] hover:bg-brand-ink hover:text-white hover:border-brand-ink"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

/**
 * RB-ID-004: propone un orgId; el callback `jwt` verifica en servidor que la
 * identidad tiene membresía en él antes de reescribir la sesión. Cambiar de
 * organización no vuelve a pedir contraseña.
 */
function OrgSwitcher({ organizations, activeOrgId }: { organizations: OrgOption[]; activeOrgId: string }) {
  const { update } = useSession();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);

  async function switchTo(orgId: string) {
    if (orgId === activeOrgId) return;
    setSwitching(true);
    await update({ orgId });
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
    setSwitching(false);
  }

  return (
    <select
      aria-label="Cambiar de organización"
      disabled={switching || pending}
      value={activeOrgId}
      onChange={(e) => switchTo(e.target.value)}
      className="hidden md:block text-[13px] font-semibold text-brand-text-2 border border-brand-border bg-white rounded-lg px-2.5 py-2 max-w-[180px] truncate disabled:opacity-60"
    >
      {organizations.map((o) => (
        <option key={o.orgId} value={o.orgId}>
          {o.orgName}
        </option>
      ))}
    </select>
  );
}
