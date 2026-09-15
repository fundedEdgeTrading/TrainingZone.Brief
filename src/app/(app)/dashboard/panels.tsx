/**
 * Paneles del panel de control.
 *
 * El panel hacía las 19 consultas en un único `Promise.all`, así que la página
 * no pintaba hasta que terminaba la más lenta. Aquí cada bloque es su propio
 * Server Component asíncrono con su consulta: la página los envuelve en
 * `<Suspense>` y lo importante (el insight y la fila de KPIs) llega primero
 * mientras el resto sigue en vuelo.
 *
 * Rediseño 2026-08: los 19 paneles siguen estando, reordenados por jerarquía, y
 * se suman el insight del día y las altas/bajas por semana. Tres gráficas de
 * Recharts desaparecen a favor de HTML —método de pago, socios por estado y el
 * ranking de socios— porque a estos anchos una barra horizontal con etiqueta de
 * categoría o se solapa o se recorta, y el dato cabe mejor en una fila.
 */
import { cache } from "react";
import Link from "next/link";
import {
  getKpiTiles,
  getRevenueSeries,
  getMemberStateBreakdown,
  getOccupancyByCenter,
  getNoShowRate,
  getOccupancyByWeekday,
  getRevenueByMethod,
  getLtvAndTicket,
  getMemberDemographics,
  getGoalsAggregate,
  getPostalPanelData,
  getAgeBrackets,
  getMembersByService,
  getAcquisitionChannels,
  getTopServices,
  getMemberRanking,
  getLeadCloseRate,
  getSexDistribution,
  getWeeklyChurn,
  getDailyInsight,
  getAverageOccupancy,
  ADHERENCE_PERIOD_DAYS,
  type CustomRange,
  type DashboardRange,
} from "@/lib/dashboard-queries";
import { OCCUPANCY_TARGET_PCT, TENURE_TARGET_MONTHS } from "@/lib/dashboard-targets";
import { MEMBER_STATE_COLOR, MEMBER_STATE_LABEL, PAYMENT_METHOD_COLOR, PAYMENT_METHOD_LABEL, SERIES } from "@/lib/chart-colors";
import PostalMapPanel from "./postal-map-panel";
import { KpiCard } from "@/components/kpi-card";
import { EUR_FORMAT } from "@/components/ui/count-up";
import { PanelCard, BarRow, BarBlock, LegendSwatch, FUNNEL_COLORS } from "./panel-card";
import { dashboardHref, type DashboardParams } from "./params";
import { ExportRankingButton } from "./export-ranking-button";
import {
  RevenueChart,
  OccupancyByWeekdayChart,
  NoShowRateCard,
  AgeBracketsChart,
  DonutChart,
  WeeklyChurnChart,
} from "./charts";

export const eur = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const int = (n: number) => n.toLocaleString("es-ES");

/**
 * `getMemberDemographics` alimenta tres paneles distintos. Con `cache()` la
 * consulta sigue ejecutándose una sola vez por petición aunque cada panel la
 * pida por su cuenta. Los argumentos son primitivos a propósito: `cache()`
 * compara por identidad, así que un objeto de opciones fallaría siempre.
 */
const demographicsFor = cache((orgId: string, centerId: string | null) =>
  getMemberDemographics(orgId, { centerId })
);

/** Ámbito activo del panel. Se pasa desestructurado para que `cache()` funcione. */
export type PanelProps = {
  orgId: string;
  centerId: string | null;
  range: DashboardRange;
  /** Las dos fechas de `range === "custom"`, ya validadas por la página (E14-06). */
  custom?: CustomRange;
};

const optsOf = ({ centerId, range, custom }: PanelProps) => ({ centerId, range, custom });

/* ---------- 1. Insight del día ---------- */

export async function InsightPanel(props: PanelProps) {
  const insight = await getDailyInsight(props.orgId, optsOf(props));
  // Sin datos suficientes no se escribe una frase de relleno: el bloque no sale.
  if (!insight) return null;

  return (
    <div className="relative overflow-hidden bg-brand-ink rounded-[18px] px-6 py-5 flex flex-wrap items-center gap-5 tz-fade-up">
      <span
        className="absolute left-0 inset-y-0 w-[3px]"
        style={{ background: "linear-gradient(180deg, #e3cfa2, #b58e52)" }}
      />
      <div className="flex-1 min-w-[280px]">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "linear-gradient(135deg, #e3cfa2, #b58e52)" }}
          />
          <span className="text-[10px] font-bold tracking-[.18em] uppercase text-apta-gold whitespace-nowrap">
            Insight del día
          </span>
        </div>
        <p className="text-[15.5px] leading-[1.55] text-tz-bone text-pretty max-w-[78ch]">{insight.text}</p>
      </div>
      <Link
        href={insight.ctaHref}
        className="flex items-center gap-[7px] flex-none border border-brand-border-dark rounded-pill px-4 py-[9px] text-[12.5px] font-semibold text-apta-gold transition-colors duration-150 hover:bg-brand-border-dark"
      >
        {insight.ctaLabel}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}

/* ---------- 2. Fila de KPIs ---------- */

const KPI_FORMAT = {
  eur: EUR_FORMAT,
  pct: { suffix: "%" },
  int: undefined,
  signed: undefined,
} as const;

export async function KpiRow(props: PanelProps) {
  const tiles = await getKpiTiles(props.orgId, optsOf(props));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {tiles.map((t, i) => (
        <KpiCard
          key={t.key}
          label={t.label}
          value={t.value}
          // "Altas − bajas" puede ser negativo y el signo forma parte del dato:
          // ahí se pinta el valor ya formateado en vez de animar el contador.
          numericValue={t.format === "signed" ? undefined : t.numericValue}
          format={KPI_FORMAT[t.format]}
          // Sin histórico del que salir (morosos, congelados: `MemberState` no
          // guarda cambios de estado) el chip dice "—", no "=": "sin cambios"
          // sería una afirmación que nadie ha comprobado.
          delta={t.delta ?? { text: "—", tone: "flat" }}
          spark={t.spark}
          accent={t.accent}
          hint={t.hint}
          size="kpi"
          delay={0.04 + i * 0.035}
        />
      ))}
    </div>
  );
}

/* ---------- 3. Mapa de calor por barrio ---------- */

export async function PostalPanel(props: PanelProps) {
  const { orgId, centerId, range } = props;
  const { points, opportunity } = await getPostalPanelData(orgId, optsOf(props));
  // E11-07 · El periodo y el centro bajan hasta el enlace del mapa de barrios,
  // que hasta ahora apuntaba a `/mapa-barrios` a secas y perdía los dos.
  return (
    <PostalMapPanel points={points} opportunity={opportunity} range={range ?? "mes"} centerId={centerId ?? null} />
  );
}

/* ---------- 4. Dinero ---------- */

export async function RevenuePanel(props: PanelProps) {
  const { rows, average, meta, pending } = await getRevenueSeries(props.orgId, optsOf(props));
  return (
    <PanelCard
      title="Ingresos"
      meta={meta}
      delay={0.12}
      action={
        <div className="flex items-center gap-3.5">
          <LegendSwatch color={SERIES.gold} label="periodo actual" />
          <LegendSwatch color={SERIES.goldSoft} label="media" line />
        </div>
      }
      /**
       * E14-03 · el pie dice qué deja fuera la cifra.
       *
       * «Ingresos» es solo lo COBRADO (`status = 'PAID'`). Con SEPA el primer
       * adeudo tarda días en liquidar y vive en `PENDING`, y ese euro no
       * aparecía en ninguna card del panel: ni aquí ni en morosidad, que además
       * exige `state = 'DELINQUENT'` y quien tiene el cobro en vuelo no ha
       * impagado nada. Se dice, aparte y sin sumarlo — mezclar cobrado con
       * en-vuelo convertiría un KPI de caja en una previsión.
       *
       * Cuando no hay nada en vuelo no se escribe nada: el diagnóstico midió
       * 0,00 € en la base de demo y una nota permanente sobre cero euros es
       * ruido.
       */
      footer={
        pending.count > 0 ? (
          <>
            La cifra es solo lo <strong className="font-bold text-brand-text">cobrado</strong>. Además hay{" "}
            <strong className="font-bold text-brand-text">{eur(pending.cents)}</strong> en vuelo (
            {pending.count} {pending.count === 1 ? "recibo" : "recibos"} sin liquidar, normalmente adeudos SEPA), que no
            están sumados aquí.
          </>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin cobros registrados en este periodo.</p>
      ) : (
        <RevenueChart data={rows} average={average} />
      )}
    </PanelCard>
  );
}

const METHOD_ORDER = ["SEPA", "CARD", "BIZUM", "CASH", "TRANSFER"];

export async function RevenueByMethodPanel(props: PanelProps) {
  const data = await getRevenueByMethod(props.orgId, optsOf(props));
  const rows = data
    .map((d) => ({ ...d, label: PAYMENT_METHOD_LABEL[d.method] ?? d.method }))
    .sort((a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
  const total = rows.reduce((s, r) => s + r.totalEuros, 0);
  const max = Math.max(1, ...rows.map((r) => r.totalEuros));
  const recurring = rows.find((r) => r.method === "SEPA");
  const worstFailing = [...rows].sort((a, b) => b.failedCount - a.failedCount)[0];

  return (
    <PanelCard
      title="Método de pago"
      meta="cobrado en el periodo"
      delay={0.18}
      footer={
        total > 0 && recurring ? (
          <>
            El {Math.round((recurring.totalEuros / total) * 100)}% del cobro va por SEPA.
            {worstFailing && worstFailing.failedCount > 0
              ? ` ${worstFailing.label} es el método que más recibos fallidos deja: ${worstFailing.failedCount}.`
              : " Ningún método acumula recibos fallidos ahora mismo."}
          </>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin cobros registrados todavía.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <BarRow
              key={r.method}
              label={r.label}
              labelWidth={104}
              pct={(r.totalEuros / max) * 100}
              color={PAYMENT_METHOD_COLOR[r.method] ?? SERIES.sand}
              value={`${(r.totalEuros / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k €`}
              valueWidth={52}
              height={20}
              rounded="rounded-r-[7px]"
              delay={0.2 + i * 0.06}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

/* ---------- 4 bis. Ingresos por concepto (card de M4) ---------- */

/**
 * «De dónde viene el dinero» (E14-17). El componente lo entrega **M4**
 * (`revenue-mix-card.tsx`); M1 solo pone la línea, como acordaba el reparto del
 * lote. Se reexporta desde aquí para que `page.tsx` siga importando todos los
 * paneles de un único sitio.
 *
 * Su `RevenueMixProps` no acepta `custom`, así que con el periodo personalizado
 * esta card se comporta como «Mes» en vez de romper. Está pedido a M4 en
 * `docs/hu/M1-peticion-lote3.md`: es aceptar un campo más y pasarlo.
 */
export { RevenueMixPanel } from "./revenue-mix-card";

/* ---------- 5. LTV y ticket ---------- */

const months = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} meses`;

/**
 * E14-05 · las dos cifras que deciden cuánto se puede gastar en captar.
 *
 * El LTV es el producto de un ritmo (lo que un socio deja al mes) por una
 * duración (lo que se queda), y hasta ahora el panel solo tenía una media de
 * todo lo cobrado por socio sobre todo el histórico llamada «LTV». La card
 * enseña las dos piezas **y su relación**, que es el número que se usa: hasta
 * cuánto se puede pagar por un socio nuevo.
 *
 * **El titular cambia cuando la permanencia no se puede medir.** Si el negocio
 * lleva abierto menos que la referencia de organización, nadie ha podido llegar
 * a ella todavía y compararse contra ella es un artefacto de la edad del
 * negocio. En ese caso eso ES la noticia, y va en la cifra grande — no en una
 * nota al pie que nadie lee.
 */
export async function LtvRow(props: PanelProps) {
  const [ltv, demographics] = await Promise.all([
    getLtvAndTicket(props.orgId, optsOf(props)),
    demographicsFor(props.orgId, props.centerId),
  ]);
  const { tenure } = ltv;

  const tenureHint = [
    tenure.months === null
      ? "sin socios que medir"
      : tenure.belowHorizon
        ? `el negocio lleva ${months(tenure.horizonMonths)}: todavía no se puede comparar con ${TENURE_TARGET_MONTHS}`
        : `referencia ${TENURE_TARGET_MONTHS} meses`,
    tenure.completedCount > 0 ? `${tenure.completedCount} bajas medidas` : null,
    tenure.censoredCount > 0 ? `${tenure.censoredCount} socios en curso` : null,
    tenure.importedExcluded > 0 ? `${tenure.importedExcluded} importados fuera` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Valor de un socio"
        value={ltv.ltvEuros === null ? "—" : eur(ltv.ltvEuros * 100)}
        numericValue={ltv.ltvEuros === null ? undefined : Math.round(ltv.ltvEuros * 100)}
        format={EUR_FORMAT}
        // La relación entre las dos cifras, dicha en la propia card: es lo que
        // contesta cuánto se puede gastar en captar a uno nuevo.
        hint={
          ltv.ltvEuros !== null && ltv.monthlyArpuEuros !== null && tenure.months !== null
            ? `${eur(ltv.monthlyArpuEuros * 100)}/mes × ${months(tenure.months)}`
            : ltv.monthlyArpuEuros === null
              ? `solo ${ltv.paymentCount} cobros ${ltv.scopeLabel}: elige un periodo más largo`
              : "falta permanencia para calcularlo"
        }
        accent="gold"
        size="ltv"
        delay={0.5}
      />
      <KpiCard
        label="Permanencia media"
        value={tenure.months === null ? "—" : months(tenure.months)}
        numericValue={tenure.months ?? undefined}
        format={{ suffix: " meses", numberFormat: { maximumFractionDigits: 1 } }}
        hint={tenureHint}
        accent={tenure.belowHorizon ? "ink" : "gold"}
        size="ltv"
        delay={0.54}
      />
      <KpiCard
        label="Ticket medio"
        value={eur(ltv.avgTicketEuros * 100)}
        numericValue={Math.round(ltv.avgTicketEuros * 100)}
        format={EUR_FORMAT}
        // El pie deja de ser un código de regla y dice quién lidera.
        hint={
          ltv.ticketLeader
            ? `${ltv.ticketLeader.center} lidera con ${eur(ltv.ticketLeader.avgTicketEuros * 100)}`
            : `${ltv.payingMembers} socios con cobros ${ltv.scopeLabel}`
        }
        accent="ink"
        size="ltv"
        delay={0.58}
      />
      <KpiCard
        label="Edad media"
        value={demographics.avgAge ? `${demographics.avgAge} años` : "—"}
        numericValue={demographics.avgAge ?? undefined}
        format={{ suffix: " años" }}
        hint={`muestra: ${demographics.sampleSize} · ${demographics.pctWithChildren ?? "—"}% con hijos`}
        accent="ink"
        size="ltv"
        delay={0.62}
      />
    </div>
  );
}

/* ---------- 6. Ocupación y actividad ---------- */

/**
 * E14-02 · **plazas vendidas** por centro, que es media card de las dos.
 *
 * La barra mide lo vendido sobre el aforo —"¿estoy llenando?"— y el pie añade
 * la asistencia real y el desglose grupo/EP. Antes esta card tenía una ventana
 * fija de 30 días que ignoraba el selector, así que su pie y el tile de arriba
 * daban dos números distintos con la misma palabra: era la mitad del "2 %" que
 * reportó dirección.
 */
export async function OccupancyByCenterPanel(props: PanelProps) {
  const [data, average] = await Promise.all([
    getOccupancyByCenter(props.orgId, optsOf(props)),
    getAverageOccupancy(props.orgId, optsOf(props)),
  ]);
  const rows = [...data]
    .filter((d) => d.sessions > 0)
    .map((d) => ({ ...d, label: d.center.replace(/^TRAINING ZONE\s*/i, "") }))
    .sort((a, b) => b.soldPct - a.soldPct);

  return (
    <PanelCard
      title="Plazas vendidas por centro"
      meta="% del aforo, en el periodo"
      delay={0.24}
      footer={
        rows.length > 0 ? (
          <>
            Media de la organización: <strong className="font-bold text-brand-text">{average.soldPct}%</strong> del
            aforo vendido (objetivo interno {OCCUPANCY_TARGET_PCT}%), y de lo vendido vino el{" "}
            <strong className="font-bold text-brand-text">{average.attendancePct}%</strong>.
            {average.epSessions > 0 && average.groupSessions > 0 ? (
              <>
                {" "}
                Grupo {average.groupSoldPct}% y entrenamiento personal {average.epSoldPct}%: van por separado porque el
                EP tiene aforo 1 y llena siempre.
              </>
            ) : null}
          </>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin sesiones en este periodo.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r, i) => (
            <BarBlock
              key={r.center}
              label={r.label}
              value={`${r.soldPct}%`}
              pct={r.soldPct}
              color={i === 0 ? SERIES.gold : SERIES.sand}
              valueColor={i === 0 ? SERIES.gold : "var(--color-brand-text-2)"}
              height={10}
              valueSize="text-sm"
              delay={0.2 + i * 0.06}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

export async function OccupancyByWeekdayPanel(props: PanelProps) {
  const data = await getOccupancyByWeekday(props.orgId, optsOf(props));
  return (
    // Mide venta y no asistencia: la pregunta es cuál es el día flojo para
    // mover la parrilla, y una plaza vendida a la que no se vino es demanda.
    <PanelCard title="Plazas vendidas por día" meta="% del aforo, en el periodo" delay={0.3}>
      <OccupancyByWeekdayChart data={data} />
    </PanelCard>
  );
}

/**
 * E14-02 · la otra mitad: **asistencia real**, con el no-show como secundario.
 *
 * La card oscura enseñaba solo la tasa de no-show sobre una ventana fija de 30
 * días. Ahora la cifra grande es la que faltaba —de lo que se vendió en clases
 * ya celebradas, cuánto se presentó— y el pie dice sobre cuánta lista sin pasar
 * está calculada, que es la nota al pie obligatoria de esta métrica: un 90 % con
 * la mitad de los rosters sin resolver no significa lo mismo que un 90 % con la
 * lista al día.
 */
export async function NoShowPanel(props: PanelProps) {
  const data = await getNoShowRate(props.orgId, optsOf(props));
  return (
    <NoShowRateCard
      rate={data.rate}
      deltaPts={data.deltaPts}
      attendancePct={data.attendancePct}
      unresolved={data.unresolved}
      scopeLabel={data.scopeLabel}
    />
  );
}

/* ---------- 7. Altas y bajas + estados ---------- */

export async function WeeklyChurnPanel(props: PanelProps) {
  const churn = await getWeeklyChurn(props.orgId, optsOf(props));
  return (
    <PanelCard
      title="Altas y bajas por semana"
      meta={`${churn.weeks} semanas`}
      delay={0.34}
      action={
        <div className="flex items-center gap-3.5">
          <LegendSwatch color={SERIES.gold} label="altas" />
          <LegendSwatch color={SERIES.critical} label="bajas" />
        </div>
      }
      footer={
        <div className="flex flex-wrap gap-6">
          <FooterStat label={`Altas ${churn.weeks} sem.`} value={int(churn.joins)} color={SERIES.gold} />
          <FooterStat label={`Bajas ${churn.weeks} sem.`} value={int(churn.cancels)} color={SERIES.critical} />
          <FooterStat
            label="Neto"
            value={`${churn.net > 0 ? "+" : ""}${int(churn.net)}`}
            color="var(--color-brand-text)"
          />
        </div>
      }
    >
      <WeeklyChurnChart data={churn.rows} />
    </PanelCard>
  );
}

function FooterStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[.1em] uppercase text-brand-muted">{label}</div>
      <div className="font-display font-bold text-xl tabular-nums mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export async function MemberStatePanel(props: PanelProps) {
  const data = await getMemberStateBreakdown(props.orgId, optsOf(props));
  // Por volumen, no por el orden canónico de estados: en una lista de seis
  // filas lo que se busca es "¿qué pesa más?", no el orden del enum.
  const rows = [...data].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <PanelCard title="Socios por estado" meta="ahora mismo" delay={0.38}>
      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin socios todavía.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <BarRow
              key={r.state}
              label={MEMBER_STATE_LABEL[r.state] ?? r.state}
              labelWidth={84}
              pct={(r.count / max) * 100}
              color={MEMBER_STATE_COLOR[r.state] ?? SERIES.sand}
              value={int(r.count)}
              valueWidth={30}
              valueColor={r.state === "DELINQUENT" ? SERIES.critical : undefined}
              delay={0.2 + i * 0.06}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

/* ---------- 8. Ranking de socios ---------- */

const RANK_COLUMNS = [
  { key: "ltv", label: "LTV" },
  { key: "adherence", label: "Adherencia" },
  { key: "tenure", label: "Antigüedad" },
  { key: "mixed", label: "Score mixto" },
] as const;

export type RankSort = (typeof RANK_COLUMNS)[number]["key"];

const GRID_TEMPLATE =
  "34px minmax(150px,1.3fr) minmax(150px,1fr) minmax(140px,0.9fr) 92px minmax(130px,0.85fr)";

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export async function RankingPanel({
  orgId,
  centerId,
  range,
  sort,
  dir,
  params,
}: PanelProps & { sort: RankSort; dir: "asc" | "desc"; params: DashboardParams }) {
  const ranking = await getMemberRanking(orgId, { centerId, range, dimension: sort, dir });
  const maxLtv = ranking.maxLtvEuros;
  const maxScore = ranking.maxScore;

  return (
    <PanelCard
      title="Ranking de socios"
      meta={`histórico · adherencia ${ADHERENCE_PERIOD_DAYS} días`}
      delay={0.46}
      action={<span className="text-[11.5px] text-brand-faint">Pulsa una columna para ordenar</span>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-brand-muted">
            Mostrando {ranking.items.length} de {ranking.total} socios
          </span>
          <div className="flex gap-1.5">
            <Link
              href="/members"
              className="rounded-lg border border-brand-border px-3.5 py-1.5 text-xs font-semibold text-brand-text-2 transition-colors duration-150 hover:bg-brand-bg"
            >
              Ver todos
            </Link>
            <ExportRankingButton rows={ranking.items} />
          </div>
        </div>
      }
    >
      {ranking.items.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin socios activos todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid items-center gap-x-4 text-[13.5px] min-w-[720px]"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <div className="pb-[11px] text-right text-[10px] font-bold tracking-[.1em] uppercase text-brand-faint">#</div>
            <div className="pb-[11px] text-[10px] font-bold tracking-[.1em] uppercase text-brand-faint">Socio</div>
            {RANK_COLUMNS.map((c) => {
              const isActive = c.key === sort;
              // Primera pulsación descendente; la siguiente sobre la misma
              // columna invierte. Todo en la URL, como el resto del panel.
              const nextDir = isActive && dir === "desc" ? "asc" : "desc";
              return (
                <Link
                  key={c.key}
                  href={dashboardHref(params, {
                    rankSort: c.key === "mixed" ? undefined : c.key,
                    rankDir: nextDir === "desc" ? undefined : nextDir,
                  })}
                  scroll={false}
                  className={`pb-[11px] text-left text-[10px] font-bold tracking-[.1em] uppercase transition-colors duration-150 ${
                    isActive ? "text-brand-text" : "text-brand-faint hover:text-brand-text-2"
                  }`}
                >
                  {c.label}
                  {isActive && (dir === "desc" ? " ↓" : " ↑")}
                </Link>
              );
            })}

            {ranking.items.map((m, i) => (
              <div
                key={m.memberId}
                className="grid col-span-full grid-cols-subgrid items-center border-t border-tz-sand py-[11px]"
                style={{ animation: `tzRowIn .28s ${Math.min(i, 10) * 0.02}s both` }}
              >
                <div className={`text-right font-bold text-xs tabular-nums ${i < 3 ? "text-gold" : "text-brand-faint"}`}>
                  {i + 1}
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-7 h-7 flex-none rounded-full flex items-center justify-center text-[10.5px] font-bold ${
                      i < 3 ? "bg-gold-bg text-gold" : "bg-brand-bg text-brand-muted"
                    }`}
                  >
                    {initialsOf(m.memberName)}
                  </span>
                  <span className="font-semibold text-brand-text truncate">{m.memberName}</span>
                </div>
                <CellBar
                  pct={(m.ltvEuros / maxLtv) * 100}
                  color={SERIES.gold}
                  value={eur(m.ltvEuros * 100)}
                  valueWidth={56}
                />
                <CellBar pct={m.adherencePct} color={SERIES.ink} value={`${m.adherencePct}%`} valueWidth={38} />
                <div className="tabular-nums text-brand-text-2">{m.tenureDays} d</div>
                <CellBar
                  pct={(m.mixedScore / maxScore) * 100}
                  color={SERIES.goldSoft}
                  value={String(m.mixedScore)}
                  valueWidth={26}
                  bold
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelCard>
  );
}

/** Barra dentro de la celda: la métrica se compara sin salir de la fila. */
function CellBar({
  pct,
  color,
  value,
  valueWidth,
  bold = false,
}: {
  pct: number;
  color: string;
  value: string;
  valueWidth: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-[9px]">
      <div className="flex-1 h-[7px] rounded-pill bg-brand-bg overflow-hidden">
        <div
          className="h-full rounded-pill"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
        />
      </div>
      <span
        className={`flex-none text-right tabular-nums text-brand-text ${bold ? "font-bold" : "font-semibold"}`}
        style={{ width: valueWidth }}
      >
        {value}
      </span>
    </div>
  );
}

/* ---------- 9. Captación ---------- */

export async function FunnelPanel(props: PanelProps) {
  const leadCloseRate = await getLeadCloseRate(props.orgId, { centerId: props.centerId });
  const max = Math.max(1, ...Object.values(leadCloseRate.funnel));
  const rows = [
    ["Sin contactar", leadCloseRate.funnel.sinContactar],
    ["Seguimiento", leadCloseRate.funnel.seguimiento],
    ["Con valoración", leadCloseRate.funnel.conFechaValoracion],
    ["Cerrado", leadCloseRate.funnel.cerrado],
    ["No cerrado", leadCloseRate.funnel.noCerrado],
  ] as const;

  return (
    <PanelCard
      title="Embudo de leads"
      meta={leadCloseRate.closeRatePct != null ? `${leadCloseRate.closeRatePct}% de cierre` : "sin decisiones"}
      delay={0.5}
    >
      <div className="flex flex-col gap-2.5">
        {rows.map(([label, count], i) => (
          <BarRow
            key={label}
            label={label}
            labelWidth={118}
            pct={(count / max) * 100}
            color={FUNNEL_COLORS[i]}
            value={int(count)}
            valueWidth={22}
            valueColor={i === 3 ? SERIES.gold : i === 4 ? SERIES.critical : undefined}
            height={9}
            rounded="rounded-pill"
            delay={0.2 + i * 0.06}
          />
        ))}
      </div>
    </PanelCard>
  );
}

export async function ChannelsPanel(props: PanelProps) {
  const channels = await getAcquisitionChannels(props.orgId, optsOf(props));
  return (
    <PanelCard title="Canal de origen" meta="leads captados en el periodo" delay={0.54}>
      {channels.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin leads registrados todavía.</p>
      ) : (
        <DonutChart
          data={channels.map((c) => ({ label: c.channel, value: c.count }))}
          metric="leads"
          showTotal
          totalLabel="leads"
        />
      )}
    </PanelCard>
  );
}

export async function TopServicesPanel(
  props: PanelProps & { servicesOrderBy: "count" | "revenue"; params: DashboardParams }
) {
  const { orgId, servicesOrderBy, params } = props;
  const services = await getTopServices(orgId, { ...optsOf(props), orderBy: servicesOrderBy });
  const rows = services.slice(0, 5);
  const valueOf = (s: (typeof rows)[number]) =>
    servicesOrderBy === "revenue" ? Math.round(s.revenueEuros) : s.subscriptionsCount;
  const max = Math.max(1, ...rows.map(valueOf));

  return (
    <PanelCard
      title="Servicio más vendido"
      meta="altas e ingresos del periodo"
      delay={0.58}
      action={
        <div className="flex gap-[3px] bg-brand-bg rounded-pill p-[3px]">
          {(
            [
              ["count", "Altas"],
              ["revenue", "Ingresos"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={dashboardHref(params, { servicesOrderBy: value === "count" ? undefined : value })}
              scroll={false}
              className={`px-[11px] py-1 rounded-pill text-[11.5px] font-semibold transition-colors duration-150 ${
                servicesOrderBy === value ? "bg-brand-ink text-tz-bone" : "text-brand-muted hover:text-brand-text"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin planes configurados todavía.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {rows.map((s, i) => (
            <BarBlock
              key={s.planId}
              label={s.name}
              value={servicesOrderBy === "revenue" ? `${int(Math.round(s.revenueEuros))} €` : int(s.subscriptionsCount)}
              pct={(valueOf(s) / max) * 100}
              color={
                i === 0
                  ? servicesOrderBy === "revenue"
                    ? SERIES.gold
                    : SERIES.ink
                  : servicesOrderBy === "revenue"
                  ? SERIES.linen
                  : SERIES.sand
              }
              delay={0.2 + i * 0.06}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

/* ---------- 10. Quién es nuestro socio ---------- */

export async function MembersByServicePanel(props: PanelProps) {
  const services = await getMembersByService(props.orgId, optsOf(props));
  const total = services.reduce((s, x) => s + x.count, 0);
  const max = Math.max(1, ...services.map((s) => s.count));
  const colors = [SERIES.ink, SERIES.gold, SERIES.sand, SERIES.ink2, SERIES.linen];

  return (
    <PanelCard title="Socios por servicio" meta="activas" delay={0.62} size="sm">
      {services.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin suscripciones activas todavía.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {services.slice(0, 5).map((s, i) => (
            <BarBlock
              key={s.planId}
              label={s.name}
              value={`${int(s.count)} · ${Math.round((s.count / (total || 1)) * 100)}%`}
              pct={(s.count / max) * 100}
              color={colors[i % colors.length]}
              delay={0.2 + i * 0.06}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

export async function SexPanel(props: PanelProps) {
  const sex = await getSexDistribution(props.orgId, optsOf(props));
  return (
    <PanelCard title="Sexo" meta={`${sex.unspecified} sin especificar`} delay={0.66} size="sm">
      {sex.answered.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin datos de sexo todavía.</p>
      ) : (
        <DonutChart data={sex.answered.map((s) => ({ label: s.label, value: s.count }))} metric="socios" size={126} />
      )}
    </PanelCard>
  );
}

export async function OccupationPanel(props: PanelProps) {
  const demographics = await demographicsFor(props.orgId, props.centerId);
  const rows = demographics.topOccupations.slice(0, 5);
  const max = Math.max(1, ...rows.map((o) => o.count));
  const colors = [SERIES.ink, SERIES.ink2, SERIES.gold, SERIES.goldSoft, SERIES.sand];

  return (
    <PanelCard title="Nicho principal" meta={`muestra ${demographics.sampleSize}`} delay={0.7} size="sm">
      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin datos de ocupación todavía.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((o, i) => (
            <BarRow
              key={o.occupation}
              label={o.occupation}
              labelWidth={86}
              pct={(o.count / max) * 100}
              color={colors[i % colors.length]}
              value={int(o.count)}
              valueWidth={22}
              height={7}
              rounded="rounded-pill"
              delay={0.2 + i * 0.06}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

/* ---------- 11. Edad y objetivos ---------- */

export async function AgeBracketsPanel(props: PanelProps) {
  const [ageBrackets, demographics] = await Promise.all([
    getAgeBrackets(props.orgId, optsOf(props)),
    demographicsFor(props.orgId, props.centerId),
  ]);
  return (
    <PanelCard title="Franjas de edad" meta={`muestra ${demographics.sampleSize}`} delay={0.74} size="sm">
      <AgeBracketsChart data={ageBrackets} />
    </PanelCard>
  );
}

export async function GoalsPanel(props: PanelProps) {
  const goals = await getGoalsAggregate(props.orgId, optsOf(props));
  return (
    <PanelCard title="Objetivos" meta="abiertos en el periodo" delay={0.78} size="sm">
      <div className="grid grid-cols-2 gap-3.5">
        <GoalTile
          background="bg-brand-bg"
          color={SERIES.gold}
          value={
            <>
              {goals.achievedGoals}
              <span className="text-sm text-brand-muted">/{goals.totalGoals}</span>
            </>
          }
          label="Objetivos conseguidos"
        />
        <GoalTile background="bg-brand-bg" color="var(--color-brand-text)" value={goals.checkins} label="Check-ins recibidos" />
        <GoalTile background="bg-critical-bg" color={SERIES.critical} value={goals.stalledCount} label="Se sienten estancados" />
        <GoalTile background="bg-gold-bg" color={SERIES.gold} value={goals.wantsMoreCount} label="Piden «más»" />
      </div>
    </PanelCard>
  );
}

function GoalTile({
  background,
  color,
  value,
  label,
}: {
  background: string;
  color: string;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className={`rounded-xl px-3.5 py-[13px] ${background}`}>
      <div className="font-display font-bold text-[21px] leading-none tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[11.5px] text-brand-muted mt-1.5">{label}</div>
    </div>
  );
}
