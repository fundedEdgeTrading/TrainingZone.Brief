import { Suspense } from "react";
import Link from "next/link";
import AptaLogo from "@/components/apta-logo";
import { FEATURE_LABEL, type PlatformFeature } from "@/lib/platform-plans";
import Hero from "./hero";
import Tour from "./tour";
import HowItWorks from "./how-it-works";
import Testimonials from "./testimonials";
import Faq from "./faq";
import FinalCta from "./final-cta";
import { PricingBlock, PricingSkeleton } from "./pricing";

/**
 * E9-08 · `/planes` conserva su `force-dynamic`, que está justificado: los
 * precios se resuelven del entorno en cada petición y no se puede cachear la
 * página con un catálogo que puede cambiar sin desplegar.
 *
 * Lo que cambia es a qué obliga eso. Antes, el 15 % de la página que depende del
 * entorno mantenía en vilo al 85 % que no: hero, tour, cómo funciona, FAQ y
 * testimonios son estáticos y se envían ya, y solo el bloque de precios espera
 * dentro de su `<Suspense>`.
 */
export const dynamic = "force-dynamic";

export default async function PlanesPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string; checkout?: string; periodo?: string }>;
}) {
  const params = await searchParams;

  // Mensual por defecto; el anual se enseña con ?periodo=ano.
  const showYearly = params.periodo === "ano";

  // Alguien ha llegado aquí desde una ruta que su plan no incluye.
  const blockedFeature = params.feature && FEATURE_LABEL[params.feature as PlatformFeature];

  return (
    <div className="min-h-screen bg-tz-bone">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <AptaLogo variant="dark" className="text-3xl" />
        <Link href="/login" className="text-[13px] font-bold text-tz-black underline">
          Iniciar sesión
        </Link>
      </header>

      <Hero />

      <main className="px-4 pb-16 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <Tour />

          <HowItWorks />

          <div id="planes" className="text-center max-w-2xl mx-auto mb-8">
            {/* E9-10 · h2 y no h1: el único h1 de la página es el del hero.
                Dos h1 obligan a Google a elegir cuál describe la página, y el
                que elegía no llevaba la consulta principal. El nivel no lo
                comprueba ningún e2e —buscan por rol `heading`, sin nivel—, así
                que bajarlo no rompe nada. */}
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl uppercase tracking-[-.01em] text-tz-black">
              Elige tu plan
            </h2>
            <p className="text-sm text-muted mt-3">
              Todo lo esencial para gestionar tu centro está en cualquier plan. Los planes superiores añaden la capa que
              convierte tus datos en decisiones.
            </p>
          </div>

          {blockedFeature && (
            <p className="max-w-2xl mx-auto mb-6 text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control px-4 py-3 text-center">
              <b>{blockedFeature}</b> no está incluido en tu plan actual.
            </p>
          )}

          {params.checkout === "cancelado" && (
            <p className="max-w-2xl mx-auto mb-6 text-sm text-critical bg-critical-bg rounded-control px-4 py-3 text-center">
              Has cancelado el pago. Puedes volver a intentarlo cuando quieras.
            </p>
          )}

          <Suspense fallback={<PricingSkeleton />}>
            <PricingBlock showYearly={showYearly} />
          </Suspense>

          <Testimonials />

          <Faq />

          <FinalCta />

          <p className="text-center text-xs text-faint mt-10 max-w-2xl mx-auto">
            Los precios no incluyen IVA. El cobro a tus socios lo gestionas con tu propia cuenta de Stripe: Apta no cobra
            comisión sobre tus ingresos ni interviene en tu contabilidad.
          </p>
        </div>
      </main>
    </div>
  );
}
