import { Suspense } from "react";
import Link from "next/link";
import AptaLogo from "@/components/apta-logo";
import { FEATURE_LABEL, listPurchasablePlans, type PlatformFeature } from "@/lib/platform-plans";
import Hero from "./hero";
import Tour from "./tour";
import HowItWorks from "./how-it-works";
import Testimonials from "./testimonials";
import Faq, { FAQS } from "./faq";
import FinalCta from "./final-cta";
import { PricingBlock, PricingSkeleton } from "./pricing";
import { JsonLd } from "@/components/json-ld";
import { FEATURE_PAGES, VERTICAL_PAGES, featurePath, verticalPath } from "@/lib/landing-pages";
import { faqPageJsonLd, platformOffersJsonLd } from "@/lib/json-ld";

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
      {/* E9-07 · La FAQ se marca DESDE el array que pinta la página: escribirla
          dos veces es garantizar que un día digan cosas distintas. Y el
          `Product` va con ofertas SIN precio: `priceLabel` es presentación y el
          importe real vive en Stripe (RB-PLAN-001). */}
      <JsonLd node={faqPageJsonLd(FAQS)} />
      <JsonLd node={platformOffersJsonLd(listPurchasablePlans())} />

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

          {/* E9-11 · El enlazado interno hacia las páginas de captación y el
              índice de centros. Sin él estarían en el sitemap y en ningún otro
              sitio, que para Google es "página secundaria" — y para un
              visitante, inexistente. */}
          <nav aria-label="Más sobre Apta" className="mt-14 border-t border-tz-linen pt-8">
            <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black mb-3">
              Míralo por partes
            </h2>
            <ul className="flex flex-wrap gap-2">
              {FEATURE_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={featurePath(page.slug)}
                    className="inline-block rounded-pill border border-tz-linen bg-white px-3.5 py-2 text-[12.5px] font-semibold text-brand-text-2 no-underline transition-colors duration-150 hover:border-brand-border-hover"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
              {VERTICAL_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={verticalPath(page.slug)}
                    className="inline-block rounded-pill border border-tz-linen bg-white px-3.5 py-2 text-[12.5px] font-semibold text-brand-text-2 no-underline transition-colors duration-150 hover:border-brand-border-hover"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/centros"
                  className="inline-block rounded-pill border border-tz-black bg-tz-black px-3.5 py-2 text-[12.5px] font-semibold text-tz-bone no-underline"
                >
                  Centros que usan Apta
                </Link>
              </li>
            </ul>
          </nav>

          <p className="text-center text-xs text-faint mt-10 max-w-2xl mx-auto">
            Los precios no incluyen IVA. El cobro a tus socios lo gestionas con tu propia cuenta de Stripe: Apta no cobra
            comisión sobre tus ingresos ni interviene en tu contabilidad.
          </p>
        </div>
      </main>
    </div>
  );
}
