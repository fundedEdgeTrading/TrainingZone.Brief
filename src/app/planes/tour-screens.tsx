// Pantallas de la demostración animada de la landing (`tour-stage.tsx`).
//
// Son una RECREACIÓN de las pantallas reales del producto con datos de
// demostración, no las pantallas reales: estas viven en `src/app/(app)/*`, son
// Server Components y leen de Prisma con sesión, permisos y centro. Nada de eso
// existe en `/planes`, que es pública y anónima, así que aquí se pinta la misma
// interfaz con datos fijos. Cada bloque cita el fichero del que sale su forma.
//
// Los colores, radios y tipografía salen de los tokens de `globals.css` vía
// clases de Tailwind; la geometría (posiciones, altos, tamaños de fuente
// literales) va en línea porque la composición se mide en píxeles sobre una
// ventana fija de 1440x900 que luego escala la cámara.
import AptaLogo from "@/components/apta-logo";
import NavIconSvg from "@/components/nav-icons";
import { Badge } from "@/components/ui/badge";
import { DAY_ABBR, ROW_HEIGHT, TRAINER_PALETTE } from "@/app/(app)/agenda/agenda-utils";
import { MESOCYCLE_STEPS } from "@/components/ui/brand-loader";
import { SERIES } from "@/lib/chart-colors";
import type { NavIcon } from "@/lib/rbac";

/** Medidas del armazón, iguales que en `src/app/(app)/layout.tsx`. */
export const WORLD_W = 1440;
export const WORLD_H = 900;
const SIDEBAR_W = 256;
const HEADER_H = 88;

/** Horas que pinta la agenda de la demo: el día operativo, no las 6-22 reales. */
const START_HOUR = 7;
const END_HOUR = 16;

const nf = (n: number) => Math.round(n).toLocaleString("es-ES");
const eur = (n: number) => `${nf(n)} €`;

/* ── armazón: sidebar + cabecera ─────────────────────────────────────── */

type NavGroup = { section: string; collapsed?: boolean; items: [string, NavIcon, string?][] };

/** Menú de dirección (`src/lib/rbac.ts` → `navFor`). */
const OWNER_NAV: NavGroup[] = [
  { section: "Vista general", items: [["Panel de control", "panel"], ["Feedback", "feedback"]] },
  { section: "Día a día", items: [["Socios", "socios"], ["Agenda", "agenda"], ["Cobros", "cobros"]] },
  { section: "Crecimiento", items: [["Leads", "leads"], ["Anuncios", "anuncios"]] },
  { section: "Salud y aptitud", items: [["Reglas de aptitud", "reglas"], ["Rangos de composición", "rangos"]] },
  {
    section: "Administración",
    collapsed: true,
    items: [["Organización", "organizacion"], ["RRHH", "rrhh"], ["Puesta en marcha", "puestaEnMarcha"], ["Auditoría", "auditoria"]],
  },
];

/** Menú del socio (`navFor` con rol MEMBER). */
const MEMBER_NAV: NavGroup[] = [
  { section: "Entrenar", items: [["Mi actividad", "actividad"], ["Reservar clase", "reservar", "MAÑ 19:00"], ["Mi evolución", "evolucion"]] },
  { section: "Membresía", items: [["Mi membresía", "membresia"]] },
];

function SectionHead({ label, collapsed }: { label: string; collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" style={{ padding: "0 12px 10px" }}>
      <span className="font-bold uppercase text-muted whitespace-nowrap" style={{ fontSize: 10.5, letterSpacing: ".18em" }}>
        {label}
      </span>
      <span className="flex-1 h-px bg-tz-linen" />
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-faint"
        style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
      >
        <path d="M6 15l6-6 6 6" />
      </svg>
    </div>
  );
}

function NavRow({ label, icon, meta, active }: { label: string; icon: NavIcon; meta?: string; active: boolean }) {
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden ${active ? "bg-tz-black text-tz-bone font-bold" : "text-text-2 font-medium"}`}
      style={{ borderRadius: 12, padding: "10px 12px", minHeight: 42, fontSize: 14 }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0"
          style={{ top: 10, bottom: 10, width: 3, borderRadius: "0 3px 3px 0", background: "linear-gradient(180deg,#e3cfa2,#b58e52)" }}
        />
      )}
      <NavIconSvg name={icon} className={active ? "text-apta-gold" : "text-text-2"} />
      <span className="flex-1">{label}</span>
      {meta && (
        <span className="font-bold text-muted" style={{ fontSize: 11, letterSpacing: ".06em" }}>
          {meta}
        </span>
      )}
    </div>
  );
}

/** Anillo del bono (`src/app/(app)/sidebar.tsx` → `BonoCard`). */
function BonoCard({ t }: { t: number }) {
  const remaining = 8;
  const total = 12;
  const circ = 2 * Math.PI * 40;
  const pct = (remaining / total) * t;
  return (
    <div className="mt-auto bg-brand-card border border-tz-linen rounded-card" style={{ padding: 16 }}>
      <div className="flex items-center gap-1.5 font-bold uppercase text-gold" style={{ fontSize: 10.5, letterSpacing: ".14em" }}>
        <span className="rounded-full" style={{ width: 6, height: 6, background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
        Tu bono
      </div>
      <div className="font-bold text-tz-black" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.35 }}>
        Grupos reducidos
        <br />
        Bono 12 sesiones
      </div>
      <div className="flex items-center" style={{ gap: 14, marginTop: 12 }}>
        <div className="relative shrink-0" style={{ width: 76, height: 76 }}>
          <svg width="76" height="76" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--color-tz-sand)" strokeWidth="10" />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="var(--color-apta-gold)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-extrabold text-tz-black tz-nums" style={{ fontSize: 19, lineHeight: 1 }}>
              {Math.round(remaining * t)}
            </span>
            <span className="font-bold uppercase text-muted" style={{ fontSize: 9.5, letterSpacing: ".08em", marginTop: 2 }}>
              de {total}
            </span>
          </div>
        </div>
        <div className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
          Sesiones que <b className="text-tz-black">te quedan</b> en este bono
        </div>
      </div>
      <div
        className="bg-tz-black text-tz-bone font-extrabold uppercase text-center rounded-control"
        style={{ marginTop: 14, fontSize: 12.5, letterSpacing: ".03em", padding: "11px 14px" }}
      >
        Renovar bono →
      </div>
    </div>
  );
}

function Sidebar({ active, member, bonoT }: { active: string; member: boolean; bonoT: number }) {
  const groups = member ? MEMBER_NAV : OWNER_NAV;
  return (
    <aside className="shrink-0 bg-sidebar border-r border-tz-linen flex flex-col h-full" style={{ width: SIDEBAR_W }}>
      <div className="flex items-center justify-center border-b border-tz-linen shrink-0" style={{ height: HEADER_H }}>
        <AptaLogo variant="dark" className="text-3xl" />
      </div>
      <nav className="flex-1 flex flex-col overflow-hidden" style={{ padding: "18px 12px 14px", gap: 20 }}>
        {groups.map((g) => (
          <div key={g.section} className="flex flex-col" style={{ gap: 2 }}>
            <SectionHead label={g.section} collapsed={g.collapsed} />
            {!g.collapsed &&
              g.items.map(([label, icon, meta]) => (
                <NavRow key={label} label={label} icon={icon} meta={meta} active={label === active} />
              ))}
          </div>
        ))}
        {member && <BonoCard t={bonoT} />}
      </nav>
      {!member && (
        <div className="border-t border-tz-linen flex items-center gap-2 shrink-0" style={{ padding: "12px 14px" }}>
          <span className="flex-1 text-muted" style={{ fontSize: 12, letterSpacing: ".04em" }}>
            <b className="text-tz-black">TZ</b> · MVP F0–F5
          </span>
          <span className="flex items-center justify-center border border-tz-linen rounded-control" style={{ width: 32, height: 32 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-2" aria-hidden="true">
              <path d="M13 8l-4 4 4 4" />
              <path d="M18 8l-4 4 4 4" />
            </svg>
          </span>
        </div>
      )}
    </aside>
  );
}

/** Cabecera (`src/app/(app)/header.tsx` + `user-menu.tsx` + `notification-bell.tsx`). */
function Header({ title, subtitle, user, role, member }: { title: string; subtitle: string; user: string; role: string; member: boolean }) {
  const initials = user
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <header
      className="shrink-0 bg-brand-card border-b border-brand-border flex items-center justify-between gap-3"
      style={{ height: HEADER_H, padding: "0 32px" }}
    >
      <div className="flex items-center min-w-0" style={{ gap: 14 }}>
        <span className="bg-tz-black shrink-0" style={{ width: 6, height: 34, borderRadius: 2 }} />
        <div className="min-w-0">
          <div
            className="font-extrabold uppercase text-brand-text truncate"
            style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-.01em", maxWidth: 420 }}
          >
            {title}
          </div>
          <div className="text-muted truncate" style={{ fontSize: 13, marginTop: 3, maxWidth: 420 }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div className="flex items-center shrink-0" style={{ gap: 16 }}>
        <div className="relative flex items-center justify-center border border-brand-border bg-brand-card rounded-control" style={{ width: 40, height: 40 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            className="absolute bg-critical text-white font-bold rounded-pill flex items-center justify-center"
            style={{ top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px", fontSize: 10 }}
          >
            3
          </span>
        </div>
        {member ? (
          <div className="flex items-center gap-2.5 border border-brand-border rounded-pill" style={{ padding: "5px 14px 5px 6px" }}>
            <div className="rounded-full bg-tz-black text-tz-bone flex items-center justify-center font-extrabold" style={{ width: 30, height: 30, fontSize: 12 }}>
              {initials}
            </div>
            <span className="font-bold text-brand-text" style={{ fontSize: 13 }}>
              {user.split(" ")[0]}
            </span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-muted" aria-hidden="true">
              <path d="M7 10l5 5 5-5" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center" style={{ gap: 16 }}>
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-tz-black text-tz-bone flex items-center justify-center font-extrabold" style={{ width: 38, height: 38, fontSize: 14 }}>
                {initials}
              </div>
              <div style={{ lineHeight: 1.15 }}>
                <div className="font-bold text-brand-text" style={{ fontSize: 13 }}>
                  {user}
                </div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {role}
                </div>
              </div>
            </div>
            <span
              className="flex items-center font-semibold text-muted border border-brand-border bg-brand-card whitespace-nowrap"
              style={{ height: 38, padding: "0 14px", fontSize: 13, borderRadius: 8 }}
            >
              Mi perfil
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

/** La ventana de la app: persiste durante todo el tutorial, solo cambia dentro. */
export function TourShell({
  active,
  title,
  subtitle,
  user,
  role,
  member = false,
  bonoT = 1,
  children,
}: {
  active: string;
  title: string;
  subtitle: string;
  user: string;
  role: string;
  member?: boolean;
  bonoT?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex bg-brand-bg text-brand-text overflow-hidden" style={{ width: WORLD_W, height: WORLD_H }}>
      <Sidebar active={active} member={member} bonoT={bonoT} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} subtitle={subtitle} user={user} role={role} member={member} />
        <main className="flex-1 overflow-hidden" style={{ padding: "28px 32px 48px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── piezas compartidas del panel ────────────────────────────────────── */

const ACCENT_BG: Record<string, string> = { gold: "bg-gold", ink: "bg-tz-black", critical: "bg-critical", muted: "bg-text-2" };
const ACCENT_FG: Record<string, string> = { gold: "text-gold", ink: "text-brand-text", critical: "text-critical", muted: "text-text-2" };
const ACCENT_VAR: Record<string, string> = {
  gold: SERIES.gold,
  ink: SERIES.ink,
  critical: SERIES.critical,
  muted: SERIES.ink2,
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 62 + 2, 20 - ((v - min) / span) * 16] as const);
  const last = pts[pts.length - 1];
  return (
    <svg width="66" height="24" viewBox="0 0 66 24" className="flex-none overflow-visible opacity-85" aria-hidden="true">
      <polyline
        points={pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.6" fill={color} />
    </svg>
  );
}

/** `src/components/kpi-card.tsx`, con la cifra ya contada por el reloj. */
function KpiCard({
  label,
  value,
  delta,
  spark,
  accent = "ink",
  hint,
  size = 27,
}: {
  label: string;
  value: string;
  delta?: { text: string; tone: "good" | "bad" | "flat" };
  spark?: number[];
  accent?: string;
  hint?: string;
  size?: number;
}) {
  const deltaClass =
    delta?.tone === "good" ? "bg-gold-bg text-gold" : delta?.tone === "bad" ? "bg-critical-bg text-critical" : "bg-brand-bg text-muted";
  return (
    <div className="relative overflow-hidden bg-brand-card border border-brand-border" style={{ borderRadius: 16, padding: "15px 16px 13px" }}>
      <span aria-hidden="true" className={`absolute top-0 left-0 h-full ${ACCENT_BG[accent]}`} style={{ width: 3 }} />
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold uppercase text-muted" style={{ fontSize: 10, letterSpacing: ".1em", lineHeight: 1.4 }}>
          {label}
        </div>
        {delta && (
          <span className={`flex-none rounded-pill font-bold tz-nums ${deltaClass}`} style={{ padding: "2px 7px", fontSize: 10.5 }}>
            {delta.text}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between" style={{ gap: 10, marginTop: 10 }}>
        <div className={`font-bold tz-nums whitespace-nowrap ${ACCENT_FG[accent]}`} style={{ fontSize: size, lineHeight: 1, letterSpacing: "-.025em" }}>
          {value}
        </div>
        {spark && <Sparkline values={spark} color={ACCENT_VAR[accent]} />}
      </div>
      <div className="text-brand-muted-2" style={{ fontSize: 11, marginTop: 6, minHeight: 14 }}>
        {hint ?? ""}
      </div>
    </div>
  );
}

/** `src/app/(app)/dashboard/panel-card.tsx`: las cards del panel usan radio 18. */
function PanelCard({
  title,
  meta,
  action,
  footer,
  size = 16,
  children,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-brand-card border border-brand-border h-full" style={{ borderRadius: 18, padding: 22 }}>
      <div className="flex items-start justify-between" style={{ gap: 14, marginBottom: 18 }}>
        <h3 className="font-bold uppercase text-brand-text m-0" style={{ fontSize: size, letterSpacing: ".01em" }}>
          {title}
          {meta && (
            <span className="font-semibold text-muted normal-case" style={{ marginLeft: 8, fontSize: 12, letterSpacing: 0 }}>
              · {meta}
            </span>
          )}
        </h3>
        {action}
      </div>
      <div className="flex-1">{children}</div>
      {footer && (
        <div className="border-t border-tz-sand text-muted" style={{ paddingTop: 14, marginTop: 18, fontSize: 11.5, lineHeight: 1.5 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 font-semibold text-muted whitespace-nowrap" style={{ fontSize: 11 }}>
      <span style={{ width: line ? 14 : 10, height: line ? 2 : 10, borderRadius: line ? 2 : 3, background: color }} />
      {label}
    </span>
  );
}

function ZoneDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center" style={{ gap: 12, marginTop: 14 }}>
      <span style={{ width: 22, height: 2, borderRadius: 2, background: "linear-gradient(90deg,var(--color-apta-gold),var(--color-gold))" }} />
      <span className="font-bold uppercase text-muted" style={{ fontSize: 10.5, letterSpacing: ".18em" }}>
        {label}
      </span>
      <span className="flex-1 h-px bg-brand-border" />
    </div>
  );
}

function BarRow({
  label,
  labelWidth,
  pct,
  color,
  value,
  valueWidth,
  height = 18,
}: {
  label: string;
  labelWidth: number;
  pct: number;
  color: string;
  value: string;
  valueWidth: number;
  height?: number;
}) {
  const radius = "0 7px 7px 0";
  return (
    <div className="flex items-center" style={{ gap: 12, fontSize: 12.5 }}>
      <span className="flex-none font-semibold text-text-2 truncate" style={{ width: labelWidth }}>
        {label}
      </span>
      <div className="flex-1 bg-brand-bg overflow-hidden" style={{ borderRadius: radius, height }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: radius }} />
      </div>
      <span className="flex-none text-right font-bold text-brand-text tz-nums" style={{ width: valueWidth }}>
        {value}
      </span>
    </div>
  );
}

/* ── 02 · panel de control ───────────────────────────────────────────── */

/** Rótulos y orden de `src/lib/dashboard-queries.ts`; cifras de demostración. */
const KPIS = [
  { label: "Ingresos del mes", all: 18420, jota: 8140, fmt: eur, accent: "gold", delta: { text: "+12%", tone: "good" as const }, spark: [12, 13.4, 12.8, 15, 14.2, 16.9, 18.4], hint: "vs. el mes anterior", hintJota: "vs. el mes anterior" },
  { label: "Socios activos", all: 412, jota: 186, fmt: nf, accent: "ink", delta: { text: "+9", tone: "good" as const }, spark: [370, 379, 386, 391, 398, 404, 412], hint: "3 centros", hintJota: "aforo por defecto 6" },
  { label: "Ocupación media", all: 78, jota: 84, fmt: (n: number) => `${Math.round(n)}%`, accent: "ink", delta: { text: "+4 pts", tone: "good" as const }, spark: [69, 71, 70, 74, 75, 77, 78], hint: "objetivo interno 80%", hintJota: "por encima del objetivo" },
  { label: "Sesiones este mes", all: 1284, jota: 561, fmt: nf, accent: "ink", delta: { text: "+6%", tone: "good" as const }, spark: [1080, 1120, 1155, 1190, 1210, 1250, 1284], hint: "reservas confirmadas", hintJota: "reservas confirmadas" },
  { label: "Socios en riesgo de fuga", all: 14, jota: 9, fmt: nf, accent: "critical", delta: { text: "+3", tone: "bad" as const }, spark: [8, 9, 11, 10, 12, 13, 14], hint: "caída vs. su línea base", hintJota: "caída vs. su línea base" },
  { label: "Morosos", all: 9, jota: 5, fmt: nf, accent: "critical", delta: { text: "—", tone: "flat" as const }, hint: "1.140 € pendientes", hintJota: "620 € pendientes" },
  { label: "Congelados", all: 6, jota: 3, fmt: nf, accent: "muted", delta: { text: "—", tone: "flat" as const }, hint: "vuelven en 30 días", hintJota: "vuelven en 30 días" },
  { label: "Altas − bajas del mes", all: 23, jota: 11, fmt: (n: number) => `+${nf(n)}`, accent: "gold", delta: { text: "+7", tone: "good" as const }, spark: [9, 12, 11, 15, 18, 20, 23], hint: "31 altas · 8 bajas", hintJota: "14 altas · 3 bajas" },
];

const REVENUE = [
  { label: "mar", v: 12.9 },
  { label: "abr", v: 13.8 },
  { label: "may", v: 13.1 },
  { label: "jun", v: 15.4 },
  { label: "jul", v: 16.9 },
  { label: "ago", v: 18.4, current: true },
];

function RevenueChart({ t }: { t: number }) {
  const w = 620;
  const h = 236;
  const max = 22;
  const avg = 15.1;
  const pad = { l: 44, r: 4, t: 18, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const barW = 54;
  const step = iw / REVENUE.length;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  return (
    <svg width={w} height={h} className="block overflow-visible" aria-hidden="true">
      {[0, 5.5, 11, 16.5, 22].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-tz-sand)" strokeWidth="1" />
          <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" fontSize="11.5" fontWeight="600" fill="var(--color-muted)">
            {g === 0 ? "0" : nf(g * 1000)}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-brand-border)" strokeWidth="1" />
      <line x1={pad.l} x2={w - pad.r} y1={y(avg)} y2={y(avg)} stroke="var(--color-apta-gold)" strokeWidth="2" strokeDasharray="6 4" />
      {REVENUE.map((r, i) => {
        const barH = (r.v / max) * ih * t;
        const x = pad.l + step * i + (step - barW) / 2;
        return (
          <g key={r.label}>
            <rect x={x} y={y(0) - barH} width={barW} height={Math.max(0, barH)} rx="7" fill={r.current ? SERIES.gold : SERIES.linen} />
            <text
              x={x + barW / 2}
              y={y(0) - barH - 8}
              textAnchor="middle"
              fontSize="12.5"
              fontWeight="700"
              fill={r.current ? SERIES.gold : "var(--color-muted)"}
              opacity={t > 0.8 ? 1 : 0}
            >
              {r.v.toFixed(1).replace(".", ",")}k
            </text>
            <text x={x + barW / 2} y={h - 6} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--color-muted)">
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const CENTERS = ["Todos", "La Jota", "P. del Carmen", "Santander"];

/** Panel de control (`src/app/(app)/dashboard/*`). `t` cuenta las cifras de 0. */
export function TourDashboard({ t, center, highlight }: { t: number; center: string; highlight: boolean }) {
  const jota = center === "La Jota";
  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 1240, gap: 14 }}>
      <div className="flex items-end justify-between" style={{ gap: 16 }}>
        <div>
          <div className="font-bold text-brand-text" style={{ fontSize: 26, lineHeight: 1.1, letterSpacing: "-.02em" }}>
            Buenos días, Sergio
          </div>
          <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Lunes, 24 de agosto · datos actualizados a las 08:42
          </div>
        </div>
        <div className="flex items-end" style={{ gap: 14 }}>
          <div>
            <div className="font-bold uppercase text-muted" style={{ fontSize: 10, letterSpacing: ".1em", marginBottom: 6 }}>
              Centro
            </div>
            <div className="flex bg-brand-card border border-brand-border rounded-pill" style={{ gap: 3, padding: 3 }}>
              {CENTERS.map((o) => (
                <span
                  key={o}
                  className={`rounded-pill font-semibold ${o === center ? "bg-tz-black text-tz-bone" : "text-muted"}`}
                  style={{ padding: "5px 12px", fontSize: 12, boxShadow: o === center && highlight ? "0 0 0 3px rgba(200,171,114,.55)" : undefined }}
                >
                  {o}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="font-bold uppercase text-muted" style={{ fontSize: 10, letterSpacing: ".1em", marginBottom: 6 }}>
              Periodo
            </div>
            <div className="flex bg-brand-card border border-brand-border rounded-pill" style={{ gap: 3, padding: 3 }}>
              {["Mes", "30 d", "Trim.", "Año"].map((o, i) => (
                <span key={o} className={`rounded-pill font-semibold ${i === 0 ? "bg-tz-black text-tz-bone" : "text-muted"}`} style={{ padding: "5px 12px", fontSize: 12 }}>
                  {o}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden bg-tz-black flex items-center" style={{ borderRadius: 18, padding: "20px 24px", gap: 20 }}>
        <span aria-hidden="true" className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: "linear-gradient(180deg,#e3cfa2,#b58e52)" }} />
        <div className="flex-1" style={{ minWidth: 280 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <span className="rounded-full" style={{ width: 6, height: 6, background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
            <span className="font-bold uppercase text-apta-gold whitespace-nowrap" style={{ fontSize: 10, letterSpacing: ".18em" }}>
              Insight del día
            </span>
          </div>
          <p className="m-0 text-tz-bone text-pretty" style={{ fontSize: 15.5, lineHeight: 1.55 }}>
            14 socios han bajado su frecuencia respecto a su propia línea base. La Jota concentra 9 de ellos, y 6 tienen bono con saldo sin
            gastar.
          </p>
        </div>
        <span
          className="flex items-center flex-none border border-brand-border-dark rounded-pill font-semibold text-apta-gold whitespace-nowrap"
          style={{ gap: 7, padding: "9px 16px", fontSize: 12.5 }}
        >
          Ver socios en riesgo
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {KPIS.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={k.fmt((jota ? k.jota : k.all) * t)}
            delta={k.delta}
            spark={k.spark}
            accent={k.accent}
            hint={jota ? k.hintJota : k.hint}
          />
        ))}
      </div>

      <ZoneDivider label="Dinero" />
      <div className="grid" style={{ gridTemplateColumns: "1.45fr 1fr", gap: 14 }}>
        <PanelCard
          title="Ingresos"
          meta="últimos 6 meses"
          action={
            <div className="flex" style={{ gap: 14 }}>
              <LegendSwatch color={SERIES.gold} label="periodo actual" />
              <LegendSwatch color={SERIES.goldSoft} label="media" line />
            </div>
          }
        >
          <RevenueChart t={t} />
        </PanelCard>
        <PanelCard title="Método de pago" footer={<span>El 61% del cobro va por SEPA. Tarjeta es el método que más recibos fallidos deja: 4.</span>}>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {(
              [
                ["Domiciliación", 11.2, SERIES.ink],
                ["Tarjeta", 4.1, SERIES.ink2],
                ["Bizum", 1.8, SERIES.gold],
                ["Efectivo", 0.9, SERIES.goldSoft],
                ["Transferencia", 0.4, SERIES.faint],
              ] as const
            ).map(([label, v, color]) => (
              <BarRow
                key={label}
                label={label}
                labelWidth={104}
                pct={(v / 11.2) * 100 * t}
                color={color}
                value={`${v.toFixed(1).replace(".", ",")}k €`}
                valueWidth={52}
                height={20}
              />
            ))}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

/* ── 03 · socios ─────────────────────────────────────────────────────── */

type MemberRow = {
  first: string;
  last: string;
  email: string;
  center: string;
  state: keyof typeof STATE_LABEL;
  plan: string;
  used: number | null;
  total: number | null;
  lastVisit: string;
  joined: string;
  risk: string | null;
  /** Caída de frecuencia frente a su línea base (`src/lib/retention.ts`). */
  drop?: number;
};

const STATE_LABEL = { ACTIVE: "Activo", DELINQUENT: "Moroso", FROZEN: "Congelado", TRIAL: "Prueba" } as const;
const STATE_TONE = { ACTIVE: "good", DELINQUENT: "critical", FROZEN: "warning", TRIAL: "trial" } as const;

const MEMBERS: MemberRow[] = [
  { first: "Marta", last: "García López", email: "marta.garcia@correo.es", center: "La Jota", state: "ACTIVE", plan: "Grupos reducidos · Bono 12", used: 6, total: 12, lastVisit: "hace 2 días", joined: "12/03/2024", risk: null },
  { first: "Javier", last: "Ruiz Alonso", email: "j.ruiz@correo.es", center: "La Jota", state: "DELINQUENT", plan: "Entrenamiento personal · Bono 8", used: 5, total: 8, lastVisit: "hace 21 días", joined: "04/11/2023", risk: "En fuga", drop: 71 },
  { first: "Lucía", last: "Ferrer Navarro", email: "lucia.ferrer@correo.es", center: "Puerta del Carmen", state: "ACTIVE", plan: "Grupos reducidos · Cuota mensual", used: null, total: null, lastVisit: "hoy", joined: "21/01/2024", risk: null },
  { first: "Andrés", last: "Molina Sáez", email: "a.molina@correo.es", center: "Santander", state: "TRIAL", plan: "Bono de prueba · 2 sesiones", used: 1, total: 2, lastVisit: "ayer", joined: "19/08/2025", risk: null },
  { first: "Nuria", last: "Cano Beltrán", email: "nuria.cano@correo.es", center: "La Jota", state: "FROZEN", plan: "Grupos reducidos · Bono 8", used: 3, total: 8, lastVisit: "hace 34 días", joined: "30/09/2023", risk: null },
  { first: "Pablo", last: "Serrano Ríos", email: "pablo.serrano@correo.es", center: "Puerta del Carmen", state: "ACTIVE", plan: "Entrenamiento personal · Bono 12", used: 9, total: 12, lastVisit: "hace 3 días", joined: "15/02/2024", risk: "En riesgo", drop: 46 },
  { first: "Elena", last: "Vidal Muñoz", email: "elena.vidal@correo.es", center: "La Jota", state: "ACTIVE", plan: "Online · Cuota mensual", used: null, total: null, lastVisit: "hace 5 días", joined: "07/05/2024", risk: null },
  { first: "Sergio", last: "Ibáñez Lara", email: "s.ibanez@correo.es", center: "Santander", state: "DELINQUENT", plan: "Grupos reducidos · Bono 12", used: 11, total: 12, lastVisit: "hace 17 días", joined: "11/07/2023", risk: "En fuga", drop: 71 },
];

const STATE_COUNTS: [string, number][] = [
  ["Activo", 318],
  ["Moroso", 9],
  ["Congelado", 6],
  ["Prueba", 14],
  ["Prospecto", 31],
  ["Baja", 34],
];

const TH = "text-left whitespace-nowrap font-bold uppercase text-muted";
const TH_STYLE: React.CSSProperties = { padding: "12px 20px", fontSize: 11, letterSpacing: ".08em" };
const TD_STYLE: React.CSSProperties = { padding: "10px 20px", verticalAlign: "middle" };

/** Socios (`members/page.tsx` + `ui/data-table.tsx` + `ui/column-filter.tsx`). */
export function TourSocios({ menu, picked }: { menu: number; picked: boolean }) {
  const rows = picked ? MEMBERS.filter((m) => m.state === "DELINQUENT") : MEMBERS;
  return (
    <div className="relative mx-auto flex flex-col" style={{ maxWidth: 1240, gap: 16 }}>
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <p className="m-0 text-muted" style={{ fontSize: 14, maxWidth: 640 }}>
          Filtra desde la cabecera de cada columna: los cambios se aplican al instante.
        </p>
        <div className="flex items-center gap-2">
          <span className="font-semibold rounded-control bg-brand-card border border-brand-border text-brand-text whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 14 }}>
            Importar CSV
          </span>
          <span className="font-semibold rounded-control bg-tz-black text-tz-bone whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 14 }}>
            + Nuevo socio
          </span>
        </div>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-card overflow-hidden">
        <div className="flex items-center border-b border-tz-sand" style={{ gap: 12, padding: "11px 20px" }}>
          <div className="flex items-center gap-2 flex-1 bg-brand-bg border border-brand-border rounded-pill" style={{ maxWidth: 320, padding: "7px 14px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-muted" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.3-4.3" />
            </svg>
            <span className="text-faint" style={{ fontSize: 12.5 }}>
              Buscar nombre o email…
            </span>
          </div>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            <b className="text-brand-text">{rows.length}</b> {rows.length === 1 ? "socio" : "socios"}
            {picked ? " · filtrado por estado" : ""}
          </span>
          <span className="flex-1" />
          {picked && <Badge tone="critical">Estado: Moroso</Badge>}
        </div>

        <table className="w-full border-collapse" style={{ fontSize: 14 }}>
          <thead className="bg-tz-bone">
            <tr>
              <th className={TH} style={TH_STYLE}>Socio</th>
              <th className={TH} style={TH_STYLE}>Centro</th>
              <th className={`${TH} relative`} style={{ ...TH_STYLE, width: 134 }}>
                <span className={`inline-flex items-center gap-1.5 ${picked ? "text-brand-text" : "text-muted"}`}>
                  Estado
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 6h16M7 12h10M10 18h4" />
                  </svg>
                </span>
                {picked && (
                  <span aria-hidden="true" className="absolute bottom-0" style={{ left: 20, right: 20, height: 2, borderRadius: "2px 2px 0 0", background: "linear-gradient(180deg,#e3cfa2,#b58e52)" }} />
                )}
              </th>
              <th className={TH} style={TH_STYLE}>Plan actual</th>
              <th className={TH} style={{ ...TH_STYLE, width: 118 }}>Bono usado</th>
              <th className={TH} style={{ ...TH_STYLE, width: 128 }}>Última visita</th>
              <th className={TH} style={{ ...TH_STYLE, width: 104 }}>Alta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const stale = m.risk !== null || /1[4-9]|2\d|3\d/.test(m.lastVisit);
              const pct = m.used !== null && m.total !== null ? Math.round((m.used / m.total) * 100) : 100;
              const low = m.used !== null && m.total !== null && m.total - m.used <= 2;
              return (
                <tr key={m.email} className="border-t border-tz-sand">
                  <td style={TD_STYLE}>
                    <div className="flex items-center" style={{ gap: 12 }}>
                      <span className="rounded-full bg-tz-sand text-text-2 font-bold flex items-center justify-center shrink-0" style={{ width: 32, height: 32, fontSize: 11.5 }}>
                        {m.first[0]}
                        {m.last[0]}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-brand-text truncate" style={{ fontSize: 13.5, maxWidth: 200 }}>
                          {m.first} {m.last}
                        </span>
                        <span className="block text-faint truncate" style={{ fontSize: 11.5, maxWidth: 200 }}>
                          {m.email}
                        </span>
                      </span>
                      {m.risk && <Badge tone="critical">{m.risk}</Badge>}
                    </div>
                  </td>
                  <td className="text-text-2" style={{ ...TD_STYLE, fontSize: 13 }}>
                    <span className="block truncate" style={{ maxWidth: 170 }}>{m.center}</span>
                  </td>
                  <td style={TD_STYLE}>
                    <Badge tone={STATE_TONE[m.state]}>{STATE_LABEL[m.state]}</Badge>
                  </td>
                  <td className="text-text-2" style={{ ...TD_STYLE, fontSize: 13 }}>
                    <span className="block truncate" style={{ maxWidth: 190 }}>{m.plan}</span>
                  </td>
                  <td style={TD_STYLE}>
                    <span className="flex flex-col" style={{ gap: 5 }}>
                      <span className={`font-semibold whitespace-nowrap ${m.used === null ? "text-faint" : low ? "text-critical" : "text-brand-text"}`} style={{ fontSize: 12.5 }}>
                        {m.used === null ? "Ilimitado" : `${m.used} / ${m.total}`}
                      </span>
                      <span className="block rounded-pill bg-tz-sand overflow-hidden" style={{ height: 4, width: 64 }}>
                        <span className={`block h-full rounded-pill ${m.used === null ? "bg-brand-border" : low ? "bg-critical" : "bg-tz-black"}`} style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </td>
                  <td style={TD_STYLE}>
                    <span className="flex flex-col" style={{ gap: 3 }}>
                      <span className={`whitespace-nowrap ${stale ? "font-semibold text-critical" : "text-text-2"}`} style={{ fontSize: 13 }}>
                        {m.lastVisit}
                      </span>
                      {m.risk && (
                        <span className="font-semibold text-critical whitespace-nowrap" style={{ fontSize: 11 }}>
                          -{m.drop}% vs. su ritmo
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-muted whitespace-nowrap" style={{ ...TD_STYLE, fontSize: 13 }}>
                    {m.joined}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu > 0 && (
        <div
          className="absolute bg-brand-card border border-brand-border"
          style={{
            left: 445,
            top: 141,
            width: 252,
            zIndex: 5,
            borderRadius: 14,
            boxShadow: "0 24px 48px -18px rgba(29,29,28,.45)",
            padding: 8,
            opacity: menu,
            transform: `translateY(${(1 - menu) * -6}px)`,
          }}
        >
          <div className="font-bold uppercase text-muted" style={{ fontSize: 10, letterSpacing: ".1em", padding: "6px 10px 8px" }}>
            Estado
          </div>
          {STATE_COUNTS.map(([label, count]) => {
            const on = picked && label === "Moroso";
            return (
              <div key={label} className={`flex items-center ${on ? "bg-tz-bone" : ""}`} style={{ gap: 10, padding: "7px 10px", borderRadius: 9 }}>
                <span className={`flex items-center justify-center ${on ? "bg-tz-black border-tz-black" : "bg-brand-card border-brand-border"}`} style={{ width: 15, height: 15, borderRadius: 4, borderWidth: 1.5, borderStyle: "solid" }}>
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-tz-bone)" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 font-medium text-brand-text" style={{ fontSize: 13 }}>
                  {label}
                </span>
                <span className="text-faint tz-nums" style={{ fontSize: 11.5 }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 04 · agenda ─────────────────────────────────────────────────────── */

const SESSIONS = [
  { day: 0, start: 480, end: 540, title: "WOD mañana", trainer: 0, cap: 6, booked: 5 },
  { day: 0, start: 600, end: 660, title: "EP · Marta G.", trainer: 1, cap: 1, booked: 1 },
  { day: 0, start: 780, end: 840, title: "Funcional", trainer: 2, cap: 6, booked: 4 },
  { day: 1, start: 540, end: 600, title: "Grupo reducido", trainer: 0, cap: 6, booked: 6 },
  { day: 1, start: 720, end: 780, title: "EP · Pablo S.", trainer: 3, cap: 1, booked: 1 },
  { day: 1, start: 840, end: 900, title: "Movilidad", trainer: 4, cap: 8, booked: 3 },
  { day: 2, start: 480, end: 540, title: "WOD mañana", trainer: 0, cap: 6, booked: 5 },
  { day: 2, start: 660, end: 720, title: "Valoración inicial", trainer: 2, cap: 1, booked: 1 },
  { day: 3, start: 540, end: 600, title: "Grupo reducido", trainer: 1, cap: 6, booked: 5 },
  { day: 3, start: 780, end: 855, title: "Fuerza", trainer: 3, cap: 6, booked: 2 },
  { day: 4, start: 480, end: 540, title: "WOD mañana", trainer: 0, cap: 6, booked: 6 },
  { day: 4, start: 600, end: 660, title: "EP · Elena V.", trainer: 1, cap: 1, booked: 1 },
  { day: 4, start: 840, end: 900, title: "Metcon", trainer: 2, cap: 8, booked: 7 },
  { day: 5, start: 600, end: 660, title: "Open box", trainer: 4, cap: 10, booked: 6 },
];

/** Aforo: ámbar cuando queda una plaza, rojizo cuando está lleno (agenda). */
const CAPACITY_LAST = "#f0b357";
const CAPACITY_FULL = "#e08a6f";

/** Agenda semanal (`src/app/(app)/agenda/*`). `drag` mueve la 1ª sesión. */
export function TourAgenda({ drag }: { drag: number }) {
  const w = 1120;
  const h = 640;
  const gutter = 56;
  const colW = (w - gutter) / 7;
  const hours: number[] = [];
  for (let hr = START_HOUR; hr <= END_HOUR; hr++) hours.push(hr);
  const top = (min: number) => ((min - START_HOUR * 60) / 60) * ROW_HEIGHT;

  return (
    <div className="bg-brand-card border border-brand-border rounded-card overflow-hidden flex flex-col" style={{ height: h }}>
      <div className="flex items-center border-b border-brand-border" style={{ gap: 12, padding: "14px 18px" }}>
        <span className="flex" style={{ gap: 4 }}>
          {["‹", "›"].map((a) => (
            <span key={a} className="flex items-center justify-center border border-brand-border text-text-2" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 15 }}>
              {a}
            </span>
          ))}
        </span>
        <span className="font-bold uppercase" style={{ fontSize: 15, letterSpacing: ".01em" }}>
          24 – 30 de Agosto
        </span>
        <span className="rounded-pill border border-brand-border font-semibold text-text-2 whitespace-nowrap" style={{ padding: "5px 12px", fontSize: 12 }}>
          Hoy
        </span>
        <span className="flex-1" />
        <span className="flex bg-brand-bg rounded-pill" style={{ gap: 3, padding: 3 }}>
          {["La Jota", "P. del Carmen", "Santander"].map((o, i) => (
            <span key={o} className={`rounded-pill font-semibold ${i === 0 ? "bg-tz-black text-tz-bone" : "text-muted"}`} style={{ padding: "5px 12px", fontSize: 12 }}>
              {o}
            </span>
          ))}
        </span>
        <span className="rounded-control bg-tz-black text-tz-bone font-semibold whitespace-nowrap" style={{ padding: "7px 14px", fontSize: 13 }}>
          + Nueva sesión
        </span>
      </div>

      <div className="flex border-b border-brand-border bg-surface-soft">
        <div className="shrink-0" style={{ width: gutter }} />
        {DAY_ABBR.map((d, i) => (
          <div key={d} className="text-center border-l border-tz-sand" style={{ width: colW, padding: "8px 0" }}>
            <div className={`font-bold ${i === 0 ? "text-brand-text" : "text-muted"}`} style={{ fontSize: 10.5, letterSpacing: ".1em" }}>
              {d}
            </div>
            <div
              className={`font-bold rounded-full ${i === 0 ? "bg-tz-black text-white" : "text-brand-text"}`}
              style={{ fontSize: 17, width: 28, height: 28, lineHeight: "28px", margin: "3px auto 0" }}
            >
              {24 + i}
            </div>
          </div>
        ))}
      </div>

      <div className="relative flex-1 flex overflow-hidden">
        <div className="shrink-0" style={{ width: gutter }}>
          {hours.map((hr) => (
            <div key={hr} className="relative" style={{ height: ROW_HEIGHT }}>
              <span className="absolute font-semibold text-faint tz-nums" style={{ right: 8, top: -7, fontSize: 11 }}>
                {String(hr).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex-1">
          {hours.map((hr, i) => (
            <div key={hr} className="absolute left-0 right-0 bg-tz-sand" style={{ top: i * ROW_HEIGHT, height: 1 }} />
          ))}
          {DAY_ABBR.map((d, i) => (
            <div key={d} className="absolute top-0 bottom-0 bg-tz-sand" style={{ left: colW * i, width: 1 }} />
          ))}
          {SESSIONS.map((s, i) => {
            const dragged = i === 0;
            const dy = dragged ? drag * ROW_HEIGHT * 3 : 0;
            const dx = dragged ? drag * colW * 2 : 0;
            const full = s.booked >= s.cap;
            const last = !full && s.cap - s.booked <= 1;
            const moving = dragged && drag > 0.02 && drag < 0.98;
            return (
              <div
                key={`${s.day}-${s.start}-${s.title}`}
                className="absolute overflow-hidden text-white"
                style={{
                  left: colW * s.day + 4 + dx,
                  top: top(s.start) + dy,
                  width: colW - 9,
                  height: ((s.end - s.start) / 60) * ROW_HEIGHT - 4,
                  background: TRAINER_PALETTE[s.trainer],
                  borderRadius: 8,
                  padding: "6px 8px",
                  boxShadow: dragged && drag > 0.02 ? "0 18px 34px -12px rgba(29,29,28,.55)" : "0 1px 2px rgba(29,29,28,.18)",
                  transform: moving ? "scale(1.04) rotate(-1deg)" : undefined,
                  zIndex: dragged ? 4 : 1,
                }}
              >
                <div className="font-bold tz-nums" style={{ fontSize: 11, opacity: 0.92 }}>
                  {String(Math.floor(s.start / 60)).padStart(2, "0")}:{String(s.start % 60).padStart(2, "0")}
                </div>
                <div className="font-semibold" style={{ fontSize: 12, lineHeight: 1.25, marginTop: 1 }}>
                  {s.title}
                </div>
                <div className="flex items-center" style={{ gap: 5, marginTop: 4 }}>
                  <span
                    className="inline-flex items-center rounded-pill font-bold"
                    style={{ gap: 4, background: "rgba(255,255,255,.18)", padding: "1px 7px", fontSize: 10.5, color: full ? CAPACITY_FULL : last ? CAPACITY_LAST : "#fff" }}
                  >
                    {s.booked}/{s.cap}
                  </span>
                  {s.cap === 1 && (
                    <span className="font-bold" style={{ fontSize: 10, letterSpacing: ".06em", opacity: 0.8 }}>
                      EP
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── 05 · leads ──────────────────────────────────────────────────────── */

const LEAD_COLUMNS = [
  { label: "Sin contactar", dot: SERIES.faint },
  { label: "Seguimiento", dot: SERIES.sand },
  { label: "Con valoración", dot: SERIES.ink },
  { label: "Cerrado", dot: SERIES.gold },
  { label: "No cerrado", dot: SERIES.critical },
];

/** La tarjeta que el cursor arrastra de «Sin contactar» a «Seguimiento». */
const DRAGGED_LEAD = "Álvaro Peña";

const LEADS = [
  { col: 0, name: DRAGGED_LEAD, center: "La Jota", channel: "Instagram", phone: "622 14 08 77", goal: "Perder 8 kg antes de diciembre y volver a correr", owner: null, age: "hoy" },
  { col: 0, name: "Rocío Herrán", center: "Santander", channel: "Web", phone: "671 90 22 41", goal: "Busca grupos reducidos de mañana", owner: null, age: "1 día" },
  { col: 1, name: "Diego Mata", center: "La Jota", channel: "Recomendación", phone: "660 32 18 05", goal: "Vuelve tras lesión de hombro, quiere EP", owner: "Dani Herrero", age: "3 días" },
  { col: 1, name: "Carla Ibáñez", center: "P. del Carmen", channel: "Instagram", phone: "618 77 45 30", goal: "Quiere probar una semana antes de decidir", owner: "Recepción", age: "5 días" },
  { col: 2, name: "Iván Losa", center: "P. del Carmen", channel: "Google", phone: "635 11 92 64", goal: "Valoración el jueves 27 a las 18:00", owner: "Marcos Iglesias", age: "6 días" },
  { col: 3, name: "Sara Buey", center: "La Jota", channel: "Web", phone: "699 02 55 12", goal: "Alta en grupos reducidos · bono 12", owner: "Autoservicio", age: "8 días", close: "Online" },
  { col: 4, name: "Marc Oliver", center: "Santander", channel: "Instagram", phone: "644 38 71 29", goal: "Se ha apuntado a otro centro más cerca de casa", owner: "Recepción", age: "12 días", reason: "Precio" },
];

/** Embudo de leads (`src/app/(app)/leads/leads-board.tsx`). */
export function TourLeads({ drag }: { drag: number }) {
  const moved = drag > 0.85;
  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 1240, gap: 16 }}>
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <p className="m-0 text-muted" style={{ fontSize: 14, maxWidth: 640 }}>
          Arrastra una tarjeta para moverla de etapa. Cerrar o archivar abre el detalle, que exige plan y motivo.
        </p>
        <div className="flex items-center gap-2">
          <span className="font-semibold rounded-control bg-brand-card border border-brand-border text-brand-text whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 14 }}>
            Tasa de cierre 34%
          </span>
          <span className="font-semibold rounded-control bg-tz-black text-tz-bone whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 14 }}>
            + Nuevo lead
          </span>
        </div>
      </div>
      <div className="grid items-start" style={{ gridTemplateColumns: "repeat(5,1fr)", gap: 16 }}>
        {LEAD_COLUMNS.map((col, ci) => {
          const items = LEADS.filter((l) => (moved && l.name === DRAGGED_LEAD ? 1 : l.col) === ci);
          const over = drag > 0.1 && drag < 0.99 && ci === 1;
          return (
            <div
              key={col.label}
              className={`rounded-card overflow-hidden ${over ? "bg-surface-soft" : "bg-brand-card"}`}
              style={{ border: `1px solid ${over ? col.dot : "var(--color-brand-border)"}` }}
            >
              <div className="border-b border-brand-border flex items-center gap-2" style={{ padding: "12px 14px" }}>
                <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 2, background: col.dot }} />
                <span className="flex-1 font-bold uppercase text-text-2" style={{ fontSize: 11, letterSpacing: ".09em" }}>
                  {col.label}
                </span>
                <Badge tone="neutral" dot={false}>
                  {items.length}
                </Badge>
              </div>
              <div className="flex flex-col" style={{ padding: 10, gap: 8, minHeight: 90 }}>
                {items.map((l) => {
                  const moving = l.name === DRAGGED_LEAD && drag > 0.02 && drag < 0.99;
                  return (
                    <div
                      key={l.name}
                      className={`bg-brand-card ${moving ? "border-tz-black" : "border-brand-border"}`}
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderStyle: "solid",
                        padding: 10,
                        boxShadow: moving ? "0 20px 36px -14px rgba(29,29,28,.5)" : undefined,
                        transform: moving ? `translate(${drag * 26}px,${drag * -6}px) rotate(-1.4deg) scale(1.03)` : undefined,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-brand-text" style={{ fontSize: 14 }}>
                          {l.name}
                        </span>
                        {l.close && (
                          <Badge tone="gold" dot={false}>
                            {l.close}
                          </Badge>
                        )}
                      </div>
                      <p className="m-0 text-muted" style={{ marginTop: 2, fontSize: 12 }}>
                        {l.center}
                      </p>
                      <p className="m-0 text-faint" style={{ marginTop: 2, fontSize: 12 }}>
                        {l.channel} · {l.phone}
                      </p>
                      <p className="m-0 text-text-2" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}>
                        {l.goal}
                      </p>
                      {l.reason && (
                        <p className="m-0 font-semibold text-critical" style={{ marginTop: 6, fontSize: 11 }}>
                          Motivo: {l.reason}
                        </p>
                      )}
                      <div className="border-t border-tz-sand flex items-center justify-between gap-2" style={{ marginTop: 8, paddingTop: 8 }}>
                        <span className="inline-flex items-center gap-1.5 text-text-2 min-w-0" style={{ fontSize: 12 }}>
                          <span className={`rounded-full shrink-0 ${l.owner ? "bg-good" : "bg-warning"}`} style={{ width: 6, height: 6 }} />
                          <span className="truncate">{l.owner ?? "Sin responsable"}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-faint" style={{ fontSize: 11 }}>
                            {l.age}
                          </span>
                          {!l.owner && (
                            <span className="font-semibold border border-brand-border bg-brand-card text-text-2" style={{ padding: "3px 8px", borderRadius: 8, fontSize: 11 }}>
                              Reclamar
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 06 · anuncios y feedback ────────────────────────────────────────── */

const ANNOUNCEMENTS = [
  { cat: "EVENT", title: "Quedada del club de running · sábado 30", body: "Salida a las 9:30 desde La Jota y desayuno después. Apúntate en recepción o desde la app.", center: "La Jota", views: 148, pinned: true },
  { cat: "PROMO", title: "Trae a alguien en septiembre", body: "Si tu invitado se da de alta, los dos os lleváis dos sesiones extra en el bono.", center: null, views: 302, pinned: false },
  { cat: "NEWS", title: "Nuevo horario de mañanas en Santander", body: "Desde el 1 de septiembre abrimos a las 6:45 de lunes a viernes.", center: "Santander", views: 96, pinned: false },
  { cat: "ALERT", title: "Mantenimiento del vestuario B", body: "Miércoles 26 de 15:00 a 18:00 permanecerá cerrado.", center: "P. del Carmen", views: 61, pinned: false, inactive: true },
] as const;

const CATEGORY_LABEL: Record<string, string> = { NEWS: "Novedad", EVENT: "Evento", PROMO: "Promoción", ALERT: "Aviso" };
const CATEGORY_CLASS: Record<string, string> = {
  NEWS: "bg-brand-subtle text-brand-text",
  EVENT: "bg-info-bg text-info",
  PROMO: "bg-warning-bg text-warning",
  ALERT: "bg-critical-bg text-critical",
};

/** Alineación cliente ⟷ entrenador (`src/app/(app)/feedback/alignment-track.tsx`). */
const ALIGNMENT = [
  { name: "Marta García López", client: 8, trainer: 8.5, verdict: "alineado" },
  { name: "Javier Ruiz Alonso", client: 4, trainer: 8, verdict: "ciego" },
  { name: "Pablo Serrano Ríos", client: 9, trainer: 6.5, verdict: "cliente_positivo" },
] as const;

const VERDICT_LABEL: Record<string, string> = { ciego: "Punto ciego", cliente_positivo: "Cliente + alto", alineado: "Alineado" };
const VERDICT_FILL: Record<string, string> = {
  ciego: "rgba(138,52,32,.5)",
  cliente_positivo: "rgba(75,90,34,.5)",
  alineado: "rgba(200,171,114,.6)",
};

/** Anuncios (`anuncios/announcements-manager.tsx`) + tira de feedback. */
export function TourAnuncios({ t }: { t: number }) {
  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 1240, gap: 16 }}>
      <div className="flex items-center justify-between" style={{ gap: 16 }}>
        <p className="m-0 text-muted" style={{ fontSize: 14, maxWidth: 640 }}>
          Lo que publiques aquí aparece en el portal del socio y en su app, con su vigencia y su audiencia.
        </p>
        <span className="font-semibold rounded-control bg-tz-black text-tz-bone whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 14 }}>
          + Nuevo anuncio
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {ANNOUNCEMENTS.map((a) => (
          <div
            key={a.title}
            className="bg-brand-card border-brand-border rounded-card overflow-hidden"
            style={{ borderWidth: 1, borderStyle: "inactive" in a && a.inactive ? "dashed" : "solid", opacity: "inactive" in a && a.inactive ? 0.7 : 1 }}
          >
            {/* Sin fotos reales: banda neutra a modo de marcador de posición. */}
            <div style={{ height: 76, background: "linear-gradient(115deg,var(--color-tz-sand),var(--color-tz-linen))" }} />
            <div className="flex flex-col" style={{ padding: 16, gap: 8 }}>
              <div className="flex items-center gap-2">
                <span className={`font-bold uppercase rounded-pill ${CATEGORY_CLASS[a.cat]}`} style={{ fontSize: 11, letterSpacing: ".06em", padding: "2px 8px" }}>
                  {CATEGORY_LABEL[a.cat]}
                </span>
                {a.pinned && (
                  <span className="font-bold uppercase rounded-pill bg-tz-black text-white" style={{ fontSize: 11, letterSpacing: ".06em", padding: "2px 8px" }}>
                    Destacado
                  </span>
                )}
                {"inactive" in a && a.inactive && (
                  <span className="font-bold uppercase rounded-pill bg-brand-subtle text-muted" style={{ fontSize: 11, letterSpacing: ".06em", padding: "2px 8px" }}>
                    Inactivo
                  </span>
                )}
              </div>
              <div className="font-bold text-brand-text" style={{ fontSize: 15 }}>
                {a.title}
              </div>
              <p className="m-0 text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                {a.body}
              </p>
              <div className="flex text-faint" style={{ gap: 12, fontSize: 12, paddingTop: 2 }}>
                <span>{a.center ? `Centro: ${a.center}` : "Global (toda la empresa)"}</span>
                <span>{Math.round(a.views * t)} vistas</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ZoneDivider label="Feedback de dirección" />
      <PanelCard title="Cliente ⟷ entrenador" meta="últimas 4 semanas" size={15}>
        <div className="flex flex-col" style={{ gap: 12 }}>
          {ALIGNMENT.map((r) => {
            const pos = (v: number) => 4 + (v / 10) * 92;
            const left = Math.min(pos(r.client), pos(r.trainer));
            const wide = Math.max(Math.abs(pos(r.trainer) - pos(r.client)), 1.5);
            return (
              <div key={r.name} className="flex items-center" style={{ gap: 16 }}>
                <span className="font-semibold text-brand-text" style={{ width: 200, fontSize: 13 }}>
                  {r.name}
                </span>
                <div className="relative flex-1" style={{ height: 34 }}>
                  <div className="absolute left-0 right-0 rounded-pill bg-brand-bg" style={{ top: 14, height: 6 }} />
                  <div className="absolute rounded-pill" style={{ top: 14, height: 6, left: `${left}%`, width: `${wide * t}%`, background: VERDICT_FILL[r.verdict] }} />
                  <div className="absolute rounded-full bg-tz-black border-2 border-white" style={{ top: 17, left: `${pos(r.client)}%`, width: 14, height: 14, transform: "translate(-50%,-50%)" }} />
                  <div className="absolute bg-apta-gold border-2 border-white" style={{ top: 17, left: `${pos(r.trainer)}%`, width: 12, height: 12, transform: "translate(-50%,-50%) rotate(45deg)" }} />
                </div>
                <span className={`font-semibold ${r.verdict === "ciego" ? "text-critical" : "text-muted"}`} style={{ width: 120, fontSize: 12 }}>
                  {VERDICT_LABEL[r.verdict]}
                </span>
              </div>
            );
          })}
        </div>
      </PanelCard>
    </div>
  );
}

/* ── 07 · portal del socio y app móvil ───────────────────────────────── */

const ACTIVITY: [string, number][] = [["mar", 7], ["abr", 9], ["may", 6], ["jun", 11], ["jul", 8], ["ago", 12]];

/** Portal del socio (`portal/page.tsx` + `portal/announcements-banner.tsx`). */
export function TourPortal({ t }: { t: number }) {
  const kpis: [string, number][] = [["Sesiones este mes", 12], ["Sesiones este año", 84], ["Total histórico", 296], ["Tu mejor mes", 14]];
  const maxActivity = 12;
  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 1120, gap: 18 }}>
      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <div className="relative overflow-hidden border border-brand-border bg-brand-card flex flex-col" style={{ borderRadius: 18, height: 272 }}>
          <div className="relative flex items-end" style={{ height: 128, background: "linear-gradient(135deg,#33322c,#1d1d1c 60%,#2a2a27)", padding: 16 }}>
            <span className="absolute font-bold uppercase rounded-pill bg-info-bg text-info" style={{ top: 14, left: 16, fontSize: 11, letterSpacing: ".06em", padding: "3px 10px" }}>
              Evento
            </span>
            <span className="absolute font-bold uppercase rounded-pill bg-tz-black text-white" style={{ top: 14, left: 92, fontSize: 11, letterSpacing: ".06em", padding: "3px 10px" }}>
              Destacado
            </span>
          </div>
          <div className="flex-1" style={{ padding: 18 }}>
            <div className="font-bold text-brand-text" style={{ fontSize: 16 }}>
              Quedada del club de running · sábado 30
            </div>
            <p className="m-0 text-muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
              Salida a las 9:30 desde La Jota y desayuno después. Apúntate en recepción o desde la app.
            </p>
            <div className="flex text-faint" style={{ gap: 12, marginTop: 12, fontSize: 11.5 }}>
              <span>La Jota</span>
              <span>·</span>
              <span>Audiencia: socios activos</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-tz-black border border-brand-border-dark flex flex-col justify-between" style={{ borderRadius: 18, padding: 26, height: 272 }}>
          <div className="absolute rounded-full bg-brand-ink-soft" style={{ right: -54, bottom: -54, width: 184, height: 184 }} />
          <div className="relative" style={{ zIndex: 1 }}>
            <div className="font-bold uppercase text-tz-linen" style={{ fontSize: 11, letterSpacing: ".16em" }}>
              Bienvenida de vuelta
            </div>
            <div className="font-extrabold uppercase text-white" style={{ fontSize: 34, lineHeight: 1, marginTop: 8, letterSpacing: "-.01em" }}>
              Hola, Marta
            </div>
            <p className="m-0 text-brand-muted-2" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
              Llevas <b className="text-white">12 sesiones</b> este mes. ¡Sigue con la racha!
            </p>
          </div>
          <span
            className="relative self-start bg-tz-bone text-tz-black font-extrabold uppercase rounded-control whitespace-nowrap"
            style={{ zIndex: 1, padding: "13px 20px", fontSize: 14, letterSpacing: ".03em" }}
          >
            Reservar clase →
          </span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {kpis.map(([label, v], i) => (
          <KpiCard
            key={label}
            label={label}
            value={nf(v * t)}
            accent={i === 1 ? "gold" : "ink"}
            size={28}
            hint={i === 3 ? "junio de 2025" : i === 2 ? "¡sigue así!" : ""}
          />
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <PanelCard title="Tu actividad" meta="Sesiones · últimos 6 meses">
          <div className="flex items-end" style={{ gap: 18, height: 150, paddingTop: 8 }}>
            {ACTIVITY.map(([label, v], i) => {
              const current = i === ACTIVITY.length - 1;
              return (
                <div key={label} className="flex-1 flex flex-col items-center" style={{ gap: 8 }}>
                  <span className={`font-bold ${current ? "text-gold" : "text-muted"}`} style={{ fontSize: 12 }}>
                    {Math.round(v * t)}
                  </span>
                  <div style={{ width: "100%", maxWidth: 42, height: (v / maxActivity) * 100 * t, background: current ? SERIES.gold : SERIES.linen, borderRadius: "7px 7px 0 0" }} />
                  <span className="font-semibold text-muted" style={{ fontSize: 11.5 }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </PanelCard>
        <PanelCard title="Tu plan">
          <div className="bg-tz-black" style={{ borderRadius: 12, padding: "16px 18px" }}>
            <div className="font-extrabold uppercase text-tz-bone" style={{ fontSize: 20 }}>
              Grupos reducidos · Bono 12
            </div>
            <div className="text-brand-muted-2" style={{ fontSize: 13, marginTop: 4 }}>
              Activo desde el 12 mar 2024
            </div>
            <div className="inline-flex items-center gap-1.5 border border-brand-border-dark rounded-pill font-semibold text-white" style={{ marginTop: 12, padding: "5px 11px", fontSize: 12 }}>
              <span className="rounded-full bg-good" style={{ width: 7, height: 7 }} />
              Al corriente de pago
            </div>
          </div>
          <div className="flex items-start bg-brand-subtle border border-brand-border" style={{ marginTop: 14, gap: 12, padding: "14px 16px", borderRadius: 12 }}>
            <span className="rounded-full bg-warning shrink-0" style={{ width: 14, height: 14, boxShadow: "0 0 0 4px var(--color-warning-bg)", marginTop: 3 }} />
            <div>
              <div className="font-bold text-brand-text" style={{ fontSize: 14 }}>
                Hombro derecho
              </div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>
                Sin press por encima de la cabeza; empuje horizontal.
              </div>
            </div>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

/** El mismo portal en el ancho de la app nativa (`apps/mobile`). */
export function TourPortalMobile({ t }: { t: number }) {
  return (
    <div className="bg-brand-bg flex flex-col overflow-hidden" style={{ width: 390, height: 780 }}>
      <div className="flex items-end justify-between font-semibold text-brand-text" style={{ height: 52, padding: "0 22px 6px", fontSize: 13 }}>
        <span>9:41</span>
        <span className="flex items-center" style={{ gap: 5 }}>
          <span className="block border border-brand-text" style={{ width: 16, height: 9, borderRadius: 2, borderWidth: 1.4 }} />
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-tz-linen" style={{ padding: "4px 18px 12px" }}>
        <AptaLogo variant="dark" className="text-[22px]" />
        <span className="rounded-full bg-tz-black text-tz-bone font-extrabold flex items-center justify-center" style={{ width: 30, height: 30, fontSize: 11 }}>
          MG
        </span>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: 16, gap: 12 }}>
        <div className="relative overflow-hidden bg-tz-black rounded-card" style={{ padding: 18 }}>
          <div className="absolute rounded-full bg-brand-ink-soft" style={{ right: -40, bottom: -40, width: 130, height: 130 }} />
          <div className="relative font-bold uppercase text-tz-linen" style={{ fontSize: 10, letterSpacing: ".16em" }}>
            Bienvenida de vuelta
          </div>
          <div className="relative font-extrabold uppercase text-white" style={{ fontSize: 26, marginTop: 6 }}>
            Hola, Marta
          </div>
          <p className="relative m-0 text-brand-muted-2" style={{ margin: "8px 0 14px", fontSize: 12.5 }}>
            Llevas <b className="text-white">12 sesiones</b> este mes.
          </p>
          <span className="relative inline-block bg-tz-bone text-tz-black font-extrabold uppercase rounded-control" style={{ padding: "11px 16px", fontSize: 12.5 }}>
            Reservar clase →
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KpiCard label="Este mes" value={nf(12 * t)} accent="ink" size={24} />
          <KpiCard label="Este año" value={nf(84 * t)} accent="gold" size={24} />
        </div>
        <div className="bg-brand-card border border-brand-border rounded-card" style={{ padding: 16 }}>
          <div className="font-bold uppercase" style={{ fontSize: 13, letterSpacing: ".01em" }}>
            Tu próxima clase
          </div>
          <div className="flex items-center" style={{ marginTop: 10, gap: 12 }}>
            <div className="flex flex-col items-center justify-center text-white shrink-0" style={{ width: 46, height: 46, borderRadius: 12, background: TRAINER_PALETTE[0] }}>
              <span className="font-bold" style={{ fontSize: 9, opacity: 0.85 }}>
                MAR
              </span>
              <span className="font-bold" style={{ fontSize: 15, lineHeight: 1 }}>
                25
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold" style={{ fontSize: 13.5 }}>
                Grupo reducido · 19:00
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                La Jota · Dani Herrero · 5/6 plazas
              </div>
            </div>
          </div>
          <div className="flex" style={{ marginTop: 12, gap: 8 }}>
            <span className="flex-1 text-center bg-tz-black text-tz-bone rounded-control font-bold" style={{ padding: "10px 0", fontSize: 12.5 }}>
              Ver mi agenda
            </span>
            <span className="flex-1 text-center border border-brand-border rounded-control font-semibold text-text-2" style={{ padding: "10px 0", fontSize: 12.5 }}>
              Cancelar
            </span>
          </div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-card" style={{ padding: 16 }}>
          <div className="font-bold uppercase" style={{ fontSize: 13 }}>
            Tu bono
          </div>
          <div className="flex items-center" style={{ marginTop: 10, gap: 12 }}>
            <span className="font-extrabold text-brand-text" style={{ fontSize: 26 }}>
              {Math.round(8 * t)}
              <span className="text-muted font-semibold" style={{ fontSize: 14 }}>
                {" "}
                / 12
              </span>
            </span>
            <span className="flex-1 rounded-pill bg-tz-sand overflow-hidden" style={{ height: 8 }}>
              <span className="block h-full rounded-pill bg-apta-gold" style={{ width: `${(8 / 12) * 100 * t}%` }} />
            </span>
          </div>
        </div>
      </div>
      <div className="border-t border-tz-linen bg-brand-card flex items-center justify-around" style={{ height: 64, padding: "0 10px" }}>
        {([["Actividad", "actividad", true], ["Reservar", "reservar", false], ["Evolución", "evolucion", false], ["Membresía", "membresia", false]] as [string, NavIcon, boolean][]).map(
          ([label, icon, active]) => (
            <span key={label} className={`flex flex-col items-center ${active ? "text-tz-black" : "text-muted"}`} style={{ gap: 3 }}>
              <NavIconSvg name={icon} className="w-5 h-5" />
              <span className={active ? "font-bold" : "font-medium"} style={{ fontSize: 10 }}>
                {label}
              </span>
            </span>
          )
        )}
      </div>
    </div>
  );
}

export function TourPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 390 + 24, borderRadius: 48, background: "#111110", padding: 12, boxShadow: "0 40px 90px -30px rgba(0,0,0,.6)" }}>
      <div className="overflow-hidden bg-brand-bg" style={{ borderRadius: 38, width: 390, height: 780 }}>
        {children}
      </div>
    </div>
  );
}

/* ── 08 · mesociclo por IA ───────────────────────────────────────────── */

const PHASES = [
  { name: "Fase 1 · Tolerancia", weeks: "Semanas 1-3", days: ["Lun TZ · Empuje horizontal", "Mié TZ · Bisagra + core", "Vie Gym · Tren inferior"] },
  { name: "Fase 2 · Carga", weeks: "Semanas 4-6", days: ["Lun TZ · Fuerza principal", "Mié TZ · Metcon corto", "Vie Gym · Unilateral"] },
  { name: "Fase 3 · Expresión", weeks: "Semanas 7-8", days: ["Lun TZ · Potencia", "Mié TZ · Test de marcas", "Vie Gym · Descarga"] },
];

/**
 * El velo del loader de marca, recortado a la pantalla en vez de a la ventana.
 *
 * `src/components/ui/brand-loader.tsx` es `fixed inset-0`: dentro del tutorial
 * taparía la landing entera, no la app. Comparte con él los pasos reales
 * (`MESOCYCLE_STEPS`), el wordmark y la regla del 92 %; lo que cambia es de
 * dónde sale el nivel —aquí, del reloj de la composición— y que la onda se
 * queda fuera: a esta escala no se ve y costaría un `clip-path` por fotograma.
 */
function TourBrandLoader({ pct, step, done }: { pct: number; step: number; done: boolean }) {
  const width = 420;
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 20, background: "rgba(244,240,232,.85)", backdropFilter: "blur(14px) saturate(1.06)" }}
    >
      <div className="flex flex-col items-center" style={{ gap: 30, width }}>
        <div className="font-display font-bold uppercase text-muted" style={{ fontSize: 10.5, letterSpacing: ".18em" }}>
          Generando mesociclo
        </div>
        <div className="relative" style={{ width, aspectRatio: "250 / 42" }}>
          {/* eslint-disable @next/next/no-img-element -- asset de marca fijo, igual que en brand-loader.tsx: `next/image` añadiría un wrapper que estorba al recorte */}
          <img src="/brand/tz-logo-black.png" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain object-left opacity-[.13]" />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(100 - pct).toFixed(1)}% 0 0)`, filter: "drop-shadow(4px 0 9px rgba(29,29,28,.2))" }}>
            <img src="/brand/tz-logo-black.png" alt="" aria-hidden="true" className="block w-full h-full object-contain object-left" />
          </div>
          {/* eslint-enable @next/next/no-img-element */}
        </div>
        <div className="flex flex-col items-center w-full" style={{ gap: 14 }}>
          <div className="flex items-center text-muted" style={{ gap: 10, fontSize: 12 }}>
            <span className="font-bold text-brand-text tz-nums">{Math.round(pct)} %</span>
            <span className="rounded-full bg-brand-border" style={{ width: 3, height: 3 }} />
            <span className="tz-nums">1:{String(Math.min(59, Math.round(pct * 0.55))).padStart(2, "0")}</span>
            {done && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </div>
          <div className="font-semibold text-brand-text text-center" style={{ fontSize: 17, lineHeight: 1.35, minHeight: 46 }}>
            {done ? "Mesociclo listo" : MESOCYCLE_STEPS[step]?.label}
          </div>
          <div className="flex w-full" style={{ gap: 5 }}>
            {MESOCYCLE_STEPS.map((s, i) => (
              <span key={s.label} className={`flex-1 rounded-full ${done || i < step ? "bg-tz-black" : i === step ? "bg-brand-muted" : "bg-brand-border"}`} style={{ height: 3 }} />
            ))}
          </div>
          <p className="m-0 text-faint text-center" style={{ marginTop: 6, fontSize: 12.5 }}>
            Suele tardar entre 1 y 2 minutos. No cierres esta ventana.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Mesociclos por IA (`members/[id]/mesociclos/panel.tsx`, `lib/ai/mesocycle-schema.ts`). */
export function TourMesociclo({ loading, step, done, plan }: { loading: number; step: number; done: boolean; plan: number }) {
  return (
    <div className="relative mx-auto flex flex-col" style={{ maxWidth: 1240, gap: 16, minHeight: 600 }}>
      <div className="flex items-center" style={{ gap: 12 }}>
        <span className="rounded-full bg-tz-sand text-text-2 font-bold flex items-center justify-center" style={{ width: 40, height: 40, fontSize: 14 }}>
          MG
        </span>
        <div>
          <div className="font-bold text-brand-text" style={{ fontSize: 17 }}>
            Marta García López
          </div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            La Jota · Grupos reducidos · semáforo 🟡 hombro derecho
          </div>
        </div>
        <span className="flex-1" />
        <span className="flex bg-brand-bg rounded-pill" style={{ gap: 3, padding: 3 }}>
          {["Ficha", "Salud", "Valoraciones", "Mesociclos"].map((o, i) => (
            <span key={o} className={`rounded-pill font-semibold ${i === 3 ? "bg-tz-black text-tz-bone" : "text-muted"}`} style={{ padding: "6px 14px", fontSize: 12.5 }}>
              {o}
            </span>
          ))}
        </span>
      </div>

      <div className="border border-brand-border bg-brand-card rounded-card flex flex-col" style={{ padding: 18, gap: 14 }}>
        <div>
          <h3 className="m-0 font-semibold" style={{ fontSize: 14 }}>
            Generar mesociclo
          </h3>
          <p className="m-0 text-muted" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, maxWidth: 760 }}>
            La IA recibe edad, sexo, objetivos, marcas y —solo con consentimiento de tratamiento por IA— los criterios clínicos del
            screening. Nunca nombre, DNI, teléfono ni email. El plan nace en borrador y no vale hasta que lo apruebes.
          </p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[["Nivel de partida", "Vuelta tras lesión de hombro"], ["Semanas", "8"]].map(([label, value]) => (
            <div key={label}>
              <div className="font-semibold text-text-2" style={{ fontSize: 12, marginBottom: 5 }}>
                {label}
              </div>
              <div className="border border-brand-border bg-brand-card rounded-control text-brand-text" style={{ padding: "10px 12px", fontSize: 13.5 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="font-semibold text-text-2" style={{ fontSize: 12, marginBottom: 5 }}>
            Disponibilidad
          </div>
          <div className="border border-brand-border bg-brand-card rounded-control text-brand-text" style={{ padding: "10px 12px", fontSize: 13.5, lineHeight: 1.6 }}>
            Lunes TZ
            <br />
            Miércoles TZ
            <br />
            Viernes Gym
          </div>
        </div>
        <span className="self-start rounded-control bg-tz-black text-tz-bone font-semibold whitespace-nowrap" style={{ padding: "10px 18px", fontSize: 14 }}>
          Generar borrador
        </span>
      </div>

      {plan > 0 && (
        <div className="flex flex-col" style={{ gap: 14, opacity: plan, transform: `translateY(${(1 - plan) * 12}px)` }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <span className="font-bold uppercase whitespace-nowrap" style={{ fontSize: 16 }}>
              Reconstrucción de empuje · 8 semanas
            </span>
            <Badge tone="warning">Borrador</Badge>
            <span className="flex-1" />
            <span className="rounded-control border border-brand-border bg-brand-card font-semibold text-text-2 whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 13 }}>
              Pedir cambios
            </span>
            <span className="rounded-control bg-tz-black text-tz-bone font-semibold whitespace-nowrap" style={{ padding: "8px 16px", fontSize: 13 }}>
              Aprobar plan
            </span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {PHASES.map((p) => (
              <PanelCard key={p.name} title={p.name} meta={p.weeks} size={14}>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {p.days.map((d) => (
                    <div key={d} className="border border-brand-border rounded-control text-text-2 flex items-center whitespace-nowrap" style={{ padding: "9px 12px", fontSize: 12.5, gap: 8 }}>
                      <span className="rounded-full bg-apta-gold shrink-0" style={{ width: 6, height: 6 }} />
                      {d}
                    </div>
                  ))}
                </div>
              </PanelCard>
            ))}
          </div>
          <div className="bg-tz-black rounded-card flex items-center" style={{ padding: "18px 22px", gap: 20 }}>
            <div className="flex-1">
              <div className="font-bold uppercase text-apta-gold" style={{ fontSize: 10, letterSpacing: ".18em", marginBottom: 6 }}>
                Criterios de seguridad heredados del screening
              </div>
              <p className="m-0 text-tz-bone" style={{ fontSize: 14.5, lineHeight: 1.5 }}>
                Sin press por encima de la cabeza hasta la semana 5. Nada de dominadas estrictas: se sustituyen por remo con apoyo.
              </p>
            </div>
            <Badge tone="gold" dot={false}>
              Semáforo 🟡
            </Badge>
          </div>
        </div>
      )}

      {loading > 0 && <TourBrandLoader pct={done ? 100 : loading * 92} step={done ? MESOCYCLE_STEPS.length - 1 : step} done={done} />}
    </div>
  );
}
