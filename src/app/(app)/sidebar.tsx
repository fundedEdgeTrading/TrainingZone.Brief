"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AptaLogo from "@/components/apta-logo";
import { useMobileNav } from "./mobile-nav";

export default function Sidebar({
  nav,
  sectionLabel,
  footerLabel,
  logoUrl,
  brandName,
}: {
  nav: { href: string; label: string }[];
  sectionLabel: string;
  footerLabel: string;
  logoUrl?: string | null;
  brandName?: string;
}) {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();
  const activeHref = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))?.href;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-tz-black/45 transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-tz-sand text-text-2 border-r border-tz-linen flex flex-col h-dvh transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shrink-0 lg:transition-none`}
      >
        <div
          className="relative h-[72px] lg:h-[88px] flex items-center justify-center px-4 border-b border-tz-linen shrink-0"
          style={{ animation: "tzNavIn .5s cubic-bezier(.2,.8,.2,1) both" }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización/centro (URL arbitraria), no un asset estático
            <img
              src={logoUrl}
              alt={brandName ?? "Logo"}
              className="h-[26px] lg:h-[34px] w-auto max-w-[190px] object-contain block"
            />
          ) : (
            // Sin logo propio → marca de la plataforma (Apta)
            <AptaLogo variant="dark" className="text-2xl lg:text-3xl" />
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="absolute right-2 top-1/2 -translate-y-1/2 lg:hidden flex items-center justify-center w-8 h-8 rounded-[10px] text-text-2 transition-colors duration-[180ms] hover:bg-tz-linen/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div
          className="px-3.5 pt-5 pb-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted"
          style={{ animation: "tzNavIn .5s .05s both" }}
        >
          {sectionLabel}
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
          {nav.map((item, i) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-[10px] px-3.5 py-[11px] text-sm transition-[background-color,color,transform] duration-[180ms] ${
                  active
                    ? "bg-tz-black text-tz-bone font-bold"
                    : "bg-transparent text-text-2 font-medium hover:bg-tz-linen/40 hover:translate-x-1"
                }`}
                style={{ animation: `tzNavIn .45s ${(0.12 + i * 0.05).toFixed(2)}s both` }}
              >
                <span
                  className={`w-[7px] h-[7px] rounded-[2px] shrink-0 transition-colors duration-[180ms] ${
                    active ? "bg-tz-bone" : "bg-faint"
                  }`}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className="px-5 py-4 border-t border-tz-linen text-xs text-muted tracking-[.04em] shrink-0"
          style={{ animation: "tzNavIn .5s .5s both" }}
        >
          <span className="text-tz-black font-bold">TZ</span> · {footerLabel}
        </div>
      </aside>
    </>
  );
}
