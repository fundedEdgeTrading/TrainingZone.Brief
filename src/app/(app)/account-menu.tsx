"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

/**
 * Estado compartido del menú de cuenta del socio (handoff NavBar premium
 * 1b): el bloque de usuario del sidebar y el chip del header abren el MISMO
 * menú, y solo uno puede estar abierto a la vez. Se identifica el disparador
 * activo por `id` en vez de un simple booleano para que cada trigger sepa si
 * es él quien está abierto (y dónde pintar su propio popover).
 */
const AccountMenuContext = createContext<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
}>({ openId: null, setOpenId: () => {} });

export function AccountMenuProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <AccountMenuContext.Provider value={{ openId, setOpenId }}>{children}</AccountMenuContext.Provider>;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const MENU_ITEMS = [
  { href: "/portal/perfil", label: "Mi perfil" },
  // No hay página dedicada para salud/notificaciones (RB-PERFIL-004 ya cubre
  // consentimientos en "Mi perfil"): se enlaza a la sección correspondiente
  // dentro de esa misma página en vez de inventar rutas nuevas.
  { href: "/portal/perfil#consentimientos", label: "Datos de salud y consentimientos" },
  { href: "/portal/perfil#consentimientos", label: "Notificaciones" },
];

export function AccountMenuTrigger({
  id,
  placement,
  children,
}: {
  /** Identificador único del disparador (sidebar/header) — ver comentario del contexto. */
  id: string;
  /** Hacia dónde se despliega el popover respecto al disparador. */
  placement: "up" | "down";
  children: (props: { open: boolean }) => React.ReactNode;
}) {
  const { openId, setOpenId } = useContext(AccountMenuContext);
  const open = openId === id;
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpenId]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenId(open ? null : id)}
        className="w-full text-left"
      >
        {children({ open })}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenId(null)} aria-hidden="true" />
          <div
            role="menu"
            aria-label="Menú de cuenta"
            className={`absolute z-50 w-[248px] bg-white border border-brand-border rounded-[14px] shadow-pop overflow-hidden tz-select-pop ${
              placement === "up" ? "bottom-full left-0 mb-2" : "top-full right-0 mt-2"
            }`}
          >
            {MENU_ITEMS.map((item, i) => (
              <Link
                key={item.label}
                ref={i === 0 ? firstItemRef : undefined}
                href={item.href}
                role="menuitem"
                onClick={() => setOpenId(null)}
                className="block px-3.5 py-[11px] text-[13px] font-semibold text-brand-text border-b border-tz-sand hover:bg-tz-bone transition-colors duration-150"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="block w-full text-left px-3.5 py-[11px] text-[13px] font-semibold text-critical hover:bg-critical-bg transition-colors duration-150"
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
