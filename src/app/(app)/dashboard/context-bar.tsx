import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard-queries";
import { dashboardHref, type DashboardParams } from "./params";
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

export function ContextBar({
  userName,
  timezone,
  centers,
  activeCenterId,
  range,
  params,
}: {
  userName: string;
  /** Zona horaria del centro: el saludo es el de la hora que tiene delante quien mira. */
  timezone: string;
  centers: CenterOption[];
  activeCenterId: string;
  range: DashboardRange;
  params: DashboardParams;
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
            options={DASHBOARD_RANGES.map((r) => ({
              id: r.id,
              label: r.label,
              href: dashboardHref(params, { range: r.id === "mes" ? undefined : r.id }),
            }))}
            activeId={range}
          />
        </DashboardFilterLoader>
        {/* Exportar a PDF: la impresión del navegador, en un botón de cliente. */}
        <PrintButton />
      </div>
    </div>
  );
}
