"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BrandLoader, usePacedLoader, type LoaderStep } from "@/components/ui/brand-loader";

/**
 * Velo de marca al cambiar de centro o de periodo en el panel de control.
 *
 * El problema que resuelve: al cambiar solo los `searchParams` de la misma
 * ruta, `loading.tsx` no entra en juego —es un límite de segmento, y el
 * segmento no cambia— así que React mantiene el panel viejo en pantalla hasta
 * que el nuevo está entero. No hay skeleton, no hay barra: durante ese rato
 * parece que el clic no ha hecho nada. `RouteProgress` tampoco ayuda, porque se
 * rearma con el `pathname` y aquí el pathname es el mismo.
 *
 * La señal de "estoy navegando" sale de `useLinkStatus`, que es justo para lo
 * que la documentación de Next lo recomienda: un tramo lento detectado. El hook
 * exige vivir DENTRO del `<Link>`, así que cada enlace lleva una sonda que no
 * pinta nada y reporta su estado al proveedor.
 *
 * Sobre el progreso: `pending` es un booleano. Una navegación RSC es una única
 * petición sin canal de progreso, así que el tiempo que falta NO se puede
 * saber; lo que sí es exacto es el tiempo transcurrido y el instante del final.
 * El nivel avanza sobre una estimación —y se para al 92 % del tramo vivo, sin
 * prometer más— calibrada con los cambios de filtro anteriores de este mismo
 * navegador (ver `readSamples`), que es lo más cerca del entorno real que se
 * puede estar sin inventar nada.
 */

/**
 * Los cuatro tramos de una recarga del panel, con el peso medido de cada uno
 * (porcentaje del tiempo de consultas, sobre los datos de demo):
 * KPIs + insight 53 %, ocupación 18 %, retención/ranking/captación 16 %, y el
 * resto —mapa, demografía y el propio render— cierra.
 */
export const DASHBOARD_STEPS: LoaderStep[] = [
  { label: "Consultando socios, cobros y sesiones", weight: 3.2 },
  { label: "Recalculando ocupación y actividad", weight: 1.1 },
  { label: "Rehaciendo retención, ranking y captación", weight: 1.0 },
  { label: "Pintando el mapa y las gráficas", weight: 1.2 },
];

/**
 * Antes de enseñar el velo. Un cambio de filtro que se resuelve en menos de esto
 * se percibe como inmediato, y taparlo con un velo a pantalla completa que
 * aparece y se va es peor que no poner nada: el parpadeo molesta más que la
 * espera. Medido en local, con Postgres al lado, el panel entero se recarga en
 * 250-380 ms, así que ahí no sale nunca; en un entorno con la base remota —que
 * es donde se notaba la espera— sí.
 */
const SHOW_AFTER_MS = 400;

/**
 * Lo que el velo se queda con el nivel lleno y el check. Muy por debajo de los
 * 1150 ms de mesociclos a propósito: aquí la espera es de menos de un segundo y
 * un remate largo haría el cambio de filtro más lento de lo que realmente es.
 */
const OUTRO_MS = 260;

const STORAGE_KEY = "tz:dashboard-filter-ms";
/** Cuántas navegaciones se recuerdan para estimar. Las suficientes para que una lenta no mande. */
const SAMPLE_SIZE = 7;
/** Sin historial todavía: una primera apuesta prudente. */
const DEFAULT_EXPECTED_MS = 1200;
const MIN_EXPECTED_MS = 500;
const MAX_EXPECTED_MS = 20_000;

const clamp = (ms: number) => Math.min(MAX_EXPECTED_MS, Math.max(MIN_EXPECTED_MS, ms));

/** Mediana y no media: una navegación con la base fría no debe desplazar la estimación. */
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function readSamples(): number[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  } catch {
    // Ventana privada, almacenamiento bloqueado, JSON corrupto: se estima sin
    // historial. Nunca puede tumbar el panel por no poder leer una preferencia.
    return [];
  }
}

function writeSample(ms: number) {
  try {
    const next = [...readSamples(), ms].slice(-SAMPLE_SIZE);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ídem: guardar la muestra es una mejora, no un requisito. */
  }
}

/** Contexto que usa la sonda de dentro de cada `<Link>` para avisar al velo. */
const ReportPending = createContext<(id: string, pending: boolean) => void>(() => {});

/** No pinta nada: solo traduce el `pending` de SU enlace a una señal del proveedor. */
function PendingProbe({ id }: { id: string }) {
  const { pending } = useLinkStatus();
  const report = useContext(ReportPending);

  useEffect(() => {
    report(id, pending);
    // Al desmontarse (la navegación acabó y el enlace se recrea) deja de contar.
    return () => report(id, false);
  }, [id, pending, report]);

  return null;
}

export function DashboardFilterLoader({ children }: { children: React.ReactNode }) {
  // Un Set y no un booleano: cada enlace reporta el suyo, y así el `false` del
  // que se acaba de soltar no borra el `true` del que se acaba de pulsar.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  // La estimación vive en una ref y no en el estado: cambiarla no tiene que
  // repintar nada (solo se lee al arrancar el velo), y escribir estado desde el
  // cuerpo de un efecto es justo lo que el compilador de React no admite.
  const expectedMs = useRef(DEFAULT_EXPECTED_MS);
  const startedAt = useRef<number | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ¿Llegó a verse el velo? Decide entre rematar la animación o cortarla en seco. */
  const shown = useRef(false);

  // Se pasa como función para que la duración esperada se lea en el instante de
  // arrancar y no en el render: entre uno y otro puede haberse recalibrado.
  const readExpected = useCallback(() => expectedMs.current, []);
  const loader = usePacedLoader(DASHBOARD_STEPS, readExpected, { outroMs: OUTRO_MS });
  const { start, finish, abort } = loader;

  // El historial se lee una vez al montar: `localStorage` es síncrono y no tiene
  // sitio en el render de un componente que además se pinta en servidor.
  useEffect(() => {
    const samples = readSamples();
    if (samples.length) expectedMs.current = clamp(median(samples));
  }, []);

  const report = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      if (prev.has(id) === pending) return prev;
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const pending = pendingIds.size > 0;

  useEffect(() => {
    if (pending) {
      startedAt.current = Date.now();
      // El velo no sale de inmediato: solo si la navegación pasa de SHOW_AFTER_MS.
      showTimer.current = setTimeout(() => {
        shown.current = true;
        start();
      }, SHOW_AFTER_MS);
      return;
    }

    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (startedAt.current !== null) {
      // La duración real de ESTA navegación alimenta la estimación de la
      // siguiente: la barra se calibra con el entorno de quien mira (su Render,
      // su base, sus datos) y no con la máquina donde se escribió esto.
      //
      // Solo cuentan las navegaciones que llegaron a enseñar el velo. Una de
      // 240 ms es un dato real, pero no es el que hay que ritmar: metiéndola en
      // la mediana, la estimación cae al suelo y la siguiente espera larga se
      // come los cuatro tramos en medio segundo para luego quedarse parada.
      const elapsed = Date.now() - startedAt.current;
      startedAt.current = null;
      if (shown.current) {
        writeSample(elapsed);
        const samples = readSamples();
        if (samples.length) expectedMs.current = clamp(median(samples));
      }
    }
    // Si el velo llegó a verse se remata (nivel al 100 %, check y salida corta);
    // si no llegó a aparecer no hay nada que rematar y se corta en seco.
    const wasShown = shown.current;
    shown.current = false;
    if (wasShown) finish(() => {});
    else abort();
  }, [pending, start, finish, abort]);

  // El temporizador pendiente no puede sobrevivir al desmontaje: dispararía
  // `start()` sobre un componente que ya no está.
  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
  }, []);

  return (
    <ReportPending.Provider value={report}>
      {children}
      {loader.loading && (
        <BrandLoader
          steps={DASHBOARD_STEPS}
          step={loader.step}
          done={loader.done}
          title="Actualizando el panel"
          doneLabel="Panel al día"
          hint="Se recalculan todos los bloques para el ámbito y el periodo elegidos."
        />
      )}
    </ReportPending.Provider>
  );
}

/**
 * Enlace de filtro: sigue siendo un `<a>` de verdad —la URL es la única fuente
 * del estado del panel y tiene que poder copiarse, compartirse y abrirse en otra
 * pestaña— con la sonda de `pending` dentro.
 *
 * `prefetch={false}` a propósito: con la ruta ya prefetchada Next se salta el
 * estado `pending` (lo dice su documentación) y el velo no llegaría a saber que
 * hay una navegación en curso.
 */
export function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      aria-current={active ? "true" : undefined}
      className={`px-[13px] py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
        active ? "bg-brand-ink text-tz-bone" : "text-brand-muted hover:text-brand-text"
      }`}
    >
      {children}
      <PendingProbe id={href} />
    </Link>
  );
}

/**
 * Píldora segmentada de la barra de contexto (centro / periodo).
 *
 * Las opciones llegan con el `href` ya resuelto: quien la pinta es un Server
 * Component y una función no cruza esa frontera (React se queja, con razón, de
 * que no puede serializarla).
 */
export type FilterOption = { id: string; label: string; href: string };

export function SegmentedFilter({
  label,
  options,
  activeId,
}: {
  label: string;
  options: FilterOption[];
  activeId: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[.16em] uppercase text-brand-faint mb-[5px] pl-1">{label}</div>
      <div className="flex gap-1 bg-brand-card border border-brand-border rounded-pill p-1">
        {options.map((o) => (
          <FilterLink key={o.id} href={o.href} active={o.id === activeId}>
            {o.label}
          </FilterLink>
        ))}
      </div>
    </div>
  );
}
