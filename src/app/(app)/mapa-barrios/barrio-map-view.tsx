"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BARRIO_METRICS,
  NO_DATA_FILL,
  classifyMetric,
  colorForValueClassified,
  colorsByCode,
  dashedByCode,
  formatMetricValue,
  labelPriority,
  hasMissingValues,
  inksByCode,
  legendSteps,
  metricAvailable,
  metricDef,
  metricValue,
  readableMetricInk,
  sortByMetric,
  type BarrioCity,
  type BarrioMetric,
  type BarrioStat,
} from "@/lib/barrio-map";
import { DASHBOARD_RANGES } from "@/lib/dashboard-range";
import { HeaderActions, useHeaderSubtitle } from "../header-slot";
import BarrioMap from "./barrio-map-loader";
import { BarrioTable } from "./barrio-table";
import { coverageSentence, geometryNote, hasGaps, postalCodeNote, type MapCoverage } from "@/lib/barrio-coverage";
import { barrioExportFileName, barrioTableCsv } from "@/lib/barrio-export";
import {
  BARRIO_STATE_FILTERS,
  BARRIO_STATE_LABEL,
  BARRIO_VIEWS,
  BARRIO_VIEW_LABEL,
  barrioMapQuery,
  type BarrioMapParams,
  type BarrioView,
} from "@/lib/barrio-map-params";

/** Parámetros del mapa. Fijos hoy; el sitio natural de convertirlos en preferencia del centro. */
const WALK_MINUTES = 15;
const SHOW_CENTERS = true;
const CELL_OPACITY = 0.86;

const GLASS = "bg-brand-card/95 backdrop-blur-md border border-brand-border";

/**
 * Mapa de barrios a pantalla completa (RB-LEAD-010).
 *
 * El panel de control termina en una tarjeta con `leaflet.heat`: a escala
 * nacional —con centros en Zaragoza y Santander— los 19 barrios de Zaragoza se
 * funden en una sola mancha. Aquí cada barrio es un polígono con su borde, su
 * nombre y su cifra, y la misma geometría se recolorea con seis métricas: una
 * por cada pregunta que dirección marcó como necesaria.
 */
export function BarrioMapView({
  cities,
  roleLabel,
  coverage,
  params,
}: {
  cities: BarrioCity[];
  roleLabel: string;
  coverage: MapCoverage;
  params: BarrioMapParams;
}) {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * E11-07 · La URL es el estado, pero no toda ella cuesta lo mismo.
   *
   * Ciudad y métrica solo cambian lo que se PINTA: los datos ya están en el
   * cliente. Se llevan a la URL con `history.replaceState`, sin pasar por el
   * router — un `router.replace` volvería al servidor, dispararía `loading.tsx`,
   * desmontaría la vista y reconstruiría la geometría de Leaflet entera en cada
   * clic de pastilla. Se comprobó: los e2e se caían esperando a que la pantalla
   * dejara de parpadear.
   *
   * Periodo, estado y centro sí cambian el DATO, así que esos sí navegan.
   *
   * En los dos casos es `replace` y no `push`: cambiar de pastilla no es
   * navegar, y llenar el historial de veinte entradas hace que "atrás" deje de
   * volver al panel.
   */
  const initialCity = cities.some((c) => c.key === params.ciudad) ? (params.ciudad as string) : cities[0].key;
  const [cityKey, setCityKey] = useState(initialCity);
  const [metric, setMetric] = useState<BarrioMetric>(params.metrica);
  // E14-10 · La vista principal es estado de pantalla, no de dato: las filas y
  // los polígonos ya están en el cliente, así que cambiar de una a otra no
  // vuelve al servidor. Va por el mismo camino que ciudad y métrica.
  const [view, setView] = useState<BarrioView>(params.vista);

  const writeUrl = useCallback(
    (next: Partial<BarrioMapParams>) => {
      const query = barrioMapQuery({ ...params, ciudad: cityKey, metrica: metric, vista: view, ...next });
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [params, cityKey, metric, view, pathname]
  );

  /** Lo que exige volver al servidor: cambia el dato, no el color. */
  const navigate = useCallback(
    (next: Partial<BarrioMapParams>) => {
      const query = barrioMapQuery({ ...params, ciudad: cityKey, metrica: metric, vista: view, ...next });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, cityKey, metric, view, pathname, router]
  );

  const selectMetric = useCallback(
    (next: BarrioMetric) => {
      setMetric(next);
      writeUrl({ metrica: next });
    },
    [writeUrl]
  );

  const selectView = useCallback(
    (next: BarrioView) => {
      setView(next);
      writeUrl({ vista: next });
    },
    [writeUrl]
  );
  const [focus, setFocus] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [frameSignal, setFrameSignal] = useState(0);
  const [panTo, setPanTo] = useState<{ code: string; signal: number } | null>(null);
  // E11-04 · La tabla está SIEMPRE en el DOM y visible por defecto, en cualquier
  // ancho: es la única vía al dato para quien no usa ratón, y bajo 1024 px es la
  // única vía a secas. Se puede plegar para mirar el plano entero.
  const [panelOpen, setPanelOpen] = useState(true);
  const gaps = hasGaps(coverage);
  // E11-08 · Qué geometría se está pintando de verdad. La nota de la leyenda se
  // condiciona a esto: decir "teselación" cuando se están pintando los barrios
  // reales del ayuntamiento es tan falso como lo contrario.
  const [realGeometry, setRealGeometry] = useState(false);
  // E14-10 · En la vista de tabla no se pinta ningún contorno, así que la frase
  // de la teselación afirmaría algo que no está pasando. La aproximación que sí
  // sigue en pie leyendo una tabla de CP —la correspondencia CP→barrio— se dice
  // igual.
  const note = useMemo(
    () => (view === "tabla" ? postalCodeNote() : geometryNote(realGeometry)),
    [view, realGeometry]
  );

  const city = cities.find((c) => c.key === cityKey) ?? cities[0];
  const def = metricDef(metric);
  const centerLabel = params.centerId
    ? (cities.flatMap((c) => c.centers).find((c) => c.id === params.centerId)?.name ?? null)
    : null;

  useHeaderSubtitle(
    `${roleLabel} · ${city.label} · ${city.centers.length} ${city.centers.length === 1 ? "centro" : "centros"} · ${
      DASHBOARD_RANGES.find((r) => r.id === params.range)?.meta ?? ""
    } · RB-LEAD-010`
  );

  const classification = useMemo(() => classifyMetric(city.points, metric), [city, metric]);
  const colors = useMemo(() => colorsByCode(city.points, metric), [city, metric]);
  // E11-06 · La tinta del rótulo sale del MISMO relleno que pinta la celda, así
  // que no pueden discrepar. `readableMetricInk()` ya resolvía esto y solo se
  // usaba en la tarjeta de foco.
  const inks = useMemo(() => inksByCode(colors), [colors]);
  const dashed = useMemo(() => dashedByCode(city.points, metric), [city, metric]);
  const values = useMemo(
    () =>
      Object.fromEntries(
        city.points.map((p) => [p.code, formatMetricValue(metricValue(p, metric), metric)])
      ) as Record<string, string>,
    [city, metric]
  );
  const steps = useMemo(() => legendSteps(classification), [classification]);
  const priority = useMemo(() => labelPriority(city.points, metric), [city, metric]);
  const rows = useMemo(() => sortByMetric(city.points, metric), [city, metric]);
  // E11-03 · Qué se puede calcular en esta ciudad y qué no. `dist` y `opp`
  // dependen de que la organización tenga algún centro SITUADO, y sin él la
  // agregación devuelve ceros que no significan "está en la puerta" sino "no lo
  // sé".
  const available = useMemo(
    () => Object.fromEntries(BARRIO_METRICS.map((m) => [m.key, metricAvailable(city.points, m.key)])),
    [city]
  ) as Record<BarrioMetric, boolean>;
  const missing = useMemo(() => hasMissingValues(city.points, metric), [city, metric]);

  // El barrio de la tarjeta: el que se está señalando, si no el fijado, si no el
  // primero del ranking (que es el que la métrica pone por delante).
  const spotlight: BarrioStat =
    city.points.find((p) => p.code === (hovered ?? focus)) ?? rows[0] ?? city.points[0];

  const selectCity = (key: string) => {
    setCityKey(key);
    setFocus(null);
    setHovered(null);
    writeUrl({ ciudad: key });
  };

  /**
   * E11-10 · Conmutador, no interruptor: un segundo toque sobre el mismo barrio
   * lo desenfoca. En táctil es la única salida —no hay `mouseout` que deshaga el
   * foco— y con ratón tampoco estorba.
   */
  const selectBarrio = (code: string) => {
    if (code === focus) {
      setFocus(null);
      setHovered(null);
      return;
    }
    setFocus(code);
    setHovered(code);
    setPanTo({ code, signal: Date.now() });
  };

  const resetView = () => {
    setFocus(null);
    setHovered(null);
    setFrameSignal((n) => n + 1);
  };

  /**
   * E14-10 · La descarga, con las filas que ya están en pantalla y en el mismo
   * orden. El contenido lo arma `barrio-export.ts` (módulo puro y probado); lo
   * único que vive aquí es el gesto del navegador.
   */
  const exportCsv = useCallback(() => {
    const csv = barrioTableCsv(rows, {
      cityLabel: city.label,
      rangeLabel: DASHBOARD_RANGES.find((r) => r.id === params.range)?.meta ?? params.range,
      stateLabel: BARRIO_STATE_LABEL[params.estado],
      centerLabel,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = barrioExportFileName(city.label, new Date());
    link.click();
    // Sin esto el Blob se queda vivo hasta que se recarga la pestaña, y esta
    // pantalla se deja abierta durante horas.
    URL.revokeObjectURL(url);
  }, [rows, city.label, params.range, params.estado, centerLabel]);

  /** Las pastillas de métrica. Mismas en las dos vistas: es el mismo estado. */
  const metricPills = (
    <div
      data-tz-overlay
      className={`flex flex-wrap gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}
    >
      {BARRIO_METRICS.map((m) => {
        const enabled = available[m.key];
        return (
          <button
            key={m.key}
            type="button"
            disabled={!enabled}
            onClick={() => selectMetric(m.key)}
            // E11-03 · Sin centros situados esta métrica no se puede calcular.
            // Se deshabilita CON explicación: un botón muerto y sin motivo se
            // lee como una avería.
            title={enabled ? m.question : "Ningún centro de tu organización tiene coordenadas: sin ellas no se puede calcular esta métrica."}
            className={`px-[15px] min-h-[44px] rounded-[10px] text-[12.5px] font-bold tracking-[.01em] whitespace-nowrap transition-colors duration-150 ${
              !enabled
                ? "text-brand-faint cursor-not-allowed line-through decoration-1"
                : m.key === metric
                  ? "bg-tz-black text-tz-bone"
                  : "text-brand-text-2 hover:bg-brand-bg"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );

  /* E11-07 · Periodo y estado, los mismos ejes que el resto del panel. Sin
     ellos el mapa era acumulado histórico CON los rótulos del panel: "leads de
     este trimestre" en /dashboard y "leads desde siempre" aquí, sin que nada lo
     dijera. */
  const periodFilters = (
    <div
      data-tz-overlay
      className={`self-start flex flex-wrap items-center gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}
    >
      {DASHBOARD_RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate({ range: r.id })}
          title={r.meta}
          className={`px-3.5 min-h-[44px] rounded-[10px] text-[12.5px] font-bold transition-colors duration-150 ${
            r.id === params.range ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-brand-bg"
          }`}
        >
          {r.label}
        </button>
      ))}
      <span className="w-px self-stretch bg-tz-sand mx-1" aria-hidden="true" />
      <label className="sr-only" htmlFor="tz-barrio-estado">
        Estado de los socios que se cuentan
      </label>
      <select
        id="tz-barrio-estado"
        value={params.estado}
        onChange={(e) => navigate({ estado: e.target.value as BarrioMapParams["estado"] })}
        className="min-h-[44px] rounded-[10px] bg-transparent px-2 text-[12.5px] font-bold text-brand-text-2"
      >
        {BARRIO_STATE_FILTERS.map((state) => (
          <option key={state} value={state}>
            {BARRIO_STATE_LABEL[state]}
          </option>
        ))}
      </select>
    </div>
  );

  /**
   * E14-10 · El conmutador de vista, en la cabecera y a cualquier ancho.
   *
   * Es la historia entera en un control: la tabla de CP con clientes, leads y
   * conversión existía desde E11-04 y negocio la pidió igualmente, porque
   * estaba donde no se busca — dentro del panel lateral del plano, rotulada
   * como su alternativa accesible. Aquí arriba, al lado del selector de ciudad,
   * es una de las dos formas de leer esta pantalla y no el plan B de la otra.
   */
  /**
   * E14-10 · El conmutador de vista.
   *
   * **No va en el header, y eso costó un CI en rojo.** La columna derecha del
   * header es `shrink-0` y la del título `min-w-0`, así que todo lo que se
   * mete arriba se lo quita al título: con el conmutador ahí, a 1280 px el
   * subtítulo «… · Zaragoza · 2 centros» se quedaba a cero de ancho y el e2e
   * del selector de ciudad lo cazó. Es exactamente lo que ya advertía el
   * comentario de esta pantalla sobre los filtros de periodo, escrito por el
   * mismo motivo.
   *
   * Vive con las pastillas de métrica, que es lo primero que se mira al entrar
   * y donde ya se decide qué se está leyendo. La historia pide que la tabla se
   * ENCUENTRE, no que esté en un sitio concreto.
   */
  const viewSwitch = (
    <div
      data-tz-overlay
      role="group"
      aria-label="Vista"
      className={`self-start flex gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}
    >
      {BARRIO_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => selectView(v)}
          aria-pressed={v === view}
          className={`px-[15px] min-h-[44px] rounded-[10px] text-[12.5px] font-bold tracking-[.01em] transition-colors duration-150 ${
            v === view ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-brand-bg"
          }`}
        >
          {BARRIO_VIEW_LABEL[v]}
        </button>
      ))}
    </div>
  );

  // El header se queda EXACTAMENTE como estaba: solo el selector de ciudad.
  const header = cities.length > 1 && (
    <HeaderActions>
      <div className="hidden md:flex gap-[5px] bg-brand-bg border border-brand-border rounded-full p-1">
        {cities.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => selectCity(c.key)}
            className={`px-4 min-h-[44px] rounded-full text-[12.5px] font-semibold transition-all duration-150 ${
              c.key === city.key ? "bg-tz-black text-tz-bone" : "text-brand-muted hover:text-brand-text"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </HeaderActions>
  );

  /**
   * El selector de ciudad de la barra de la tabla, para el hueco que el header
   * deja por debajo de `md`: ahí sus pastillas se ocultan y hasta ahora no
   * había forma de cambiar de ciudad en ningún ancho de móvil.
   */
  const citySelect = cities.length > 1 && (
    <div className={`md:hidden flex items-center gap-1 ${GLASS} rounded-[14px] p-[5px]`}>
      <label className="sr-only" htmlFor="tz-barrio-ciudad">
        Ciudad
      </label>
      <select
        id="tz-barrio-ciudad"
        value={city.key}
        onChange={(e) => selectCity(e.target.value)}
        className="min-h-[44px] rounded-[10px] bg-transparent px-2 text-[12.5px] font-bold text-brand-text-2"
      >
        {cities.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );

  const exportButton = (
    <button
      type="button"
      onClick={exportCsv}
      className="text-xs font-semibold text-brand-text-2 border border-brand-border bg-brand-card rounded-lg px-3 py-2 min-h-[44px] transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink"
    >
      Exportar CSV
    </button>
  );

  if (view === "tabla") {
    return (
      <div data-full-bleed className="absolute inset-0 flex flex-col gap-3 p-5 overflow-auto tz-scroll">
        {header}

        <div className="flex flex-wrap items-start gap-2.5">
          {viewSwitch}
          {metricPills}
          {periodFilters}
          {citySelect}
          {exportButton}
        </div>

        {/* La tabla, con las SIETE métricas a la vez: es lo que el plano no
            puede hacer, porque solo pinta una. La cabecera de cada métrica
            sigue ordenando y cambiando la métrica activa, que es la que el mapa
            usará al volver. */}
        <div className={`flex-1 min-h-0 ${GLASS} rounded-card p-4 overflow-auto tz-scroll`}>
          <BarrioTable
            rows={rows}
            metric={metric}
            colors={colors}
            hovered={hovered}
            focus={focus}
            onMetric={selectMetric}
            onHover={setHovered}
            onSelect={selectBarrio}
            geometryNote={note}
          />
        </div>

        {/* E11-05 · Cuánta gente NO está en el recuento. Vale igual leyendo una
            tabla que mirando el plano: si el CP no está sembrado, esa persona
            no sale en ninguna fila. */}
        <p className={`text-[10.5px] font-medium leading-[1.45] px-1 ${gaps ? "text-brand-text-2" : "text-brand-muted"}`}>
          {coverageSentence(coverage.members, "socio", "socios")}{" "}
          {coverageSentence(coverage.leads, "lead", "leads")}
        </p>
      </div>
    );
  }

  return (
    <div data-full-bleed className="absolute inset-0">
      {/* El header solo lleva el selector de ciudad, como siempre. Los filtros
          de periodo y estado —y el conmutador de vista de E14-10— viven en el
          panel del mapa: metidos aquí arriba estrujaban la columna del título
          hasta dejarla a cero de ancho —los e2e lo cazaron, dos veces— y el
          header no es de esta pantalla. */}
      {header}

      <BarrioMap
        cityKey={city.key}
        onGeometry={setRealGeometry}
        points={city.points}
        centers={city.centers}
        colors={colors}
        inks={inks}
        dashed={dashed}
        values={values}
        priority={priority}
        hovered={hovered}
        focus={focus}
        showLabels={showLabels}
        frameSignal={frameSignal}
        panTo={panTo}
        onHover={setHovered}
        onSelect={selectBarrio}
        walkMinutes={WALK_MINUTES}
        showCenters={SHOW_CENTERS}
        cellOpacity={CELL_OPACITY}
      />

      {/* Franja superior: métricas y pregunta a la izquierda, foco y ranking a la
          derecha. `pointer-events-none` en el contenedor para no robarle el mapa
          al ratón en el hueco entre tarjetas. */}
      <div className="absolute top-5 left-5 right-5 bottom-[76px] z-[500] flex items-start justify-between gap-4 pointer-events-none">
        <div className="flex flex-col gap-2.5 min-w-0 pointer-events-auto">
          {viewSwitch}
          {metricPills}
          <div
            data-tz-overlay
            className="self-start bg-tz-black rounded-xl px-[15px] py-[9px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.5)]"
          >
            <span className="text-[13px] font-semibold text-tz-bone">{def.question}</span>
          </div>

          {periodFilters}
          {!available[metric] && (
            <div
              data-tz-overlay
              className={`self-start max-w-[360px] ${GLASS} rounded-xl px-[15px] py-[9px]`}
              role="status"
            >
              <span className="text-[12px] font-semibold text-brand-text-2">
                No se puede calcular: ningún centro de tu organización tiene coordenadas. Añádelas en Organización →
                Centros.
              </span>
            </div>
          )}
        </div>

        {/* E11-04 · Este panel ya no desaparece bajo 1024 px: se convierte en una
            hoja inferior. Antes, bajo ese ancho se perdían ranking y tarjeta de
            foco, y bajo 768 px además la leyenda — lo que quedaba era un mapa de
            colores sin escala, que no es un mapa degradado sino incorrecto. */}
        <div
          data-tz-overlay
          hidden={!panelOpen}
          className="absolute left-0 right-0 bottom-0 max-h-[52%] lg:static lg:max-h-full lg:w-[420px] shrink-0 flex flex-col gap-3 min-h-0 pointer-events-auto"
        >
          <div
            className={`hidden lg:block shrink-0 ${GLASS} rounded-card p-[18px] pb-4 shadow-[0_18px_44px_-22px_rgba(29,29,28,.5)]`}
          >
            <div className="flex items-baseline justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  Barrio en foco
                </div>
                <div className="font-display font-extrabold text-[19px] leading-[1.15] text-brand-text mt-[5px]">
                  {spotlight.name}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className="font-display font-extrabold text-[26px] leading-none tz-nums"
                  style={{ color: readableMetricInk(colorForValueClassified(metricValue(spotlight, metric), classification)) }}
                >
                  {formatMetricValue(metricValue(spotlight, metric), metric)}
                </div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-brand-muted mt-1">
                  {def.label}
                </div>
              </div>
            </div>

            {/* E11-09 · Altas y bajas del mismo periodo, en la misma tarjeta y
                sobre el mismo plano: un barrio puede estar creciendo en altas
                mientras se desangra por detrás, y con `trend` sola eso no se
                ve. */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <SpotlightCell label="Clientes" value={String(spotlight.members)} />
              <SpotlightCell label="Leads" value={String(spotlight.leads)} />
              <SpotlightCell label="Conversión" value={`${spotlight.conv}%`} />
              <SpotlightCell
                label="Altas 90 d"
                value={formatMetricValue(spotlight.trend, "trend")}
                className={
                  spotlight.trend > 0 ? "text-good" : spotlight.trend < 0 ? "text-critical" : "text-brand-text-2"
                }
              />
              <SpotlightCell
                label="Bajas"
                value={formatMetricValue(metricValue(spotlight, "churn"), "churn")}
                className={(spotlight.churn ?? 0) > 0 ? "text-critical" : "text-brand-text-2"}
              />
              <SpotlightCell label="Distancia" value={formatMetricValue(metricValue(spotlight, "dist"), "dist")} />
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-tz-sand">
              <span className="w-[9px] h-[9px] rounded-[3px] bg-tz-black shrink-0" />
              <span className="text-xs text-brand-text-2">
                {spotlight.nearestCenter
                  ? `${spotlight.dist} km hasta ${spotlight.nearestCenter}`
                  : "Sin centros situados en el mapa"}
              </span>
            </div>
          </div>

          <div
            className={`flex-1 min-h-24 overflow-hidden flex flex-col ${GLASS} rounded-card p-3.5 pb-2.5 shadow-[0_18px_44px_-22px_rgba(29,29,28,.5)]`}
          >
            <div className="shrink-0 flex items-baseline justify-between gap-2 px-1 pb-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                Ranking · {def.label}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {/* E14-10 · La segunda vía a la vista completa, desde la propia
                    tabla recortada: quien ya está leyéndola aquí es exactamente
                    quien quiere verla entera. */}
                <button
                  type="button"
                  onClick={() => selectView("tabla")}
                  className="text-[10.5px] font-bold uppercase tracking-[.08em] text-brand-muted hover:text-brand-text min-h-[44px] px-2"
                >
                  Ver entera
                </button>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="text-[10.5px] font-bold uppercase tracking-[.08em] text-brand-muted hover:text-brand-text min-h-[44px] px-2"
                >
                  Ocultar
                </button>
              </span>
            </div>
            {/* La altura tiene que encoger, no ser fija: en una ventana de 13" la
                pila entera no cabe y sin esto las últimas filas son inalcanzables. */}
            <div className="tz-scroll flex-1 min-h-0 overflow-auto pr-1">
              <BarrioTable
                rows={rows}
                metric={metric}
                colors={colors}
                hovered={hovered}
                focus={focus}
                onMetric={selectMetric}
                onHover={setHovered}
                onSelect={selectBarrio}
                geometryNote={note}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:flex absolute left-5 bottom-5 z-[500] flex-col gap-2.5 max-w-[400px]">
        <div
          data-tz-overlay
          className={`${GLASS} rounded-[14px] px-[15px] pt-[13px] pb-3 shadow-[0_14px_34px_-20px_rgba(29,29,28,.5)]`}
        >
          <div className="flex items-baseline gap-2.5 whitespace-nowrap">
            <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">{def.label}</span>
            <span className="flex-1 h-px bg-tz-sand" />
            <span className="text-[11px] font-semibold text-brand-text-2">{def.note}</span>
          </div>
          {/* E11-02 · Los SIETE cortes, no dos etiquetas de mínimo y máximo.
              Con cuantiles los escalones no son equidistantes, y una leyenda de
              dos extremos le haría creer a quien la lee que el color del medio
              es el valor del medio — exactamente lo contrario de lo que pasa en
              una distribución sesgada. */}
          <div className="flex gap-[3px] mt-[9px]">
            {steps.map((step, i) => (
              <span
                key={i}
                className="flex-1 h-3 rounded-[3px]"
                style={{ background: step.color }}
                title={stepRangeLabel(step, metric)}
              />
            ))}
          </div>
          <div className="flex gap-[3px] mt-1.5">
            {steps.map((step, i) => (
              <span
                key={i}
                className="flex-1 text-[9.5px] font-bold text-brand-text-2 tz-nums text-center whitespace-nowrap overflow-hidden"
              >
                {formatMetricValue(step.from, metric)}
              </span>
            ))}
          </div>
          {/* E11-03 · El gris no es un escalón más: significa "no se puede
              calcular", y sin su entrada en la leyenda quien mira lo lee como
              el valor más bajo. */}
          {missing && (
            <div className="flex items-center gap-[7px] mt-[11px] pt-2.5 border-t border-tz-sand">
              <span
                className="w-[13px] h-[13px] rounded-[3px] shrink-0 border border-brand-border"
                style={{ background: NO_DATA_FILL }}
              />
              <span className="text-[11px] font-semibold text-brand-text-2">Sin dato (falta situar un centro)</span>
            </div>
          )}

          {/* Las dos claves solo se explican si hay algo que explicar: una ciudad
              sin centros situados no pinta ni cuadradito ni anillo. */}
          {city.centers.length > 0 && (
            <div className="flex items-center gap-4 mt-[11px] pt-2.5 border-t border-tz-sand">
              <div className="flex items-center gap-[7px]">
                <span className="w-[13px] h-[13px] rounded-[4px] bg-tz-black border-[2.5px] border-tz-bone shadow-[0_0_0_1px_var(--color-brand-border)] shrink-0" />
                <span className="text-[11px] font-semibold text-brand-text-2">Centro Training Zone</span>
              </div>
              <div className="flex items-center gap-[7px]">
                <span className="w-4 h-[13px] rounded-[3px] border-[1.5px] border-dashed border-brand-muted shrink-0" />
                <span className="text-[11px] font-semibold text-brand-text-2">{WALK_MINUTES} min andando</span>
              </div>
            </div>
          )}
        </div>
        {/* E11-05 · Cuánta gente NO está en el plano. El `FROM PostalCodeArea`
            descarta cualquier CP que no esté sembrado —un socio de Madrid con
            CP 28001 no sale en ningún sitio— y hasta ahora el mapa no lo decía:
            dirección miraba un plano sin saber si valía por el 90 % de su
            cartera o por el 40 %. */}
        <div
          data-tz-overlay
          className={`text-[10.5px] font-medium leading-[1.45] px-1 ${
            gaps ? "text-brand-text-2" : "text-brand-muted"
          }`}
        >
          <p>
            {coverageSentence(coverage.members, "socio", "socios")}{" "}
            {coverageSentence(coverage.leads, "lead", "leads")}
          </p>
          <p className="mt-1 text-brand-muted">{note}</p>
        </div>
      </div>

      <div data-tz-overlay className="absolute right-5 bottom-5 z-[500] flex gap-2">
        <MapButton onClick={exportCsv}>Exportar CSV</MapButton>
        {!panelOpen && <MapButton onClick={() => setPanelOpen(true)}>Ver tabla</MapButton>}
        <MapButton onClick={() => setShowLabels((v) => !v)}>
          {showLabels ? "Ocultar nombres" : "Ver nombres"}
        </MapButton>
        <MapButton onClick={resetView}>↺ Encuadrar</MapButton>
      </div>

      {/* E11-04 · El cambio de foco se anuncia. Sin esto, seleccionar una fila
          mueve el mapa y recolorea media pantalla sin que quien no la ve se
          entere de nada. */}
      <p aria-live="polite" className="sr-only">
        {`Barrio en foco: ${spotlight.name}. ${def.label}: ${formatMetricValue(
          metricValue(spotlight, metric),
          metric
        )}.`}
      </p>
    </div>
  );
}

/** «12 – 27» / «≥ 27»: lo que representa un escalón, para el `title` de su testigo. */
function stepRangeLabel(step: { from: number; to: number | null }, metric: BarrioMetric): string {
  const from = formatMetricValue(step.from, metric);
  return step.to === null ? `≥ ${from}` : `${from} – ${formatMetricValue(step.to, metric)}`;
}

function SpotlightCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-brand-bg rounded-[11px] px-[11px] py-[9px]">
      <div className="text-[10px] font-bold uppercase tracking-[.08em] text-brand-muted">{label}</div>
      <div className={`font-display font-extrabold text-[17px] mt-0.5 tz-nums ${className ?? "text-brand-text"}`}>
        {value}
      </div>
    </div>
  );
}

function MapButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // E11-10 · 44 px de alto: el objetivo táctil mínimo. Estos botones medían
      // ≈34 px, las métricas ≈35 y los de ciudad ≈31 — todos por debajo, y en la
      // pantalla que más se mira desde una tableta en la sala.
      className="border border-brand-border bg-brand-card/95 backdrop-blur-md rounded-full px-[15px] min-h-[44px] font-display text-[11.5px] font-bold tracking-[.03em] text-brand-text transition-colors duration-150 hover:bg-tz-black hover:text-tz-bone"
    >
      {children}
    </button>
  );
}

export default BarrioMapView;
