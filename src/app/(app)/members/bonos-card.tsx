import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  EXPIRY_HORIZON_DAYS,
  type PackCenterSummary,
  type PackRunningOut,
  type PackSummaryResult,
} from "@/lib/bonos-queries";
import { comparisonWindow, DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard-range";

/**
 * E14-08 · Bonos por centro, en la pantalla desde la que se actúa.
 *
 * **Por qué aquí y no en `/dashboard`.** La cifra que pidió negocio no es una
 * cifra: es una llamada de teléfono. «Un bono acabándose es el momento de
 * venta» solo vale algo si desde el mismo sitio se llega a la ficha del socio,
 * y eso es `/members`. El panel de control es donde se mira si el mes va bien;
 * este listado es donde se decide a quién se llama hoy, y la lista de bonos a
 * punto de acabarse es exactamente una lista de a quién llamar.
 *
 * La agregación vive en `bonos-queries.ts` y acepta `DashboardOpts` entero, así
 * que el día que el panel quiera la misma tarjeta la monta con su selector de
 * centro sin duplicar una línea de aritmética.
 *
 * **Flujo y stock se rotulan distinto, y no es cosmética.** Las canjeadas son
 * del periodo; las restantes y la caducidad son el saldo de hoy. Es la misma
 * trampa que el mapa de barrios tenía con «leads de este trimestre» y «leads
 * desde siempre» bajo el mismo rótulo, y aquí se evita diciéndolo.
 */
export function BonosPorCentroCard({
  summary,
  range,
  params,
}: {
  summary: PackSummaryResult;
  range: DashboardRange;
  /** El resto del estado de la URL, para que cambiar de periodo no borre los filtros. */
  params: Record<string, string | undefined>;
}) {
  const { rows, total, runningOut, runningOutTotal } = summary;
  if (rows.length === 0) return null;

  // El rótulo del periodo sale de `comparisonWindow`, que es la ventana que la
  // agregación usa de verdad, y NO del `meta` de `DASHBOARD_RANGES`: ese meta
  // describe los tramos de la serie de ingresos («últimos 6 meses» para «Mes»),
  // y puesto aquí diría que las canjeadas son de medio año cuando son del mes en
  // curso. Es exactamente el error que este lote viene a quitar del panel.
  const scopeLabel = comparisonWindow(range).scopeLabel;

  return (
    <section
      aria-labelledby="tz-bonos-titulo"
      className="bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-4 pt-3.5 pb-3 border-b border-tz-sand">
        <div className="min-w-0">
          <h2
            id="tz-bonos-titulo"
            className="font-display font-extrabold text-[15px] leading-none text-brand-text"
          >
            Bonos por centro
          </h2>
          <p className="text-[11.5px] text-brand-muted mt-1.5">
            Canjeadas y devueltas {scopeLabel}. Restantes y caducidad, a día de hoy.
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {/* Fuera el personalizado (E14-06): sin selector de fechas navegaría
              a un periodo que se comporta como «Mes» sin decirlo. */}
          {DASHBOARD_RANGES.filter((r) => r.id !== "custom").map((r) => (
            <Link
              key={r.id}
              href={hrefWithRange(params, r.id)}
              scroll={false}
              title={`Canjeadas y devueltas ${comparisonWindow(r.id).scopeLabel}`}
              aria-current={r.id === range ? "true" : undefined}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-colors ${
                r.id === range ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-tz-bone"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </header>

      {/* La tabla de cifras necesita ~480 px para no recortar «Caducidad»; el
          resto es para la lista. `minmax(0,…)` en las dos para que ninguna
          desborde la rejilla en una ventana de 1280. */}
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] divide-y lg:divide-y-0 lg:divide-x divide-tz-sand">
        <CenterTable rows={rows} total={total} />
        <RunningOutList rows={runningOut} total={runningOutTotal} />
      </div>
    </section>
  );
}

/** `?range=` sin perder el resto de filtros. La página vuelve a 1: el periodo cambia el dato. */
function hrefWithRange(params: Record<string, string | undefined>, range: DashboardRange): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "range" && key !== "page" && value) qs.set(key, value);
  }
  if (range !== "mes") qs.set("range", range);
  const query = qs.toString();
  return query ? `/members?${query}` : "/members";
}

function CenterTable({
  rows,
  total,
}: {
  rows: PackCenterSummary[];
  total: PackSummaryResult["total"];
}) {
  return (
    <div className="tz-scroll overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Sesiones canjeadas y restantes por centro, y bonos que caducan en los próximos{" "}
          {EXPIRY_HORIZON_DAYS} días.
        </caption>
        <thead>
          <tr className="border-b border-tz-sand">
            <Th className="text-left pl-4">Centro</Th>
            <Th title="Sesiones reservadas en el periodo, leídas del libro del bono. Las caducadas no cuentan aquí.">
              Canjeadas
            </Th>
            <Th title="Saldo vivo de los bonos activos, hoy. Los ilimitados no suman: se cuentan aparte.">
              Restantes
            </Th>
            <Th title={`Bonos con saldo que caducan en los próximos ${EXPIRY_HORIZON_DAYS} días, y los que ya caducaron sin gastarse.`}>
              Caducidad
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.centerId} className="border-b border-tz-sand/60">
              <td className="py-2 pl-4 pr-2 text-[12.5px] font-semibold text-brand-text">
                <span className="block max-w-[150px] truncate" title={row.centerName}>
                  {row.centerName}
                </span>
              </td>
              <Td>
                <span className="font-semibold text-brand-text">{row.redeemed}</span>
                {row.refunded > 0 && (
                  <Hint title="Sesiones devueltas por cancelación dentro de ventana o por falta perdonada.">
                    +{row.refunded} devueltas
                  </Hint>
                )}
                {row.unlimitedRedeemed > 0 && (
                  <Hint title="Sesiones de bonos ilimitados. No descuentan saldo, así que no se suman a las canjeadas.">
                    {row.unlimitedRedeemed} de ilimitados
                  </Hint>
                )}
              </Td>
              <Td>
                <span className="font-semibold text-brand-text">{row.remaining}</span>
                <Hint>
                  {row.packs} {row.packs === 1 ? "bono" : "bonos"}
                  {row.unlimitedPacks > 0 ? ` · ${row.unlimitedPacks} ilimitados` : ""}
                </Hint>
              </Td>
              <Td>
                <span
                  className={`font-semibold ${row.expiringSoonSessions > 0 ? "text-warning-text" : "text-brand-text-2"}`}
                >
                  {row.expiringSoonSessions}
                </span>
                <Hint>
                  en {row.expiringSoonPacks} {row.expiringSoonPacks === 1 ? "bono" : "bonos"}
                </Hint>
                {row.expiredUnusedSessions > 0 && (
                  <Hint
                    className="text-critical font-semibold"
                    title="Sesiones que ya se han perdido: su bono venció con saldo dentro."
                  >
                    {row.expiredUnusedSessions} ya caducadas
                  </Hint>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="bg-tz-bone/60">
              <td className="py-2 pl-4 pr-2 text-[11px] font-bold uppercase tracking-[.06em] text-brand-muted">
                Total
              </td>
              <Td>
                <span className="font-extrabold text-brand-text">{total.redeemed}</span>
              </Td>
              <Td>
                <span className="font-extrabold text-brand-text">{total.remaining}</span>
              </Td>
              <Td>
                <span className="font-extrabold text-brand-text">{total.expiringSoonSessions}</span>
              </Td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * La lista accionable. Cada fila dice POR QUÉ está ahí: sin el motivo escrito
 * esto es un montón de nombres y nadie sabe qué decirle a cada uno al teléfono.
 */
function RunningOutList({ rows, total }: { rows: PackRunningOut[]; total: number }) {
  return (
    <div className="px-4 py-3">
      <h3 className="text-[10.5px] font-bold uppercase tracking-[.12em] text-brand-faint">
        A punto de acabarse
      </h3>
      {rows.length === 0 ? (
        <p className="text-[12px] text-brand-muted mt-2.5">
          Ningún bono con saldo bajo ni con caducidad cerca. Nada que vender hoy por aquí.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-tz-sand/60">
          {rows.map((row) => (
            <li key={row.subscriptionId}>
              <Link
                href={`/members/${row.memberId}`}
                className="flex items-center justify-between gap-2.5 py-1.5 group"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-brand-text group-hover:underline">
                    {row.memberName}
                  </span>
                  <span className="block truncate text-[11px] text-brand-muted">
                    {row.centerName} · {row.planName}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  <span className="text-[12px] font-semibold tz-nums text-brand-text-2 whitespace-nowrap">
                    {row.remaining} {row.remaining === 1 ? "sesión" : "sesiones"}
                  </span>
                  <ReasonBadge row={row} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > rows.length && (
        <p className="text-[11px] text-brand-muted mt-2">
          Y {total - rows.length} más con el bono acabándose en este ámbito.
        </p>
      )}
    </div>
  );
}

function ReasonBadge({ row }: { row: PackRunningOut }) {
  if (row.reason === "caducado") {
    return (
      <Badge tone="critical">
        {row.daysToExpiry === -1 ? "Caducó ayer" : `Caducó hace ${Math.abs(row.daysToExpiry ?? 0)} d`}
      </Badge>
    );
  }
  if (row.reason === "caduca") {
    const days = row.daysToExpiry ?? 0;
    return <Badge tone="warning">{days === 0 ? "Caduca hoy" : `Caduca en ${days} d`}</Badge>;
  }
  return <Badge tone="gold">Poco saldo</Badge>;
}

function Th({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <th
      scope="col"
      title={title}
      className={`py-2 px-2 text-right text-[10px] font-bold uppercase tracking-[.06em] text-brand-faint ${
        className ?? ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 px-2 text-right text-[12.5px] tz-nums whitespace-nowrap">{children}</td>;
}

function Hint({
  children,
  title,
  className,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span title={title} className={`block text-[10.5px] text-brand-muted ${className ?? ""}`}>
      {children}
    </span>
  );
}
