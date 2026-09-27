"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BARRIO_METRICS,
  NO_ACTIVITY_FILL,
  NO_DATA_FILL,
  classifyMetric,
  colorForValueClassified,
  colorsByCode,
  dashedByCode,
  formatMetricValue,
  labelPriority,
  hasEmptyValues,
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
import { DASHBOARD_RANGES, rangeMeta } from "@/lib/dashboard-range";
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
const CELL_OPACITY = 0.74;

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
  // Bajo 1024 px el panel es una hoja inferior: recogida (≈40 % del alto) deja
  // ver el plano; ampliada, lee el ranking cómodo. Nunca se va del DOM.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // Bajo 1024 px los filtros de periodo y estado se pliegan tras un botón: eran
  // la segunda fila de controles que, con las demás, tapaba el mapa entero.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // La letra pequeña (cobertura y aproximaciones) tras un ⓘ en la leyenda.
  const [notesOpen, setNotesOpen] = useState(false);
  const [zoomSignal, setZoomSignal] = useState<{ dir: 1 | -1; signal: number } | null>(null);
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
    }`
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
  const empty = useMemo(() => hasEmptyValues(city.points, metric), [city, metric]);

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
      rangeLabel: rangeMeta(params.range),
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

  /** Los botones de métrica. Mismos en las dos vistas: es el mismo estado. */
  const metricButtons = BARRIO_METRICS.map((m) => {
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
        aria-pressed={m.key === metric}
        className={`shrink-0 px-2.5 min-h-[44px] rounded-[10px] text-[12px] font-bold tracking-[.01em] whitespace-nowrap transition-colors duration-150 ${
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
  });

  /** Las pastillas de métrica en su propia tarjeta (vista de tabla). */
  const metricPills = (
    <div data-tz-overlay className={`flex flex-wrap gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}>
      {metricButtons}
    </div>
  );

  /* E11-07 · Periodo y estado, los mismos ejes que el resto del panel. Sin
     ellos el mapa era acumulado histórico CON los rótulos del panel: "leads de
     este trimestre" en /dashboard y "leads desde siempre" aquí, sin que nada lo
     dijera. */
  const periodControls = (
    <>
      {/* E14-06 · Fuera el personalizado: necesita un selector de fechas, y
          `/mapa-barrios` no lo tiene. Una pastilla que navega a `range=custom`
          sin fechas se comporta como «Mes» sin decirlo, que es justo la clase
          de rótulo mentiroso que este lote vino a quitar. Mismo criterio que
          la barra de contexto del panel. */}
      {DASHBOARD_RANGES.filter((r) => r.id !== "custom").map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate({ range: r.id })}
          title={r.meta}
          aria-pressed={r.id === params.range}
          className={`shrink-0 px-3 min-h-[44px] rounded-[10px] text-[12.5px] font-bold whitespace-nowrap transition-colors duration-150 ${
            r.id === params.range ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-brand-bg"
          }`}
        >
          {r.label}
        </button>
      ))}
      <span className="w-px self-stretch bg-tz-sand mx-1 shrink-0" aria-hidden="true" />
      <label className="sr-only" htmlFor="tz-barrio-estado">
        Estado de los socios que se cuentan
      </label>
      <select
        id="tz-barrio-estado"
        value={params.estado}
        onChange={(e) => navigate({ estado: e.target.value as BarrioMapParams["estado"] })}
        className="shrink-0 min-h-[44px] rounded-[10px] bg-transparent px-2 text-[12.5px] font-bold text-brand-text-2"
      >
        {BARRIO_STATE_FILTERS.map((state) => (
          <option key={state} value={state}>
            {BARRIO_STATE_LABEL[state]}
          </option>
        ))}
      </select>
    </>
  );

  const periodFilters = (
    <div
      data-tz-overlay
      className={`self-start flex flex-wrap items-center gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}
    >
      {periodControls}
    </div>
  );

  /**
   * E14-10 · El conmutador de vista.
   *
   * **No va en el header, y eso costó un CI en rojo.** La columna derecha del
   * header es `shrink-0` y la del título `min-w-0`, así que todo lo que se
   * mete arriba se lo quita al título: con el conmutador ahí, a 1280 px el
   * subtítulo «… · Zaragoza · 2 centros» se quedaba a cero de ancho y el e2e
   * del selector de ciudad lo cazó.
   *
   * Vive con las pastillas de métrica, que es lo primero que se mira al entrar
   * y donde ya se decide qué se está leyendo. La historia pide que la tabla se
   * ENCUENTRE, no que esté en un sitio concreto.
   */
  const viewButtons = (
    <div role="group" aria-label="Vista" className="flex gap-1 shrink-0">
      {BARRIO_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => selectView(v)}
          aria-pressed={v === view}
          className={`px-2.5 min-h-[44px] rounded-[10px] text-[12px] font-bold tracking-[.01em] transition-colors duration-150 ${
            v === view ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-brand-bg"
          }`}
        >
          {BARRIO_VIEW_LABEL[v]}
        </button>
      ))}
    </div>
  );

  const viewSwitch = (
    <div data-tz-overlay className={`self-start ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}>
      {viewButtons}
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
   * El selector de ciudad para el hueco que el header deja por debajo de `md`:
   * ahí sus pastillas se ocultan y hasta ahora no había forma de cambiar de
   * ciudad en ningún ancho de móvil.
   */
  const citySelect = cities.length > 1 && (
    <div className={`md:hidden shrink-0 flex items-center gap-1 ${GLASS} rounded-[14px] p-[5px]`}>
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

  /** Qué significa el relleno gris en la métrica activa: no es lo mismo en todas. */
  const missingLabel =
    metric === "conv"
      ? "Sin demanda (ni leads ni clientes)"
      : metric === "dist" || metric === "opp"
        ? "Sin dato (falta situar un centro)"
        : "Sin dato";

  /**
   * La leyenda, con la pregunta como título.
   *
   * La pregunta era una pastilla negra suelta entre las métricas y los filtros
   * —la cuarta tarjeta apilada en la esquina—, y la leyenda repetía en su
   * cabecera el nombre de la métrica. Juntas dicen lo que hay que leer: "¿dónde
   * están mis clientes?" y, debajo, cómo se lee el color para contestarla.
   *
   * Bajo 1024 px va en la columna de controles; desde 1024 px, abajo a la
   * izquierda, lejos de la botonera y del panel.
   */
  const legend = (
    <div
      data-tz-overlay
      data-tz-legend
      className={`w-full max-w-[400px] ${GLASS} rounded-[14px] px-[15px] pt-3 pb-3 shadow-[0_14px_34px_-20px_rgba(29,29,28,.5)] lg:absolute lg:left-0 lg:bottom-[-56px] lg:w-[400px]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-[15px] leading-[1.2] text-brand-text">{def.question}</h2>
          <p className="text-[11px] font-semibold text-brand-muted mt-0.5">
            {def.label} · {def.note}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          aria-expanded={notesOpen}
          aria-controls="tz-barrio-notas"
          title="Cómo se ha hecho este mapa"
          className={`shrink-0 -mr-2 -mt-1.5 w-11 min-h-[44px] rounded-full grid place-items-center text-[13px] font-bold transition-colors ${
            notesOpen ? "text-brand-text" : "text-brand-muted hover:text-brand-text"
          }`}
        >
          <span aria-hidden="true" className="w-[18px] h-[18px] rounded-full border-[1.5px] border-current grid place-items-center text-[11px] leading-none">
            i
          </span>
          <span className="sr-only">Cómo se ha hecho este mapa</span>
        </button>
      </div>

      {/* E11-02 · Un testigo por escalón con su corte, no dos etiquetas de
          mínimo y máximo: con cuantiles los escalones no son equidistantes, y
          una leyenda de dos extremos haría creer que el color del medio es el
          valor del medio. Sin escalones repetidos: con pocos valores distintos
          hay menos escalones, no cifras dobles. */}
      {steps.length > 0 ? (
        <>
          <div className="flex gap-[3px] mt-2.5">
            {steps.map((step, i) => (
              <span
                key={i}
                className="flex-1 h-2.5 rounded-[3px]"
                style={{ background: step.color }}
                title={stepRangeLabel(step, metric)}
              />
            ))}
          </div>
          <div className="flex gap-[3px] mt-1">
            {steps.map((step, i) => (
              <span
                key={i}
                className="flex-1 text-[10px] font-bold text-brand-text-2 tz-nums text-center whitespace-nowrap overflow-hidden"
              >
                {i === steps.length - 1 && steps.length > 1 ? "≥ " : ""}
                {formatMetricValue(step.from, metric)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-2.5 text-[12px] font-semibold text-brand-text-2">
          Ningún barrio tiene actividad en este periodo. Prueba con un periodo más largo.
        </p>
      )}

      {/* Las claves solo se explican si hay algo que explicar. El gris y el
          casi transparente no son escalones: significan "no lo sé" y "aquí no
          hay nada" (E11-03), y sin su entrada se leerían como el valor más
          bajo. */}
      {(empty || missing || city.centers.length > 0) && (
        <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 pt-2.5 border-t border-tz-sand">
          {empty && (
            <LegendKey label="Sin actividad">
              <span className="w-[13px] h-[13px] rounded-[3px] border border-brand-border" style={{ background: NO_ACTIVITY_FILL }} />
            </LegendKey>
          )}
          {missing && (
            <LegendKey label={missingLabel}>
              <span className="w-[13px] h-[13px] rounded-[3px] border border-brand-border" style={{ background: NO_DATA_FILL }} />
            </LegendKey>
          )}
          {city.centers.length > 0 && (
            <>
              <LegendKey label="Centro">
                <span className="w-[11px] h-[11px] rounded-[50%_50%_50%_0] -rotate-45 bg-[#1d1d1c] border-[1.5px] border-white shadow-[0_0_0_1px_var(--color-brand-border)]" />
              </LegendKey>
              <LegendKey label={`${WALK_MINUTES} min andando`}>
                <span className="w-[13px] h-[13px] rounded-full border-[1.5px] border-dashed border-brand-muted bg-brand-muted/10" />
              </LegendKey>
            </>
          )}
        </div>
      )}

      {/* E11-05 · Cuánta gente NO está en el plano. Si falta alguien se dice
          siempre, a la vista; si están todos, junto al resto de la letra
          pequeña tras el ⓘ. */}
      {gaps && !notesOpen && (
        <p className="mt-2 text-[10.5px] font-medium leading-[1.45] text-brand-text-2">
          {coverageSentence(coverage.members, "socio", "socios")} {coverageSentence(coverage.leads, "lead", "leads")}
        </p>
      )}
      <div id="tz-barrio-notas" hidden={!notesOpen} className="mt-2 pt-2 border-t border-tz-sand text-[10.5px] font-medium leading-[1.45] text-brand-text-2">
        <p>
          {coverageSentence(coverage.members, "socio", "socios")} {coverageSentence(coverage.leads, "lead", "leads")}
        </p>
        <p className="mt-1 text-brand-muted">{note}</p>
      </div>
    </div>
  );

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
        zoomSignal={zoomSignal}
        panTo={panTo}
        onHover={setHovered}
        onSelect={selectBarrio}
        walkMinutes={WALK_MINUTES}
        showCenters={SHOW_CENTERS}
        cellOpacity={CELL_OPACITY}
      />

      {/* Franja de controles: una columna a la izquierda (qué se mira y cómo se
          lee) y el panel a la derecha. `pointer-events-none` en el contenedor
          para no robarle el mapa al ratón en el hueco entre tarjetas. */}
      <div className="absolute top-3 left-3 right-3 bottom-[72px] lg:top-5 lg:left-5 lg:right-5 lg:bottom-[76px] z-[500] flex items-start justify-between gap-4 pointer-events-none">
        <div data-tz-controls className="flex flex-col gap-2 min-w-0 max-w-full lg:max-w-[calc(100%-420px)] pointer-events-auto">
          {/* Una sola barra: vista y métrica, que son las dos decisiones de
              "qué estoy mirando". Antes eran cuatro tarjetas apiladas que se
              comían la esquina del mapa y tapaban barrios enteros. En móvil se
              desplaza en horizontal en vez de partirse en tres filas. */}
          <div
            data-tz-overlay
            className={`self-start max-w-full flex items-center gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)] overflow-x-auto tz-scroll-x lg:flex-wrap lg:overflow-visible`}
          >
            {viewButtons}
            <span className="w-px self-stretch bg-tz-sand mx-0.5 shrink-0" aria-hidden="true" />
            {metricButtons}
            <span className="w-px self-stretch bg-tz-sand mx-1 shrink-0 lg:hidden" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="tz-barrio-filtros"
              className={`lg:hidden shrink-0 px-3 min-h-[44px] rounded-[10px] text-[12.5px] font-bold whitespace-nowrap transition-colors duration-150 ${
                filtersOpen ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-brand-bg"
              }`}
            >
              Periodo · {DASHBOARD_RANGES.find((r) => r.id === params.range)?.label ?? ""}
            </button>
          </div>

          <div className="flex items-start gap-2 max-w-full">
            {citySelect}
            <div
              id="tz-barrio-filtros"
              data-tz-overlay
              className={`${filtersOpen ? "flex" : "hidden"} lg:flex self-start max-w-full items-center gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)] overflow-x-auto tz-scroll-x`}
            >
              {periodControls}
            </div>
          </div>

          {!available[metric] && (
            <div data-tz-overlay className={`self-start max-w-[360px] ${GLASS} rounded-xl px-[15px] py-[9px]`} role="status">
              <span className="text-[12px] font-semibold text-brand-text-2">
                No se puede calcular: ningún centro de tu organización tiene coordenadas. Añádelas en Organización →
                Centros.
              </span>
            </div>
          )}

          {legend}
        </div>

        {/* E11-04 · Este panel no desaparece bajo 1024 px: se convierte en una
            hoja inferior, recogida por defecto para que se vea el plano y con
            su botón para ampliarla. Antes, bajo ese ancho se perdían ranking y
            tarjeta de foco, y bajo 768 px además la leyenda — lo que quedaba
            era un mapa de colores sin escala, que no es un mapa degradado sino
            incorrecto. */}
        <div
          data-tz-overlay
          hidden={!panelOpen}
          data-tz-panel
          className={`absolute left-0 right-0 bottom-0 ${
            sheetExpanded ? "max-h-[78%]" : "max-h-[34%]"
          } lg:static lg:max-h-full lg:w-[380px] shrink-0 flex flex-col gap-3 min-h-0 pointer-events-auto transition-[max-height] duration-200`}
        >
          <div
            className={`hidden lg:block shrink-0 ${GLASS} rounded-card p-4 shadow-[0_18px_44px_-22px_rgba(29,29,28,.5)]`}
          >
            <div className="flex items-baseline justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  {focus ? "Barrio fijado" : hovered ? "Barrio señalado" : "Primero del ranking"}
                </div>
                <div className="font-display font-extrabold text-[19px] leading-[1.15] text-brand-text mt-[5px] truncate">
                  {spotlight.name}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className="font-display font-extrabold text-[28px] leading-none tz-nums"
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
            <div className="grid grid-cols-3 gap-1.5 mt-3.5">
              <SpotlightCell label="Clientes" value={String(spotlight.members)} />
              <SpotlightCell label="Leads" value={String(spotlight.leads)} />
              <SpotlightCell label="Conversión" value={formatMetricValue(metricValue(spotlight, "conv"), "conv")} />
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
              <span
                aria-hidden="true"
                className="w-[10px] h-[10px] rounded-[50%_50%_50%_0] -rotate-45 bg-[#1d1d1c] shrink-0"
              />
              <span className="text-xs text-brand-text-2">
                {spotlight.nearestCenter
                  ? `${spotlight.dist} km hasta ${spotlight.nearestCenter}`
                  : "Sin centros situados en el mapa"}
              </span>
            </div>
          </div>

          <div
            className={`flex-1 min-h-24 overflow-hidden flex flex-col ${GLASS} rounded-card p-3 pb-2 shadow-[0_18px_44px_-22px_rgba(29,29,28,.5)]`}
          >
            <div className="shrink-0 flex items-center justify-between gap-2 px-1">
              <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                Ranking · {def.label}
              </span>
              <span className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSheetExpanded((v) => !v)}
                  aria-expanded={sheetExpanded}
                  className="lg:hidden text-[10.5px] font-bold uppercase tracking-[.08em] text-brand-muted hover:text-brand-text min-h-[44px] px-2"
                >
                  {sheetExpanded ? "Reducir" : "Ampliar"}
                </button>
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
                compact
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

      {/* La botonera, con el +/− dentro: el control de zoom de Leaflet caía
          encima del ranking. */}
      <div
        data-tz-overlay
        className="absolute left-3 right-3 bottom-3 lg:left-auto lg:right-5 lg:bottom-5 z-[500] flex justify-end gap-2 overflow-x-auto tz-scroll-x"
      >
        <span className="hidden sm:contents">
          <MapButton onClick={exportCsv}>Exportar CSV</MapButton>
        </span>
        {!panelOpen && <MapButton onClick={() => setPanelOpen(true)}>Ver tabla</MapButton>}
        <MapButton onClick={() => setShowLabels((v) => !v)}>
          {showLabels ? "Ocultar nombres" : "Ver nombres"}
        </MapButton>
        <MapButton onClick={resetView}>↺ Encuadrar</MapButton>
        <div className="shrink-0 flex rounded-full border border-brand-border bg-brand-card/95 backdrop-blur-md overflow-hidden">
          <button
            type="button"
            onClick={() => setZoomSignal({ dir: 1, signal: Date.now() })}
            aria-label="Acercar"
            className="w-11 min-h-[44px] text-[17px] font-bold text-brand-text transition-colors duration-150 hover:bg-tz-black hover:text-tz-bone"
          >
            +
          </button>
          <span className="w-px bg-brand-border" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setZoomSignal({ dir: -1, signal: Date.now() })}
            aria-label="Alejar"
            className="w-11 min-h-[44px] text-[17px] font-bold text-brand-text transition-colors duration-150 hover:bg-tz-black hover:text-tz-bone"
          >
            −
          </button>
        </div>
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

function LegendKey({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[7px]">
      <span aria-hidden="true" className="shrink-0 grid place-items-center">
        {children}
      </span>
      <span className="text-[11px] font-semibold text-brand-text-2">{label}</span>
    </span>
  );
}

function SpotlightCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-brand-bg rounded-[10px] px-2.5 py-2 min-w-0">
      <div className="text-[9.5px] font-bold uppercase tracking-[.08em] text-brand-muted truncate">{label}</div>
      <div className={`font-display font-extrabold text-[16px] mt-0.5 tz-nums truncate ${className ?? "text-brand-text"}`}>
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
      className="shrink-0 whitespace-nowrap border border-brand-border bg-brand-card/95 backdrop-blur-md rounded-full px-[15px] min-h-[44px] font-display text-[11.5px] font-bold tracking-[.03em] text-brand-text transition-colors duration-150 hover:bg-tz-black hover:text-tz-bone"
    >
      {children}
    </button>
  );
}

export default BarrioMapView;
