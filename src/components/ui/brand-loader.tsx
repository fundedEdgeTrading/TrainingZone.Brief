"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Loader de marca: el wordmark de TRAINING ZONE se rellena de negro de
 * izquierda a derecha, con el borde ondulado como el nivel de un líquido.
 *
 * Es para esperas largas y bloqueantes (generar un mesociclo con IA: 1-2 min),
 * donde un spinner no dice nada durante minuto y medio. El nivel no es
 * decorativo: cada paso real del servidor tiene su tramo, proporcional a lo que
 * cuesta, y dentro de un tramo el nivel llega al 92 % y ESPERA. Solo el paso
 * siguiente lo desbloquea, y el 100 % solo llega con `done`: la animación nunca
 * promete un progreso que no existe.
 *
 * Uso:
 *   {overlay && <BrandLoader steps={MESOCYCLE_STEPS} step={step} done={done} />}
 *
 * `step` lo manda quien sabe por dónde va el servidor. Hoy la acción es una
 * única llamada sin progreso y el cliente reparte los pasos por los tiempos
 * medidos de cada tramo; el día que la generación emita eventos reales, solo
 * cambia de dónde sale `step`, no este componente.
 */

export type LoaderStep = {
  /** Frase que se enseña mientras dura el paso. */
  label: string;
  /** Peso relativo del paso en la barra: cuánto cuesta de verdad. */
  weight: number;
};

/** Los cinco tramos de `generateMesocycleAction`, con su coste real. */
export const MESOCYCLE_STEPS: LoaderStep[] = [
  { label: "Preparando la ficha seudonimizada del socio", weight: 1.1 },
  { label: "Comprobando el semáforo de aptitud", weight: 0.9 },
  { label: "La IA diseña las fases del mesociclo", weight: 3.4 },
  { label: "Escribiendo ejercicios, series y el porqué", weight: 2.6 },
  { label: "Guardando el borrador", weight: 1.0 },
];

/** Los tres tramos de `refineMesocycleAction`: la otra espera larga con IA. */
export const MESOCYCLE_REFINE_STEPS: LoaderStep[] = [
  { label: "Releyendo el plan y lo que ya le pediste", weight: 0.8 },
  { label: "La IA reescribe solo lo que has pedido", weight: 3.6 },
  { label: "Guardando el plan revisado", weight: 1.0 },
];

const LOGO_LIGHT = "/brand/tz-logo-black.png";
const LOGO_DARK = "/brand/tz-logo-white.png";
/** 250 x 42 del asset: la caja guarda la proporción cuando encoge. */
const LOGO_ASPECT = "250 / 42";

/** Tope del nivel dentro de un tramo. El resto solo lo desbloquea el servidor. */
const STEP_CEILING = 0.92;
/** Persecución amortiguada del nivel hacia su objetivo, por fotograma. */
const CHASE = 0.045;
/** Puntos de la onda a lo alto del borde derecho del recorte. */
const WAVE_POINTS = 16;
/** A menos de esto del objetivo, el nivel se posa: la persecución no llega. */
const SNAP = 0.4;

/**
 * Lo que se queda el velo con el nivel al 100 % y el check en pantalla antes de
 * retirarse. Sin esta pausa el trabajo terminado no llega a verse.
 */
export const LOADER_OUTRO_MS = 1150;

/**
 * El wordmark en sus dos variantes de tema: se pintan las dos y manda el CSS
 * (`.tz-logo-light` / `.tz-logo-dark` en globals.css), igual que en el sidebar.
 * Resolverlo en JS dejaría un fotograma con el logo equivocado.
 */
function Wordmark({ className, lightClassName, darkClassName }: { className: string; lightClassName?: string; darkClassName?: string }) {
  /* eslint-disable @next/next/no-img-element -- asset de marca fijo y ya optimizado; `next/image` añadiría un wrapper que estorba al recorte */
  return (
    <>
      <img src={LOGO_LIGHT} alt="" aria-hidden="true" className={`tz-logo-light ${className} ${lightClassName ?? ""}`} />
      <img src={LOGO_DARK} alt="" aria-hidden="true" className={`tz-logo-dark ${className} ${darkClassName ?? ""}`} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}

/**
 * Pacing por tramos para una acción que no reporta progreso.
 *
 * La server action es una única llamada: nadie sabe por dónde va. El cliente
 * reparte los pasos por el peso de cada tramo sobre la duración esperada, y el
 * nivel se para al 92 % del tramo vivo. Si el servidor tarda más de la cuenta
 * lo único que pasa es que la frase se queda quieta; no se promete un progreso
 * que no existe. El día que el servidor emita eventos reales, esto se cambia
 * por el `step` que llegue y el componente no se entera.
 *
 * `expectedMs` es la duración medida de la acción completa, no un límite.
 */
export function usePacedLoader(steps: LoaderStep[], expectedMs: number) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clear, [clear]);

  /** Arranca el velo por el primer paso y programa el resto. */
  const start = useCallback(() => {
    clear();
    setStep(0);
    setDone(false);
    setLoading(true);
    const total = steps.reduce((a, s) => a + s.weight, 0) || 1;
    let acc = 0;
    timers.current = steps.slice(0, -1).map((s, i) => {
      acc += (expectedMs * s.weight) / total;
      return setTimeout(() => setStep(i + 1), acc);
    });
  }, [clear, expectedMs, steps]);

  /** La acción ha fallado: fuera el velo. El error lo cuenta el toast. */
  const abort = useCallback(() => {
    clear();
    setLoading(false);
  }, [clear]);

  /**
   * La acción ha confirmado: el nivel se completa, sale el check y solo cuando
   * eso se ha visto (`LOADER_OUTRO_MS`) se retira el velo y corre `after`.
   */
  const finish = useCallback(
    (after: () => void) => {
      clear();
      setStep(Math.max(0, steps.length - 1));
      setDone(true);
      timers.current = [
        setTimeout(() => {
          setLoading(false);
          after();
        }, LOADER_OUTRO_MS),
      ];
    },
    [clear, steps.length]
  );

  return { loading, step, done, start, abort, finish };
}

/** `true` si el sistema pide menos movimiento. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function BrandLoader({
  steps,
  step,
  done = false,
  title = "Generando mesociclo",
  doneLabel = "Mesociclo listo",
  hint = "Suele tardar entre 1 y 2 minutos. No cierres esta ventana.",
  width = 420,
  waveAmplitude = 1.4,
}: {
  steps: LoaderStep[];
  /** Índice del paso vivo (0-based). Lo manda el servidor. */
  step: number;
  /** El servidor ha respondido: el nivel se completa y aparece el check. */
  done?: boolean;
  title?: string;
  /** Frase que sustituye a la del paso cuando el servidor confirma. */
  doneLabel?: string;
  hint?: string;
  width?: number;
  waveAmplitude?: number;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const phraseRef = useRef<HTMLDivElement>(null);
  const pct = useRef(0);
  const targetPct = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [pctLabel, setPctLabel] = useState("0 %");
  const reducedMotion = useReducedMotion();

  const live = Math.max(0, Math.min(step, steps.length - 1));

  /** Límite superior de cada tramo, en % del ancho total. */
  const bounds = useMemo(() => {
    const total = steps.reduce((a, s) => a + s.weight, 0) || 1;
    return steps.map((_, i) => (steps.slice(0, i + 1).reduce((a, s) => a + s.weight, 0) / total) * 100);
  }, [steps]);

  // El objetivo vive en una ref, no en el bucle: así el rAF se monta una sola
  // vez y no se reinicia en cada repintado del porcentaje (cinco por segundo).
  useEffect(() => {
    if (done) {
      targetPct.current = 100;
      return;
    }
    const floor = live === 0 ? 0 : bounds[live - 1];
    targetPct.current = floor + (bounds[live] - floor) * STEP_CEILING;
  }, [done, live, bounds]);

  // Superficie del líquido: el borde derecho del recorte es una onda que se
  // aplana al llegar a los extremos. Se escribe directamente sobre el nodo, sin
  // pasar por el estado de React: son 60 fotogramas por segundo.
  useEffect(() => {
    let frame = 0;

    const paint = () => {
      const el = fillRef.current;
      if (el) {
        pct.current += (targetPct.current - pct.current) * CHASE;
        // La persecución es asintótica: sin este remate el nivel se queda
        // eternamente en el 99,x % y el wordmark nunca llega a llenarse del
        // todo, que es justo lo que se ha esperado un minuto y medio para ver.
        if (targetPct.current - pct.current < SNAP) pct.current = targetPct.current;
        const p = pct.current;
        if (reducedMotion) {
          // Sin onda: el nivel sigue contando, que es información, pero deja de
          // ondular, que es lo único decorativo que hay aquí.
          el.style.clipPath = `inset(0 ${(100 - p).toFixed(2)}% 0 0)`;
        } else {
          const amp = waveAmplitude * Math.max(0, Math.min(1, Math.min(p, 100 - p) / 3));
          const t = performance.now() / 1000;
          const points = ["0% -2%"];
          for (let i = 0; i <= WAVE_POINTS; i++) {
            const y = i / WAVE_POINTS;
            const x = Math.max(
              0,
              Math.min(100, p + amp * Math.sin(y * 7.4 + t * 2.1) + amp * 0.45 * Math.sin(y * 3.1 - t * 1.35))
            );
            points.push(`${x.toFixed(2)}% ${(y * 100).toFixed(1)}%`);
          }
          points.push("0% 102%");
          el.style.clipPath = `polygon(${points.join(",")})`;
        }
      }
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, waveAmplitude]);

  // El reloj y el porcentaje son texto: cinco repintados por segundo bastan, y
  // el nivel no depende de ellos (va por su cuenta en el rAF de arriba).
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setPctLabel(`${Math.round(pct.current)} %`);
    }, 200);
    return () => clearInterval(id);
  }, []);

  // La frase vuelve a entrar en cada paso, en el mismo compás que el título del
  // header (tzRollUp).
  useEffect(() => {
    const el = phraseRef.current;
    if (!el) return;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "tzRollUp .42s var(--ease-out-soft) both";
  }, [live, done]);

  const phrase = done ? doneLabel : (steps[live]?.label ?? "");
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      role="alertdialog"
      aria-live="polite"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-brand-bg/85 backdrop-blur-[14px] backdrop-saturate-[1.06]"
      style={{ animation: "tzOverlayIn .32s var(--ease-out-soft) both" }}
    >
      <div className="flex flex-col items-center gap-[30px] w-[420px] max-w-full">
        <div className="font-display font-bold text-[10.5px] tracking-[.18em] uppercase text-brand-muted">{title}</div>

        <div className="relative max-w-full" style={{ width, aspectRatio: LOGO_ASPECT }}>
          {/* Lo que queda por rellenar: el mismo wordmark, casi apagado. */}
          <Wordmark
            className="absolute inset-0 w-full h-full object-contain object-left"
            lightClassName="opacity-[.13]"
            darkClassName="opacity-[.16]"
          />
          {/* El nivel: el wordmark entero, recortado por la onda. La sombra sigue
              la silueta de las letras y separa el nivel del hueco. */}
          <div
            ref={fillRef}
            aria-hidden="true"
            className="absolute inset-0"
            style={{ clipPath: "inset(0 100% 0 0)", filter: "drop-shadow(4px 0 9px rgba(29,29,28,.2))" }}
          >
            <Wordmark className="block w-full h-full object-contain object-left" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3.5 w-full">
          <div className="flex items-center gap-2.5 text-xs text-brand-muted whitespace-nowrap">
            <span className="font-bold text-brand-text tz-nums">{pctLabel}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-brand-border" />
            <span className="tz-nums">{`${minutes}:${seconds}`}</span>
            {done && (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-good)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="tz-check-pop"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" className="tz-draw" />
              </svg>
            )}
          </div>

          {/* `min-height` reserva dos líneas: la frase cambia sola y el layout no
              puede saltar debajo de ella. */}
          <div
            ref={phraseRef}
            role="status"
            className="text-[17px] font-semibold text-brand-text text-center leading-[1.35] min-h-[46px] text-pretty"
          >
            {phrase}
          </div>

          <div className="flex gap-[5px] w-full">
            {steps.map((s, i) => (
              <span
                key={s.label}
                className={`flex-1 h-[3px] rounded-full transition-colors duration-500 ease-out-soft ${
                  done || i < live ? "bg-tz-black" : i === live ? "bg-brand-muted" : "bg-brand-border"
                }`}
              />
            ))}
          </div>

          {hint && <p className="mt-1.5 text-[12.5px] text-brand-faint text-center leading-[1.5]">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
