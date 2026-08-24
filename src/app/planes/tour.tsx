import { CORE_FEATURES, FEATURE_LABEL, type PlatformFeature } from "@/lib/platform-plans";
import TourStage from "./tour-stage";
import { CAPTIONS, MODULES, SCENES } from "./tour-script";

// Las mismas cuatro capacidades diferenciales que enseña el hero: la tarjeta de
// cierre del tutorial sale del catálogo, no de una lista escrita aparte.
const HIGHLIGHT_FEATURES: PlatformFeature[] = ["salud_aptitud", "retencion", "bi_avanzado", "ia_programacion"];

/** `mm:ss` para el índice del guion. */
function stamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * La app funcionando, bajo el hero de /planes: 90 segundos en bucle, sin voz y
 * sin registro, sobre la propia interfaz.
 *
 * La animación va en `tour-stage.tsx` (cliente). Aquí queda lo que puede
 * resolverse en el servidor: el encabezado, las capacidades del catálogo que
 * pinta la tarjeta de cierre y el guion en texto, que es lo que hace la pieza
 * legible para quien no la ve.
 */
export default function Tour() {
  return (
    <section id="tour" className="pt-16 pb-2">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold mb-2">La app funcionando</p>
          <h2 className="font-display font-extrabold text-2xl sm:text-3xl uppercase tracking-[-.01em] text-tz-black">
            Todo lo que hace, en 90 segundos
          </h2>
          <p className="text-sm text-muted mt-3 max-w-xl">
            Sin voz y sin registro: panel de control, socios, agenda, leads, anuncios, portal del socio y la programación por IA, en la
            propia interfaz.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 max-w-sm">
          {MODULES.map((m) => (
            <li key={m} className="text-xs font-semibold text-brand-text-2 bg-white border border-brand-border rounded-pill px-3 py-1.5">
              {m}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-brand-border overflow-hidden bg-tz-bone shadow-card">
        <TourStage core={CORE_FEATURES} premium={HIGHLIGHT_FEATURES.map((f) => FEATURE_LABEL[f])} />
      </div>

      <p className="text-xs text-faint mt-3.5">Se reproduce en bucle y sin sonido. Datos de demostración.</p>

      <details className="mt-4 group">
        <summary className="text-[13px] font-semibold text-brand-text-2 cursor-pointer marker:text-faint">
          Leer lo que se ve, escena a escena
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ol className="space-y-3">
            {SCENES.map((s) => (
              <li key={s.name} className="text-[13px] leading-relaxed">
                <span className="tz-nums text-faint mr-2">{stamp(s.at)}</span>
                <b className="text-tz-black">{s.name}.</b>{" "}
                <span className="text-muted">{s.what}</span>
              </li>
            ))}
          </ol>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold mb-2">Rótulos en pantalla</p>
            <ul className="space-y-2">
              {CAPTIONS.map((c) => (
                <li key={c.text} className="text-[13px]">
                  <span className="tz-nums text-faint mr-2">{stamp(c.from)}</span>
                  <span className="text-muted">{c.kicker} — </span>
                  <span className="text-tz-black">{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
