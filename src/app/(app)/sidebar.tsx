"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import AptaLogo from "@/components/apta-logo";
import NavIconSvg from "@/components/nav-icons";
import { activeNavHref, groupNav, NAV_SECTIONS_COLLAPSED_BY_DEFAULT, type NavItem, type NavSection } from "@/lib/rbac";
import { useMobileNav } from "./mobile-nav";
import { AccountMenuTrigger, initials } from "./account-menu";

export type MemberBonoCard = {
  serviceLabel: string;
  planName: string;
  /** Cuota recurrente (MONTHLY/ONLINE): se enseña el próximo cobro en vez de un progreso de sesiones. */
  recurring: boolean;
  sessionsRemaining: number | null;
  sessionsIncluded: number | null;
  nextChargeLabel: string | null;
} | null;

export type MemberSidebarData = {
  name: string;
  roleLabel: string;
  centerName: string;
  bono: MemberBonoCard;
};

const RAIL_KEY = "tz-nav-rail";
const GROUPS_KEY = "tz-nav-groups";

/**
 * Preferencias de la nav en `localStorage`, leídas con `useSyncExternalStore`:
 * el snapshot del servidor es `null` (rail desplegado, Administración plegada),
 * así que el primer render del cliente coincide con el del servidor y React
 * repinta con lo guardado justo después. Sin efecto que sincronice a mano.
 */
const listeners = new Set<() => void>();

function subscribeToPrefs(listener: () => void) {
  listeners.add(listener);
  // "storage" mantiene en sintonía las pestañas abiertas del mismo usuario.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // localStorage inaccesible (modo privado, cookies bloqueadas): defaults.
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* la preferencia no sobrevive al refresco, pero la sesión sigue */
  }
  for (const listener of listeners) listener();
}

const NO_PREF = () => null;

const GOLD_BAR = "linear-gradient(180deg,#e3cfa2,#b58e52)";
const GOLD_DOT = "linear-gradient(135deg,#e3cfa2,#b58e52)";

/**
 * Icono del item de navegación. Mientras el `<Link>` que lo contiene está
 * pendiente pasa a oro y pulsa con `tzLiveDot`: el usuario ve *qué* item ha
 * pulsado mientras la ruta carga. Es lo que hacía el punto de 7 px del diseño
 * anterior; `useLinkStatus` exige vivir dentro del `<Link>`, de ahí el
 * componente aparte.
 */
function NavItemIcon({ item, active }: { item: NavItem; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <NavIconSvg
      name={item.icon}
      className={`shrink-0 w-[19px] h-[19px] lg:w-[18px] lg:h-[18px] ${
        pending ? "text-apta-gold" : active ? "text-apta-gold" : ""
      }`}
      style={
        pending
          ? { animation: "tzLiveDot 1.1s ease-in-out infinite" }
          : active
            ? { animation: "tzIconPop .44s var(--ease-spring) both" }
            : undefined
      }
    />
  );
}


/**
 * Logo de la organización con su variante oscura.
 *
 * Se pintan los dos y manda el CSS (`.tz-logo-light` / `.tz-logo-dark` en
 * globals.css). Resolverlo en el servidor obligaría a leer `User.theme` también
 * en este layout; hacerlo en el cliente dejaría un fotograma con el logo
 * equivocado. Cuando no hay variante distinta (logo propio del cliente), se
 * pinta una sola imagen.
 */
function BrandLogo({
  light,
  dark,
  alt,
  className,
}: {
  light: string;
  dark?: string | null;
  alt: string;
  className?: string;
}) {
  /* eslint-disable @next/next/no-img-element -- logo dinámico por organización/centro (URL arbitraria), no un asset estático */
  if (!dark || dark === light) {
    return <img src={light} alt={alt} className={`block ${className ?? ""}`} />;
  }
  return (
    <>
      <img src={light} alt={alt} className={`tz-logo-light block ${className ?? ""}`} />
      <img src={dark} alt="" aria-hidden="true" className={`tz-logo-dark block ${className ?? ""}`} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}

export default function Sidebar({
  nav,
  footerLabel,
  logoUrl,
  logoUrlDark,
  brandName,
  member,
}: {
  nav: NavItem[];
  footerLabel: string;
  logoUrl?: string | null;
  /**
   * Variante del logo para el tema oscuro, si el asset la tiene (ver
   * `logoUrlForTheme`). Se pintan las dos y el CSS enseña la que toca: así no
   * hace falta leer el tema aquí ni hay un fotograma con el logo equivocado.
   */
  logoUrlDark?: string | null;
  brandName?: string;
  /** Presente solo para el rol MEMBER (rediseño NavBar premium 1b). Otros roles conservan el pie de texto plano. */
  member?: MemberSidebarData;
}) {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();
  const activeHref = activeNavHref(nav, pathname);
  const groups = groupNav(nav);
  // Un solo grupo no necesita cabecera: por debajo de 7 items (entrenador,
  // recepción, RRHH, admin de plataforma) rotular cuesta más de lo que ordena.
  const flat = groups.length === 1;

  // El rail recupera 180 px para las tablas densas (Socios, Cobros): es una
  // herramienta de staff. El socio conserva su sidebar con tarjeta de bono.
  const railable = !member;
  const railPref = useSyncExternalStore(subscribeToPrefs, () => readPref(RAIL_KEY), NO_PREF);
  const groupsPref = useSyncExternalStore(subscribeToPrefs, () => readPref(GROUPS_KEY), NO_PREF);

  const openSections = useMemo<Partial<Record<NavSection, boolean>>>(() => {
    if (!groupsPref) return {};
    try {
      const saved: unknown = JSON.parse(groupsPref);
      return saved && typeof saved === "object" ? (saved as Partial<Record<NavSection, boolean>>) : {};
    } catch {
      return {};
    }
  }, [groupsPref]);

  const rail = railable && railPref === "1";

  const toggleRail = useCallback(() => {
    writePref(RAIL_KEY, readPref(RAIL_KEY) === "1" ? "0" : "1");
  }, []);

  const sectionOpenByDefault = (section: NavSection) => !NAV_SECTIONS_COLLAPSED_BY_DEFAULT.includes(section);

  const toggleSection = (section: NavSection) => {
    const current = openSections[section] ?? sectionOpenByDefault(section);
    writePref(GROUPS_KEY, JSON.stringify({ ...openSections, [section]: !current }));
  };

  const isSectionOpen = (section: NavSection) =>
    // En 76 px no hay cabecera que pulsar: si una sección quedara plegada, sus
    // items serían inalcanzables. El rail las fuerza todas a abiertas.
    rail || flat || (openSections[section] ?? sectionOpenByDefault(section));

  // Tooltip del rail: cuelga del <aside> (el <nav> recorta en horizontal), así
  // que se guarda el centro de la fila relativo al propio <aside>.
  const asideRef = useRef<HTMLElement>(null);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = (label: string) => (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    if (!rail || !asideRef.current) return;
    const row = e.currentTarget.getBoundingClientRect();
    const box = asideRef.current.getBoundingClientRect();
    setTip({ label, top: row.top - box.top + row.height / 2 });
  };
  const hideTip = () => setTip(null);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-scrim transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        ref={asideRef}
        className={`fixed inset-y-0 left-0 z-50 w-[304px] bg-sidebar text-text-2 border-r border-tz-linen flex flex-col h-dvh transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shrink-0 lg:transition-[width] lg:duration-[260ms] lg:ease-[cubic-bezier(.2,.8,.2,1)] ${
          rail ? "lg:w-[76px]" : "lg:w-64"
        }`}
      >
        <div
          className={`relative h-[72px] lg:h-[88px] flex items-center justify-center border-b border-tz-linen shrink-0 px-4`}
          style={{ animation: "tzNavIn .5s cubic-bezier(.2,.8,.2,1) both" }}
        >
          {/*
            El rail solo existe en `lg`: el cajón móvil conserva el lockup
            completo aunque el estado plegado esté activo, de ahí las dos
            variantes con sus breakpoints en vez de un ternario a secas.
          */}
          {logoUrl ? (
            <>
              {rail && (
                // Isotipo: el mismo lockup recortado a sus primeros 26 px (las
                // dos medias lunas). Ver docs/BRANDING.md §1.
                <span className="hidden lg:block w-[26px] h-[34px] overflow-hidden shrink-0">
                  <BrandLogo
                    light={logoUrl}
                    dark={logoUrlDark}
                    alt={brandName ?? "Logo"}
                    className="h-[34px] w-[202px] max-w-none object-cover object-left"
                  />
                </span>
              )}
              <BrandLogo
                light={logoUrl}
                dark={logoUrlDark}
                alt={brandName ?? "Logo"}
                className={`h-[26px] lg:h-[34px] w-auto max-w-[190px] object-contain ${rail ? "lg:hidden" : ""}`}
              />
            </>
          ) : (
            <>
              {rail && (
                // Isotipo del wordmark: su "A" con el punto de oro. El lockup
                // completo no cabe en 76 px. Ver docs/BRANDING.md §1.
                <span
                  role="img"
                  aria-label={brandName ?? "Apta"}
                  className="hidden lg:flex items-end gap-[3px] h-[34px] shrink-0 font-display font-extrabold text-[28px] leading-[34px] tracking-[-.02em] text-tz-black"
                >
                  <span aria-hidden="true">A</span>
                  <span className="w-1.5 h-1.5 rounded-full mb-[7px]" style={{ background: GOLD_DOT }} aria-hidden="true" />
                </span>
              )}
              {/* El envoltorio lleva el `lg:hidden`: `.apta-logo` fija su
                  `display` fuera de las capas de Tailwind y ganaría a la
                  utilidad si se pusiera en el propio componente. */}
              <span className={rail ? "lg:hidden" : undefined}>
                <AptaLogo variant="dark" className="text-2xl lg:text-3xl" />
              </span>
            </>
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="absolute right-2 top-1/2 -translate-y-1/2 lg:hidden flex items-center justify-center w-11 h-11 rounded-[10px] text-text-2 transition-colors duration-[180ms] hover:bg-tz-linen/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 pt-[18px] px-3 pb-3.5 flex flex-col gap-5 overflow-y-auto overflow-x-hidden">
          {groups.map((group, gi) => {
            const sectionOpen = isSectionOpen(group.section);
            const holdsActive = group.items.some((i) => i.href === activeHref);
            return (
              <div key={group.section} className="flex flex-col gap-0.5">
                {!flat &&
                  (rail ? (
                    // Sin cabeceras en 76 px: un filete de 28 px separa grupos.
                    gi > 0 ? <span className="hidden lg:block w-7 h-px bg-tz-linen mx-auto mb-1.5" aria-hidden="true" /> : null
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSection(group.section)}
                      aria-expanded={sectionOpen}
                      className="flex items-center gap-2.5 px-3 pb-2.5 select-none cursor-pointer text-left"
                      style={{ animation: `tzNavIn .5s ${(gi * 0.04).toFixed(2)}s both` }}
                    >
                      <span className="font-display font-bold text-[10.5px] tracking-[.18em] uppercase text-muted whitespace-nowrap shrink-0">
                        {group.section}
                      </span>
                      {/* Punto oro: la sección está plegada y esconde el item activo. */}
                      {!sectionOpen && holdsActive && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD_DOT }} aria-hidden="true" />
                      )}
                      <span className="flex-1 h-px bg-tz-linen" aria-hidden="true" />
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-brand-faint)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className={`shrink-0 transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] ${
                          sectionOpen ? "" : "rotate-180"
                        }`}
                      >
                        <path d="M6 15l6-6 6 6" />
                      </svg>
                    </button>
                  ))}

                {sectionOpen &&
                  group.items.map((item, i) => {
                    const active = item.href === activeHref;
                    return (
                      <div
                        key={item.href}
                        className={rail ? "lg:flex lg:justify-center" : undefined}
                        style={{ animation: `tzNavIn .45s ${(0.1 + i * 0.04).toFixed(2)}s both` }}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onMouseEnter={showTip(item.label)}
                          onMouseLeave={hideTip}
                          onFocus={showTip(item.label)}
                          onBlur={hideTip}
                          className={`group relative flex items-center rounded-xl text-[15px] lg:text-sm min-h-12 lg:min-h-[42px] ${
                            rail
                              ? "gap-3.5 px-3.5 py-3 lg:gap-0 lg:justify-center lg:w-11 lg:h-10 lg:min-h-0 lg:px-0 lg:py-2.5"
                              : "gap-3.5 lg:gap-3 px-3.5 lg:px-3 py-3 lg:py-2.5"
                          } ${
                            active
                              ? "bg-tz-black text-tz-bone font-bold"
                              : "bg-transparent text-text-2 font-medium hover:bg-tz-linen/55 hover:text-tz-black"
                          }`}
                          // El hover es instantáneo a propósito: el cambio de
                          // estado lo cuenta la animación de activación.
                          style={active ? { animation: "tzPillIn .34s var(--ease-out-soft) both" } : undefined}
                        >
                          {active && (
                            <>
                              <span
                                className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-[3px]"
                                style={{ background: GOLD_BAR, animation: "tzBarGrow .42s var(--ease-spring) .06s both" }}
                                aria-hidden="true"
                              />
                              {/*
                                El destello es una capa propia con su
                                `overflow:hidden`: ponerlo en la fila entera
                                recortaría el tooltip del rail.
                              */}
                              <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true">
                                <span
                                  className="absolute inset-y-0 left-0 w-[42%]"
                                  style={{
                                    background: "linear-gradient(105deg,transparent,rgba(200,171,114,.42) 50%,transparent)",
                                    animation: "tzPillSheen .85s var(--ease-out-soft) .1s both",
                                  }}
                                />
                              </span>
                            </>
                          )}
                          <NavItemIcon item={item} active={active} />
                          <span
                            className={rail ? "lg:sr-only flex-1" : "flex-1"}
                            style={active ? { animation: "tzLabelIn .34s var(--ease-out-soft) .04s both" } : undefined}
                          >
                            {item.label}
                          </span>
                          {item.meta && (
                            <span className={`text-[11px] font-bold tracking-[.06em] text-muted ${rail ? "lg:hidden" : ""}`}>
                              {item.meta}
                            </span>
                          )}
                          {!!item.badge && (
                            <span
                              className={`min-w-[20px] h-5 px-1.5 rounded-full bg-critical text-white text-[11px] font-bold flex items-center justify-center ${
                                rail ? "lg:hidden" : ""
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {member?.bono && <BonoCard bono={member.bono} />}
        </nav>

        {tip && (
          <span
            role="tooltip"
            className="hidden lg:block absolute left-[88px] -translate-y-1/2 z-10 whitespace-nowrap rounded-lg bg-tz-black text-tz-bone text-[11.5px] font-semibold px-2.5 py-1.5 pointer-events-none"
            style={{ top: tip.top, boxShadow: "0 10px 24px -12px rgba(29,29,28,.6)" }}
          >
            {tip.label}
          </span>
        )}

        {member ? (
          <div
            className="border-t border-tz-linen px-4 py-3.5 shrink-0"
            style={{ animation: "tzNavIn .5s .5s both" }}
          >
            <AccountMenuTrigger id="sidebar-account" placement="up">
              {() => (
                <div className="flex items-center gap-[11px] p-2 rounded-xl transition-colors duration-150 hover:bg-tz-linen/50">
                  <div className="w-9 h-9 rounded-full bg-tz-black text-tz-bone flex items-center justify-center font-display font-extrabold text-[13px] shrink-0">
                    {initials(member.name)}
                  </div>
                  <div className="flex-1 min-w-0 leading-tight text-left">
                    <div className="text-[13px] font-bold text-tz-black truncate">{member.name}</div>
                    <div className="text-[11.5px] text-muted truncate">
                      {member.roleLabel} · {member.centerName}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-muted)" strokeWidth="2.2" strokeLinecap="round" className="shrink-0">
                    <path d="M7 15l5-5 5 5" />
                  </svg>
                </div>
              )}
            </AccountMenuTrigger>
          </div>
        ) : (
          <div
            className="px-3.5 py-3 border-t border-tz-linen shrink-0 flex items-center gap-2"
            style={{ animation: "tzNavIn .5s .5s both" }}
          >
            <span className={`flex-1 text-xs text-muted tracking-[.04em] truncate ${rail ? "lg:hidden" : ""}`}>
              <span className="text-tz-black font-bold">TZ</span> · {footerLabel}
            </span>
            <button
              type="button"
              onClick={toggleRail}
              aria-label={rail ? "Desplegar menú" : "Plegar menú"}
              aria-pressed={rail}
              className={`hidden lg:flex items-center justify-center w-8 h-8 shrink-0 rounded-[10px] border border-tz-linen text-text-2 transition-colors duration-[180ms] hover:bg-tz-linen/60 hover:text-tz-black ${
                rail ? "lg:mx-auto" : ""
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)] ${rail ? "rotate-180" : ""}`}
              >
                <path d="M13 8l-4 4 4 4" />
                <path d="M18 8l-4 4 4 4" />
              </svg>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

/** 2·π·r con r = 40, el radio del anillo del bono. */
const RING_CIRCUMFERENCE = 2 * Math.PI * 40;

function BonoCard({ bono }: { bono: NonNullable<MemberBonoCard> }) {
  const pct =
    !bono.recurring && bono.sessionsIncluded
      ? Math.max(0, Math.min(100, ((bono.sessionsRemaining ?? 0) / bono.sessionsIncluded) * 100))
      : 0;

  return (
    <div className="mt-auto p-4 rounded-2xl bg-white border border-tz-linen">
      <div className="flex items-center gap-[7px] text-[10.5px] font-bold tracking-[.14em] uppercase text-gold">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD_DOT }} />
        Tu bono
      </div>
      <div className="text-[13.5px] font-bold text-tz-black mt-2 leading-[1.35]">
        {bono.serviceLabel}
        <br />
        {bono.planName}
      </div>
      {bono.recurring ? (
        <div className="text-[11.5px] text-muted mt-3">
          Cuota mensual{bono.nextChargeLabel ? ` · próximo cobro ${bono.nextChargeLabel}` : ""}
        </div>
      ) : (
        <>
          {/*
            Anillo en vez de barra: el bono es una reserva que se agota, y un
            círculo que se vacía lo cuenta mejor que una línea que se llena. Se
            anima `stroke-dashoffset` —no una geometría— así que la transición
            no provoca layout. Al gastar una sesión, baja una muesca en la misma
            transición.
          */}
          <div className="flex items-center gap-3.5 mt-3">
            <div className="relative w-[76px] h-[76px] shrink-0">
              <svg width="76" height="76" viewBox="0 0 96 96" aria-hidden="true" className="-rotate-90">
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--color-tz-sand)" strokeWidth="10" />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="var(--color-apta-gold)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - pct / 100)}
                  style={{ transition: "stroke-dashoffset 1s var(--ease-out-soft)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display font-extrabold text-[19px] leading-none text-tz-black tz-nums">
                  {bono.sessionsRemaining ?? 0}
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-[.08em] text-muted mt-0.5">
                  de {bono.sessionsIncluded ?? 0}
                </span>
              </div>
            </div>
            <div className="text-[11.5px] text-muted leading-[1.45] min-w-0">
              Sesiones que <b className="text-tz-black">te quedan</b> en este bono
            </div>
          </div>
        </>
      )}
      <Link
        href="/portal/membresia?renovar=1"
        className="mt-3.5 block rounded-[10px] bg-tz-black text-tz-bone text-[12.5px] font-extrabold tracking-[.03em] uppercase text-center py-[11px] px-3.5 transition-colors duration-150 hover:bg-brand-ink-soft"
      >
        Renovar bono →
      </Link>
    </div>
  );
}
