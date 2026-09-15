import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard-queries";
import { formatDateParam } from "@/lib/date-utils";
import { dashboardHref, DASHBOARD_PARAM_KEYS, type DashboardParams } from "./params";
import { PrintButton } from "./print-button";
import { DashboardFilterLoader, SegmentedFilter } from "./filter-loader";

/**
 * Barra de contexto del panel: a quién saludamos, con qué datos, y los dos
 * selectores que mandan sobre todo lo demás.
 *
 * Sustituye al chip estático "Todos los centros" del header, que decía siempre
 * lo mismo y no se podía cambiar. Ambos selectores viajan en la URL (no en
 * estado de cliente) porque el panel es un Server Component: al pulsarlos se
 * reconsulta el ámbito entero, insight incluido.
 *
 * Y porque se reconsulta entero, la espera se cubre con el velo de marca
 * (`DashboardFilterLoader`): sin él, al cambiar solo los `searchParams` React
 * deja el panel viejo en pantalla hasta que el nuevo está listo y el clic
 * parece no haber hecho nada.
 */
export type CenterOption = { id: string; label: string };

function greeting(hour: number) {
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * E14-06 · el periodo personalizado, sin una línea de JavaScript de cliente.
 *
 * Es un `<form method="get">` a la propia ruta: los dos `<input type="date">`
 * viajan como `?desde=…&hasta=…` y el resto del estado del panel se conserva en
 * campos ocultos. Así el periodo elegido **es la URL**, igual que los otros seis
 * —se puede compartir, guardar en marcadores y abrir dos veces— y la pantalla
 * sigue funcionando sin hidratar.
 *
 * El `max` de los dos campos es hoy: el navegador ya impide elegir un futuro, y
 * `parseCustomRange` lo vuelve a comprobar en el servidor porque el parámetro
 * llega escrito a mano tan a menudo como del selector.
 */
function CustomRangeForm({
  params,
  active,
  error,
}: {
  params: DashboardParams;
  active: boolean;
  error: string | null;
}) {
  const today = formatDateParam(new Date());
  const field =
    "bg-brand-card border border-brand-border rounded-pill px-3 py-[5px] text-[12px] font-semibold text-brand-text " +
    "[color-scheme:light] dark:[color-scheme:dark]";

  return (
    <form method="get" action="/dashboard" className="flex flex-col gap-[5px]">
      {/* El resto del estado del panel sobrevive al envío del formulario. */}
      {DASHBOARD_PARAM_KEYS.filter((k) => k !== "range" && k !== "desde" && k !== "hasta").map((key) =>
        params[key] ? <input key={key} type="hidden" name={key} value={params[key]} /> : null
      )}
      <input type="hidden" name="range" value="custom" />
      <div className="text-[9px] font-bold tracking-[.16em] uppercase text-brand-faint pl-1">Personalizado</div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          name="desde"
          max={today}
          defaultValue={params.desde ?? ""}
          aria-label="Desde"
          className={field}
        />
        <span className="text-[12px] text-brand-faint">→</span>
        <input
          type="date"
          name="hasta"
          max={today}
          defaultValue={params.hasta ?? ""}
          aria-label="Hasta"
          className={field}
        />
        <button
          type="submit"
          className={
            "rounded-pill px-3 py-[6px] text-[12px] font-bold transition-colors " +
            (active
              ? "bg-brand-ink text-white"
              : "bg-brand-card border border-brand-border text-brand-text-2 hover:text-brand-text")
          }
        >
          {/* "Ver periodo" y no "Ver": el nombre accesible de un botón tiene
              que decir qué hace sin el contexto visual de los dos campos. */}
          Ver periodo
        </button>
      </div>
      {/* Un periodo rechazado no rompe la pantalla: se dice por qué y el panel
          sigue pintando el mes en curso. */}
      {error && (
        <p role="status" className="text-[11px] font-semibold text-critical pl-1 max-w-[300px]">
          {error}
        </p>
      )}
    </form>
  );
}

export function ContextBar({
  userName,
  timezone,
  centers,
  activeCenterId,
  range,
  params,
  customError,
}: {
  userName: string;
  /** Zona horaria del centro: el saludo es el de la hora que tiene delante quien mira. */
  timezone: string;
  centers: CenterOption[];
  activeCenterId: string;
  range: DashboardRange;
  params: DashboardParams;
  /** Por qué se rechazó el periodo personalizado, si se rechazó (E14-06). */
  customError?: string | null;
}) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const firstName = userName.split(" ")[0] || userName;
  const longDate = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  });
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: timezone });

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-0.5">
      <div>
        <div className="font-display font-bold text-[26px] leading-[1.1] tracking-[-.02em] text-brand-text">
          {greeting(local.getHours())}, {firstName}
        </div>
        <div className="text-[13px] text-brand-muted mt-1 first-letter:uppercase">
          {longDate} · datos actualizados a las {time}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3.5">
        <DashboardFilterLoader>
          <SegmentedFilter
            label="Centro"
            options={[{ id: "all", label: "Todos" }, ...centers].map((c) => ({
              ...c,
              href: dashboardHref(params, { centerId: c.id === "all" ? undefined : c.id }),
            }))}
            activeId={activeCenterId}
          />
          <SegmentedFilter
            label="Periodo"
            // El personalizado no es un enlace: son dos fechas, y va en su
            // propio formulario justo al lado.
            options={DASHBOARD_RANGES.filter((r) => r.id !== "custom").map((r) => ({
              id: r.id,
              label: r.label,
              href: dashboardHref(params, { range: r.id === "mes" ? undefined : r.id }),
            }))}
            activeId={range}
          />
        </DashboardFilterLoader>
        <CustomRangeForm params={params} active={range === "custom"} error={customError ?? null} />
        {/* Exportar a PDF: la impresión del navegador, en un botón de cliente. */}
        <PrintButton />
      </div>
    </div>
  );
}
