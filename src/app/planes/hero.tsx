import { CORE_FEATURES, FEATURE_LABEL, type PlatformFeature } from "@/lib/platform-plans";

// Subconjunto de FEATURE_LABEL para el hero: capacidades diferenciales, no una
// lista inventada aparte. Si el catálogo cambia, este hero no se desincroniza.
const HIGHLIGHT_FEATURES: PlatformFeature[] = ["salud_aptitud", "retencion", "bi_avanzado", "ia_programacion"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-tz-black px-6 py-14 sm:px-10 sm:py-20">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="tz-aurora-blob tz-aurora-a" />
        <div className="tz-aurora-blob tz-aurora-b" />
        <div className="tz-aurora-blob tz-aurora-c" />
      </div>

      <div className="relative max-w-3xl mx-auto text-center tz-fade-up">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-apta-gold mb-3">
          Software de gestión para centros de entrenamiento
        </p>
        <h1 className="font-display font-extrabold text-3xl sm:text-5xl uppercase leading-[1.05] tracking-[-.01em] text-tz-bone">
          El software que pone en orden tu gimnasio, tu box o tu estudio
        </h1>
        <p className="text-sm sm:text-base text-brand-muted-2 mt-5 max-w-xl mx-auto">
          Socios, agenda y reservas, cobros y CRM de leads en el núcleo de cualquier plan — con
          portal del socio y app móvil incluidos desde el primer día.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#planes"
            className="inline-flex items-center gap-2 rounded-control bg-tz-bone text-tz-black font-semibold text-[15px] px-7 py-3.5 transition-colors duration-200 hover:bg-white"
          >
            Ver planes y precios <span aria-hidden="true">↓</span>
          </a>
        </div>

        <ul className="mt-10 flex flex-wrap justify-center gap-2" aria-label="Incluido en cualquier plan">
          {CORE_FEATURES.map((f) => (
            <li
              key={f}
              className="text-[12px] font-medium text-brand-muted-2 bg-brand-ink-soft border border-brand-border-dark rounded-pill px-3 py-1.5"
            >
              {f}
            </li>
          ))}
        </ul>

        <p className="text-[11px] uppercase tracking-[0.1em] text-brand-muted-2 mt-8 mb-2">
          Y en los planes superiores
        </p>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Disponible en planes superiores">
          {HIGHLIGHT_FEATURES.map((f) => (
            <li
              key={f}
              className="text-[12px] font-medium text-apta-gold bg-brand-ink-soft border border-brand-border-dark rounded-pill px-3 py-1.5"
            >
              {FEATURE_LABEL[f]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
