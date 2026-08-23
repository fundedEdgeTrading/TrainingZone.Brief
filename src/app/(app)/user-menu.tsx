"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

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
      {/* Única entrada a "Mi perfil" para el personal: es donde vive la tarjeta
          Apariencia (el socio llega a la suya por el menú de cuenta). Igual que
          el botón de salir, en móvil se queda en icono para no comerle el ancho
          al título de la página. */}
      <Link
        href="/mi-perfil"
        aria-label="Mi perfil"
        title="Mi perfil"
        className="flex items-center justify-center h-[38px] w-[38px] sm:w-auto sm:px-3.5 text-[13px] font-semibold text-brand-footer border border-brand-border bg-white rounded-lg whitespace-nowrap transition-colors duration-[180ms] hover:bg-brand-ink hover:text-white hover:border-brand-ink"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="sm:hidden"
          aria-hidden="true"
        >
          <path d="M20 21a8 8 0 1 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="hidden sm:inline">Mi perfil</span>
      </Link>
      {/* En móvil el rótulo se queda en un icono: con el texto completo, la
          cabecera no dejaba sitio al título de la página, que salía cortado. */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="flex items-center justify-center h-[38px] w-[38px] sm:w-auto sm:px-3.5 text-[13px] font-semibold text-brand-footer border border-brand-border bg-white rounded-lg whitespace-nowrap transition-colors duration-[180ms] hover:bg-brand-ink hover:text-white hover:border-brand-ink"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="sm:hidden"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span className="hidden sm:inline">Cerrar sesión</span>
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
    <Select
      disabled={switching || pending}
      value={activeOrgId}
      onChange={(e) => switchTo(e.target.value)}
      className="hidden md:block w-[180px]"
    >
      {organizations.map((o) => (
        <option key={o.orgId} value={o.orgId}>
          {o.orgName}
        </option>
      ))}
    </Select>
  );
}
