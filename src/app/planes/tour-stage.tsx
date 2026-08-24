"use client";

import { useEffect, useRef, useState } from "react";
import AptaLogo from "@/components/apta-logo";
import { CAPTIONS, CUE, DURATION } from "./tour-script";
import {
  TourAgenda,
  TourAnuncios,
  TourDashboard,
  TourLeads,
  TourMesociclo,
  TourPhoneFrame,
  TourPortal,
  TourPortalMobile,
  TourShell,
  TourSocios,
  WORLD_H,
  WORLD_W,
} from "./tour-screens";

/**
 * Tutorial animado de la app, para la landing.
 *
 * Es una sola composición continua: la ventana de la app persiste los 90 s y lo
 * único que cambia es el contenido, la nav activa, la URL, la cámara y el
 * cursor. Todo se deriva de `T` (segundos desde el arranque del bucle); no hay
 * estado de escena que pueda desincronizarse del reloj.
 *
 * El diseño de origen exportaba esto a vídeo. Se implementa en cliente para que
 * la pieza no envejezca cada vez que cambie la interfaz —el vídeo habría que
 * regenerarlo a mano— y para no cargar 8-12 MB en la landing.
 *
 * Coste: el árbol se repinta mientras la sección está en pantalla. De ahí las
 * tres decisiones de abajo: el reloj para si la sección no se ve o la pestaña
 * está en segundo plano, la cámara y el cursor se escriben directamente en el
 * DOM (60 fps sin pasar por React) y el resto repinta a 30. Con
 * `prefers-reduced-motion` no arranca: se congela un fotograma representativo.
 */

/** Encuadre de autoría: 1920x1080. La ventana de la app vive dentro, a 1440x900. */
const FRAME_W = 1920;
const FRAME_H = 1080;

/** Fotograma que se enseña quieto con `prefers-reduced-motion`: plano general del panel. */
const STILL_FRAME = 16;

/** Repintados por segundo del contenido. La cámara y el cursor van aparte, a 60. */
const CONTENT_FPS = 30;

const { apertura: A0, panel: P, socios: S, agenda: G, leads: L, anuncios: N, socio: M, ia: I, cierre: Z } = CUE;

/* ── helpers de movimiento (tres, y solo tres) ───────────────────────── */
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** 0→1 con salida suave: entradas, apariciones, fundidos. */
function enter(t: number, start: number, end: number) {
  return easeOutCubic(Math.max(0, Math.min(1, (t - start) / Math.max(0.0001, end - start))));
}

type Waypoint = readonly [number, number];

/** Recorrido por waypoints `[instante, valor]`: cámara, cursor, arrastres. */
function glide(t: number, keys: readonly Waypoint[]) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1];
      const b = keys[i];
      return a[1] + (b[1] - a[1]) * easeInOutCubic((t - a[0]) / Math.max(0.0001, b[0] - a[0]));
    }
  }
  return keys[keys.length - 1][1];
}

/** Pulso corto alrededor de un instante: clics, énfasis. */
function pop(t: number, at: number, dur: number) {
  const u = (t - at) / dur;
  return u < 0 || u > 1 ? 0 : Math.sin(u * Math.PI);
}

/* ── cámara: qué punto de la ventana va al centro, y con qué zoom ────── */
const CAM_X: Waypoint[] = [
  [A0, 720], [P - 0.4, 720], [P + 2.6, 848], [P + 4.0, 980], [P + 7.0, 980], [P + 9.5, 848],
  [S + 0.8, 848], [S + 2.2, 745], [S + 6.0, 760], [S + 8.5, 800],
  [G + 1.0, 848], [G + 2.4, 520], [G + 7.5, 560], [G + 10.0, 848],
  [L + 1.4, 560], [L + 6.5, 600], [L + 9.0, 848],
  [N + 1.2, 700], [N + 4.5, 560], [N + 7.0, 560],
  [M + 1.2, 700], [M + 3.4, 1040], [M + 6.4, 990], [M + 11.5, 1010],
  [I + 1.2, 560], [I + 3.2, 720], [I + 7.6, 720], [I + 9.8, 848],
  [Z + 1.5, 848], [DURATION, 900],
];
const CAM_Y: Waypoint[] = [
  [A0, 450], [P - 0.4, 450], [P + 2.6, 400], [P + 4.0, 215], [P + 7.0, 240], [P + 9.5, 470],
  [S + 0.8, 450], [S + 2.2, 262], [S + 6.0, 330], [S + 8.5, 430],
  [G + 1.0, 450], [G + 2.4, 372], [G + 7.5, 430], [G + 10.0, 450],
  [L + 1.4, 340], [L + 6.5, 360], [L + 9.0, 450],
  [N + 1.2, 380], [N + 4.5, 260], [N + 7.0, 300],
  [M + 1.2, 330], [M + 3.4, 330], [M + 6.4, 450], [M + 11.5, 470],
  [I + 1.2, 470], [I + 3.2, 450], [I + 7.6, 450], [I + 9.8, 620],
  [Z + 1.5, 500], [DURATION, 500],
];
const CAM_S: Waypoint[] = [
  [A0, 0.80], [P - 0.4, 0.88], [P + 2.6, 1.18], [P + 4.0, 1.42], [P + 7.0, 1.34], [P + 9.5, 0.92],
  [S + 0.8, 0.92], [S + 2.2, 1.42], [S + 6.0, 1.30], [S + 8.5, 1.02],
  [G + 1.0, 0.94], [G + 2.4, 1.32], [G + 7.5, 1.22], [G + 10.0, 0.94],
  [L + 1.4, 1.26], [L + 6.5, 1.18], [L + 9.0, 0.90],
  [N + 1.2, 1.00], [N + 4.5, 1.34], [N + 7.0, 1.28],
  [M + 1.2, 1.08], [M + 3.4, 1.34], [M + 6.4, 0.62], [M + 11.5, 0.58],
  [I + 1.2, 1.24], [I + 3.2, 1.00], [I + 7.6, 1.00], [I + 9.8, 0.86],
  [Z + 1.5, 0.55], [DURATION, 0.44],
];

/* ── cursor: waypoints en coordenadas de la propia ventana ───────────── */
const CUR_X: Waypoint[] = [
  [A0, 980], [P + 1.4, 980], [P + 3.9, 916], [P + 6.4, 916], [P + 8.6, 900],
  [S + 1.6, 900], [S + 2.9, 748], [S + 4.2, 748], [S + 5.0, 826], [S + 7.4, 860],
  [G + 1.6, 830], [G + 2.6, 410], [G + 5.4, 690], [G + 8.4, 720],
  [L + 1.6, 720], [L + 2.4, 395], [L + 4.6, 628], [L + 7.6, 660],
  [N + 1.5, 660], [N + 3.2, 1170], [N + 5.2, 560], [N + 7.2, 560],
  [M + 1.4, 900], [M + 3.0, 1062], [M + 5.4, 1062], [M + 8.0, 1560], [M + 11.0, 1660],
  [I + 1.3, 700], [I + 2.2, 372], [I + 7.0, 372], [I + 9.6, 1320], [I + 10.6, 1320],
  [Z + 1.2, 1100], [DURATION, 1000],
];
const CUR_Y: Waypoint[] = [
  [A0, 690], [P + 1.4, 690], [P + 3.9, 153], [P + 6.4, 153], [P + 8.6, 420],
  [S + 1.6, 420], [S + 2.9, 240], [S + 4.2, 240], [S + 5.0, 337], [S + 7.4, 430],
  [G + 1.6, 430], [G + 2.6, 306], [G + 5.4, 466], [G + 8.4, 470],
  [L + 1.6, 470], [L + 2.4, 300], [L + 4.6, 296], [L + 7.6, 330],
  [N + 1.5, 330], [N + 3.2, 176], [N + 5.2, 250], [N + 7.2, 250],
  [M + 1.4, 420], [M + 3.0, 342], [M + 5.4, 342], [M + 8.0, 430], [M + 11.0, 560],
  [I + 1.3, 470], [I + 2.2, 476], [I + 7.0, 476], [I + 9.6, 566], [I + 10.6, 566],
  [Z + 1.2, 500], [DURATION, 460],
];

/** Instantes en que el cursor hace clic: filtro de centro, morosos, sueltas, botones. */
const CLICKS = [P + 4.4, S + 3.1, S + 5.2, G + 2.9, G + 5.5, L + 2.7, L + 4.8, N + 3.4, M + 3.3, I + 2.4, I + 9.9];

/* ── el reloj ────────────────────────────────────────────────────────── */

/**
 * Segundos de composición, en bucle. Para cuando la sección no está en
 * pantalla o la pestaña se va al fondo: una landing no tiene por qué gastar CPU
 * en algo que nadie está mirando. Con `prefers-reduced-motion` no arranca y
 * devuelve `STILL_FRAME`, que es el equivalente al póster del vídeo.
 */
function useTourClock(stage: React.RefObject<HTMLElement | null>, onFrame: (t: number) => void) {
  const [t, setT] = useState(STILL_FRAME);
  // `null` = todavía no se sabe. Se pinta el fotograma quieto igual que con
  // reduced-motion, pero sin el aviso: si no, parpadearía en cada carga.
  const [reduced, setReduced] = useState<boolean | null>(null);
  // El callback se guarda en una ref para que el bucle no se vuelva a montar en
  // cada repintado. Lo que hace solo toca refs y constantes, así que un
  // fotograma con la versión anterior no cambia nada.
  const frameCb = useRef(onFrame);
  useEffect(() => {
    frameCb.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced !== false) {
      frameCb.current(STILL_FRAME);
      return;
    }
    const node = stage.current;
    if (!node) return;

    let visible = false;
    let raf = 0;
    let last = 0;
    let clock = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!last) last = now;
      // Un salto grande es una pestaña que vuelve del fondo, no 4 s de vídeo:
      // se descarta en vez de teletransportar la composición.
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      clock = (clock + dt) % DURATION;
      frameCb.current(clock);
      setT(Math.round(clock * CONTENT_FPS) / CONTENT_FPS);
    };

    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.05 }
    );
    observer.observe(node);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [reduced, stage]);

  return { t, reduced };
}

/** Escala del encuadre de autoría al ancho real de la caja. */
function useFrameScale(box: React.RefObject<HTMLElement | null>) {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / FRAME_W);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [box]);
  return scale;
}

/* ── piezas de la composición ────────────────────────────────────────── */

/** Flecha del cursor: tamaño constante en pantalla, se contra-escala con el zoom. */
function Cursor({ arrow, ring }: { arrow: React.Ref<HTMLDivElement>; ring: React.Ref<HTMLSpanElement> }) {
  return (
    <div ref={arrow} className="absolute left-0 top-0 pointer-events-none" style={{ transformOrigin: "0 0", zIndex: 40, opacity: 0 }}>
      <span ref={ring} className="absolute rounded-full" style={{ left: -26, top: -26, width: 52, height: 52, border: "2px solid rgba(29,29,28,.5)", opacity: 0 }} />
      <svg width="30" height="30" viewBox="0 0 24 24" className="block" style={{ filter: "drop-shadow(0 3px 6px rgba(29,29,28,.35))" }} aria-hidden="true">
        <path d="M5.5 2.6l12.4 8.6-5.1.6 3 6.3-2.6 1.3-3-6.3-3.2 3.6z" fill="#fff" stroke="#1d1d1c" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Rótulo: tarjeta negra con filete dorado, abajo a la izquierda del encuadre. */
function Rotulo({ kicker, text, opacity }: { kicker: string; text: string; opacity: number }) {
  return (
    <span
      className="absolute inline-flex flex-col bg-tz-black overflow-hidden text-left"
      style={{
        left: "5.5%",
        bottom: "6%",
        gap: 8,
        borderRadius: 16,
        padding: "18px 26px",
        boxShadow: "0 30px 60px -30px rgba(29,29,28,.65)",
        opacity,
        transform: `translateY(${(1 - opacity) * 10}px)`,
      }}
    >
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: "linear-gradient(180deg,#e3cfa2,#b58e52)" }} />
      <span className="font-bold uppercase text-apta-gold" style={{ fontSize: 12, letterSpacing: ".18em", paddingLeft: 12 }}>
        {kicker}
      </span>
      <span className="font-bold text-tz-bone whitespace-nowrap" style={{ fontSize: 32, lineHeight: 1.2, letterSpacing: "-.01em", paddingLeft: 12 }}>
        {text}
      </span>
    </span>
  );
}

/**
 * La tarjeta negra del claim: abre y cierra el tutorial.
 *
 * El último fotograma y el primero son el mismo, que es lo que hace que el
 * bucle no dé un salto visible. Si se toca, hay que conservarlo.
 */
function EndCard({ veil, extras, core, premium }: { veil: number; extras: number; core: string[]; premium: string[] }) {
  if (veil <= 0.001) return null;
  const chip = { fontSize: 15, padding: "7px 15px" };
  return (
    <div
      className="absolute inset-0 bg-tz-black flex flex-col items-center justify-center text-center"
      style={{ opacity: veil, zIndex: 30, gap: 26, padding: "0 8%" }}
    >
      <AptaLogo variant="light" className="text-[64px]" />
      <div className="font-display font-extrabold uppercase text-tz-bone" style={{ fontSize: 62, lineHeight: 1.05, letterSpacing: "-.01em", maxWidth: 1200 }}>
        Todo en uno para
        <br />
        hacer crecer tus centros
      </div>
      <p className="m-0 text-brand-muted-2" style={{ fontSize: 22, maxWidth: 780, lineHeight: 1.5 }}>
        El software que pone en orden tu gimnasio, tu box o tu estudio.
      </p>
      <div className="flex flex-col items-center" style={{ opacity: extras, gap: 18, marginTop: 6 }}>
        <ul className="flex flex-wrap justify-center gap-2 m-0" style={{ maxWidth: 1120 }}>
          {core.map((f) => (
            <li key={f} className="font-medium text-brand-muted-2 bg-brand-ink-soft border border-brand-border-dark rounded-pill" style={chip}>
              {f}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap justify-center gap-2 m-0" style={{ maxWidth: 1000 }}>
          {premium.map((f) => (
            <li key={f} className="font-medium text-apta-gold bg-brand-ink-soft border border-brand-border-dark rounded-pill" style={chip}>
              {f}
            </li>
          ))}
        </ul>
        <span className="inline-flex items-center gap-2.5 bg-tz-bone text-tz-black font-semibold rounded-control" style={{ marginTop: 10, padding: "17px 34px", fontSize: 19 }}>
          Ver planes y precios <span aria-hidden="true">↓</span>
        </span>
      </div>
    </div>
  );
}

/* ── la composición ──────────────────────────────────────────────────── */

export default function TourStage({ core, premium }: { core: string[]; premium: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  const scale = useFrameScale(boxRef);

  // Cámara y cursor se escriben en el DOM, no en el estado: son lo único que se
  // mueve a 60 fps y pasarlos por React repintaría el árbol entero por
  // fotograma. El resto de la composición sí depende de `t`, a 30.
  const { t, reduced } = useTourClock(boxRef, (clock) => {
    const camS = glide(clock, CAM_S);
    const camX = glide(clock, CAM_X);
    const camY = glide(clock, CAM_Y);
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${FRAME_W / 2 - camX * camS}px,${FRAME_H / 2 - camY * camS}px) scale(${camS})`;
    }
    if (cursorRef.current) {
      const on = clock > A0 + 4.4 && clock < Z + 1.0;
      cursorRef.current.style.opacity = on ? "1" : "0";
      cursorRef.current.style.transform = `translate(${glide(clock, CUR_X)}px,${glide(clock, CUR_Y)}px) scale(${1 / camS})`;
    }
    if (ringRef.current) {
      const click = CLICKS.reduce((acc, c) => Math.max(acc, pop(clock, c, 0.5)), 0);
      ringRef.current.style.opacity = String(click > 0 ? 1 - click : 0);
      ringRef.current.style.transform = `scale(${0.3 + click * 0.9})`;
    }
  });

  /* ── estado de cada pantalla, derivado de T ────────────────────────── */
  const dashT = enter(t, P + 0.3, P + 2.4);
  const dashCenter = t > P + 4.45 ? "La Jota" : "Todos";
  const dashHighlight = pop(t, P + 4.0, 1.0) > 0.05;

  const sociosMenu = t < S + 3.1 ? 0 : t < S + 5.6 ? enter(t, S + 3.1, S + 3.5) : Math.max(0, 1 - enter(t, S + 5.6, S + 5.9));
  const sociosPicked = t > S + 5.25;

  const agendaDrag = glide(t, [[G + 2.9, 0], [G + 5.5, 1]]);
  const leadsDrag = glide(t, [[L + 2.7, 0], [L + 4.8, 1]]);
  const anunciosT = enter(t, N + 0.4, N + 2.2);
  const portalT = enter(t, M + 0.4, M + 2.4);

  const iaLoading = t < I + 2.4 ? 0 : t < I + 8.0 ? glide(t, [[I + 2.4, 0.05], [I + 7.0, 1]]) : 0;
  const iaDone = t > I + 7.2 && t < I + 8.0;
  const iaStep = Math.min(4, Math.floor(glide(t, [[I + 2.4, 0], [I + 7.0, 4.99]])));
  const iaPlan = enter(t, I + 8.1, I + 9.3);

  const phoneIn = enter(t, M + 5.6, M + 7.6);
  const phoneOut = Math.max(0, 1 - enter(t, I - 1.6, I - 0.4));

  /* ── armazón: nav activa, título y URL ─────────────────────────────── */
  const isMember = t >= M - 0.25 && t < I - 0.25;
  const nav =
    t < S ? "Panel de control"
      : t < G ? "Socios"
        : t < L ? "Agenda"
          : t < N ? "Leads"
            : t < M - 0.25 ? "Anuncios"
              : isMember ? "Mi actividad"
                : "Socios";
  const subtitle = isMember
    ? "Training Zone · La Jota"
    : nav === "Agenda" || (t >= I - 0.25 && nav === "Socios")
      ? "Dirección (Sergio) · La Jota"
      : "Dirección (Sergio) · Toda la organización";
  const url =
    t < S ? "apta.es/dashboard"
      : t < G ? "apta.es/members"
        : t < L ? "apta.es/agenda"
          : t < N ? "apta.es/leads"
            : t < M - 0.25 ? "apta.es/anuncios"
              : isMember ? "apta.es/portal"
                : "apta.es/members/mesociclos";

  const veil = Math.max(Math.max(0, 1 - enter(t, A0 + 3.0, A0 + 4.4)), enter(t, Z + 1.4, Z + 3.2));
  const extras = Math.max(Math.max(0, 1 - enter(t, A0 + 0.6, A0 + 1.9)), enter(t, Z + 2.6, Z + 4.4));

  // Los rótulos entran y salen en 0,4 s. Se pintan todos los que estén dentro
  // de su ventana, no solo el primero: en el relevo los dos se cruzan, que es
  // lo que evita el corte seco entre un titular y el siguiente.
  const captions = CAPTIONS.map((c) => ({
    ...c,
    opacity: Math.min(enter(t, c.from - 0.4, c.from), Math.max(0, 1 - enter(t, c.to, c.to + 0.4))),
  })).filter((c) => c.opacity > 0.001);

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden bg-tz-bone"
      style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
      // La composición es decorativa: lo que cuenta está en el guion en texto,
      // debajo de la pieza. Un lector de pantalla no tiene nada que hacer aquí.
      aria-hidden="true"
    >
      <div
        className="absolute left-0 top-0"
        style={{ width: FRAME_W, height: FRAME_H, transformOrigin: "0 0", transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      >
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 0%, #ffffff 0%, var(--color-tz-bone) 46%, var(--color-tz-sand) 100%)" }} />

        <div ref={worldRef} className="absolute left-0 top-0" style={{ width: WORLD_W, height: WORLD_H, transformOrigin: "0 0" }}>
          {/* marco de navegador */}
          <div className="absolute bg-tz-sand border border-tz-linen" style={{ left: -14, top: -58, width: 1468, height: 972, borderRadius: 22, boxShadow: "0 60px 120px -40px rgba(29,29,28,.45)" }}>
            <div className="flex items-center" style={{ height: 44, gap: 14, padding: "0 18px" }}>
              <span className="flex" style={{ gap: 7 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="rounded-full bg-brand-border-hover" style={{ width: 11, height: 11 }} />
                ))}
              </span>
              <span className="flex-1 mx-auto bg-surface-soft border border-tz-linen rounded-pill text-center text-muted" style={{ maxWidth: 460, padding: "5px 14px", fontSize: 12.5 }}>
                {url}
              </span>
              <span style={{ width: 46 }} />
            </div>
          </div>

          <div className="absolute left-0 top-0 overflow-hidden bg-brand-bg" style={{ width: WORLD_W, height: WORLD_H }}>
            <TourShell
              active={nav}
              title={nav}
              subtitle={subtitle}
              member={isMember}
              bonoT={portalT}
              user={isMember ? "Marta García López" : "Sergio Marín"}
              role={isMember ? "Socio" : "Dirección (Sergio)"}
            >
              {t < S ? (
                <TourDashboard t={dashT} center={dashCenter} highlight={dashHighlight} />
              ) : t < G ? (
                <TourSocios menu={sociosMenu} picked={sociosPicked} />
              ) : t < L ? (
                <TourAgenda drag={agendaDrag} />
              ) : t < N ? (
                <TourLeads drag={leadsDrag} />
              ) : t < M - 0.25 ? (
                <TourAnuncios t={anunciosT} />
              ) : isMember ? (
                <TourPortal t={portalT} />
              ) : (
                <TourMesociclo loading={iaLoading} step={iaStep} done={iaDone} plan={iaPlan} />
              )}
            </TourShell>
          </div>

          {/* app móvil: el mismo portal, en el ancho de la app nativa */}
          {phoneIn * phoneOut > 0.001 && (
            <div
              className="absolute"
              style={{ left: 1500, top: 46, opacity: phoneIn * phoneOut, transform: `translate(${(1 - phoneIn) * 220}px,0) scale(${0.92 + phoneIn * 0.08})`, transformOrigin: "0 50%" }}
            >
              <TourPhoneFrame>
                <TourPortalMobile t={portalT} />
              </TourPhoneFrame>
            </div>
          )}

          <Cursor arrow={cursorRef} ring={ringRef} />
        </div>

        {captions.map((c) => (
          <Rotulo key={c.text} kicker={c.kicker} text={c.text} opacity={c.opacity} />
        ))}

        <EndCard veil={veil} extras={extras} core={core} premium={premium} />
      </div>

      {reduced === true && (
        <span className="absolute right-3 bottom-3 rounded-pill bg-tz-black/80 text-tz-bone font-semibold" style={{ padding: "6px 12px", fontSize: 12 }}>
          Animación desactivada por tus preferencias del sistema
        </span>
      )}
    </div>
  );
}
