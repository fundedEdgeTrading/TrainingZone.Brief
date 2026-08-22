"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import AptaLogo from "@/components/apta-logo";
import { groupNav, type NavItem } from "@/lib/rbac";
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

/**
 * Punto de 7×7 px del item de navegación. Mientras el `<Link>` que lo contiene
 * está pendiente pasa a oro y pulsa con `tzLiveDot`: el usuario ve *qué* item
 * ha pulsado mientras la ruta carga. `useLinkStatus` exige vivir dentro del
 * `<Link>`, de ahí el componente aparte.
 */
function NavDot({ activeClass }: { activeClass: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`w-[7px] h-[7px] rounded-[2px] shrink-0 transition-colors duration-[180ms] ${
        pending ? "bg-apta-gold" : activeClass
      }`}
      style={pending ? { animation: "tzLiveDot 1.1s ease-in-out infinite" } : undefined}
    />
  );
}

export default function Sidebar({
  nav,
  footerLabel,
  logoUrl,
  brandName,
  member,
}: {
  nav: NavItem[];
  footerLabel: string;
  logoUrl?: string | null;
  brandName?: string;
  /** Presente solo para el rol MEMBER (rediseño NavBar premium 1b). Otros roles conservan el pie de texto plano. */
  member?: MemberSidebarData;
}) {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();
  const activeHref = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))?.href;
  const groups = groupNav(nav);
  const premium = !!member;

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
        className={`fixed inset-y-0 left-0 z-50 ${premium ? "w-[272px]" : "w-64"} bg-tz-sand text-text-2 border-r border-tz-linen flex flex-col h-dvh transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shrink-0 lg:transition-none`}
      >
        <div
          className={`relative h-[72px] lg:h-[88px] flex items-center border-b border-tz-linen shrink-0 ${
            premium ? "justify-start px-4 lg:px-6" : "justify-center px-4"
          }`}
          style={{ animation: "tzNavIn .5s cubic-bezier(.2,.8,.2,1) both" }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización/centro (URL arbitraria), no un asset estático
            <img
              src={logoUrl}
              alt={brandName ?? "Logo"}
              className={`w-auto max-w-[190px] object-contain block ${premium ? "h-[26px] lg:h-[30px]" : "h-[26px] lg:h-[34px]"}`}
            />
          ) : (
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

        {premium ? (
          <nav className="flex-1 px-3.5 pt-[22px] pb-3.5 flex flex-col gap-[22px] overflow-y-auto">
            {groups.map((group, gi) => (
              <div key={group.section} className="flex flex-col gap-0.5">
                <div
                  className="flex items-center gap-2.5 px-3 pb-2.5"
                  style={{ animation: `tzNavIn .5s ${(gi * 0.04).toFixed(2)}s both` }}
                >
                  <span className="font-display font-bold text-[10.5px] tracking-[.18em] uppercase text-muted whitespace-nowrap">
                    {group.section}
                  </span>
                  <span className="flex-1 h-px bg-tz-linen" />
                </div>
                {group.items.map((item, i) => {
                  const active = item.href === activeHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition-[background-color,color] duration-[180ms] ${
                        active
                          ? "bg-tz-black text-tz-bone font-bold"
                          : "bg-transparent text-text-2 font-medium hover:bg-tz-linen/50"
                      }`}
                      style={{ animation: `tzNavIn .45s ${(0.1 + i * 0.04).toFixed(2)}s both` }}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-[3px]"
                          style={{ background: "linear-gradient(180deg,#e3cfa2,#b58e52)" }}
                        />
                      )}
                      <NavDot activeClass={active ? "bg-apta-gold" : "bg-faint"} />
                      <span className="flex-1">{item.label}</span>
                      {item.meta && <span className="text-[11px] font-bold tracking-[.06em] text-muted">{item.meta}</span>}
                      {!!item.badge && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-critical text-white text-[11px] font-extrabold flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}

            {member?.bono && <BonoCard bono={member.bono} />}
          </nav>
        ) : (
          <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
            {groups.map((group, gi) => (
              <div key={group.section}>
                <div
                  className="px-3.5 pt-4 pb-1.5 font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted"
                  style={{ animation: `tzNavIn .5s ${(gi * 0.04).toFixed(2)}s both` }}
                >
                  {group.section}
                </div>
                {group.items.map((item, i) => {
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
                      style={{ animation: `tzNavIn .45s ${(0.1 + i * 0.04).toFixed(2)}s both` }}
                    >
                      <NavDot activeClass={active ? "bg-tz-bone" : "bg-faint"} />
                      <span className="flex-1">{item.label}</span>
                      {!!item.badge && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-critical text-white text-[11px] font-extrabold flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8574" strokeWidth="2.2" strokeLinecap="round" className="shrink-0">
                    <path d="M7 15l5-5 5 5" />
                  </svg>
                </div>
              )}
            </AccountMenuTrigger>
          </div>
        ) : (
          <div
            className="px-5 py-4 border-t border-tz-linen text-xs text-muted tracking-[.04em] shrink-0"
            style={{ animation: "tzNavIn .5s .5s both" }}
          >
            <span className="text-tz-black font-bold">TZ</span> · {footerLabel}
          </div>
        )}
      </aside>
    </>
  );
}

function BonoCard({ bono }: { bono: NonNullable<MemberBonoCard> }) {
  const pct =
    !bono.recurring && bono.sessionsIncluded
      ? Math.max(0, Math.min(100, ((bono.sessionsRemaining ?? 0) / bono.sessionsIncluded) * 100))
      : 0;

  return (
    <div className="mt-auto p-4 rounded-2xl bg-white border border-tz-linen">
      <div className="flex items-center gap-[7px] text-[10.5px] font-bold tracking-[.14em] uppercase text-gold">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
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
          <div className="h-1.5 rounded-full bg-tz-sand overflow-hidden mt-3">
            <div
              className="h-full rounded-full origin-left [animation:tzGrow_.8s_ease-out_both]"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#4b5a22,#c8ab72)" }}
            />
          </div>
          <div className="text-[11.5px] text-muted mt-2">
            Te quedan <b className="text-tz-black">
              {bono.sessionsRemaining ?? 0} de {bono.sessionsIncluded ?? 0}
            </b>{" "}
            sesiones
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
