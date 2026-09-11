import type { Metadata } from "next";

import { LandingShell, LandingHero } from "@/components/landing-shell";
import { JsonLd } from "@/components/json-ld";
import { mobileApplicationJsonLd } from "@/lib/json-ld";
import { APP_SCREENSHOTS } from "@/lib/app-screenshots";

/**
 * E9-16 · Ficha pública de la app, `/app`.
 *
 * La política de privacidad completa es E10-05 (la redacta un despacho
 * externo): esta página enlaza a `/privacidad` tal como está hoy y no
 * escribe ni una línea de texto legal nueva.
 *
 * Sin analítica ni cookie alguna que no sea técnica (invariante de
 * `AGENTS.md`): esta página no añade ninguna, así que no hace falta CMP ni
 * tocar `/cookies`.
 */
export const metadata: Metadata = {
  title: "La app de Apta",
  description: "Reserva tu clase, controla tus bonos y sigue tu progreso desde el móvil.",
  alternates: { canonical: "/app" },
  openGraph: { type: "website", title: "La app de Apta", url: "/app" },
};

/**
 * Botones de tienda: la app todavía no está publicada
 * (`apps/mobile/PUBLISHING.md` §1 — `bundleIdentifier`/`package` sin decidir,
 * sin eso no hay build firmada). Un enlace a una URL de tienda que no existe
 * es peor que no ofrecerlo: por eso salen deshabilitados con su motivo, no
 * apuntando a una URL inventada.
 */
function StoreBadge({ label }: { label: string }) {
  return (
    <span
      aria-disabled="true"
      className="inline-flex flex-col items-start gap-0.5 rounded-control border border-tz-linen bg-white px-5 py-2.5 text-tz-black opacity-60 cursor-not-allowed select-none"
    >
      <span className="text-[9.5px] uppercase tracking-[.08em] text-muted">Próximamente en</span>
      <span className="text-[14px] font-bold leading-none">{label}</span>
    </span>
  );
}

export default function AppLandingPage() {
  return (
    <LandingShell breadcrumb={[{ href: "/planes", label: "Apta" }, { href: "/app", label: "La app" }]}>
      <LandingHero
        h1="Apta · Tu gimnasio"
        intro="Reserva, bonos y tu progreso — sin llamar a recepción. La app de socio y de entrenador de tu centro."
      />

      <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Descargas">
        <StoreBadge label="App Store" />
        <StoreBadge label="Google Play" />
      </div>
      <p className="text-[12.5px] text-muted mt-2">
        Todavía no está publicada. Mientras tanto, tu progreso y tu agenda están disponibles desde el portal web de
        tu centro.
      </p>

      <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black mt-12 mb-4">
        Lo que vas a ver
      </h2>
      <ul
        className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap"
        aria-label="Capturas de la app"
      >
        {APP_SCREENSHOTS.map((shot) => (
          <li
            key={shot.order}
            className="shrink-0 w-[168px] aspect-[9/19.5] rounded-[22px] border border-tz-linen bg-white shadow-pop flex flex-col items-center justify-center gap-2 px-3 text-center"
          >
            <span className="text-[10px] uppercase tracking-[.08em] text-muted">Captura {shot.order}</span>
            <span className="text-[13px] font-semibold text-tz-black leading-snug">{shot.screen}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-muted mt-3">
        Capturas reales pendientes de generar en simulador (guion en
        <code className="mx-1 text-[11.5px]">apps/mobile/assets/store/README.md</code>).
      </p>

      <p className="text-[14.5px] text-brand-text-2 leading-relaxed mt-10">
        Reserva tu próxima clase o sesión, cancela con margen si algo cambia, y consulta cuántas sesiones te quedan
        de tu bono sin esperar a que te lo digan en recepción. Si eres entrenador, tu agenda del día y el semáforo de
        aptitud de cada socio, sin cargar papel.
      </p>

      <p className="text-[12.5px] text-muted mt-6">
        Trata datos de salud con tu consentimiento explícito. Lee la{" "}
        <a href="/privacidad" className="underline">
          política de privacidad
        </a>
        .
      </p>

      <JsonLd node={mobileApplicationJsonLd()} />
    </LandingShell>
  );
}
