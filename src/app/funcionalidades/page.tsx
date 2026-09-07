import Link from "next/link";
import type { Metadata } from "next";

import { FEATURE_PAGES, VERTICAL_PAGES, featurePath, verticalPath } from "@/lib/landing-pages";
import { LandingCta, LandingHero, LandingShell } from "@/components/landing-shell";

export const metadata: Metadata = {
  title: "Funcionalidades",
  description:
    "Todo lo que hace Apta, una página por cosa: socios, agenda y reservas, cobros, portal del socio, CRM de leads y gestión multicentro.",
  alternates: { canonical: "/funcionalidades" },
};

/**
 * E9-11 · Índice de funcionalidades.
 *
 * Estático: no depende de nada que cambie en tiempo de ejecución. Es también el
 * nodo que enlaza las seis páginas hijas — una página en el sitemap sin ningún
 * enlace interno que apunte a ella es una página que Google visita una vez y
 * archiva como secundaria.
 */
export default function FuncionalidadesPage() {
  return (
    <LandingShell breadcrumb={[{ href: "/planes", label: "Apta" }, { href: "/funcionalidades", label: "Funcionalidades" }]}>
      <LandingHero
        h1="Qué hace Apta, funcionalidad por funcionalidad"
        intro="Todo lo de esta lista está incluido en cualquier plan. Los planes superiores añaden inteligencia sobre estos datos —retención, salud y aptitud, panel avanzado—, no acceso al núcleo."
      />

      <ul className="mt-8 space-y-3">
        {FEATURE_PAGES.map((page) => (
          <li key={page.slug}>
            <Link
              href={featurePath(page.slug)}
              className="block rounded-card border border-tz-linen bg-white p-5 no-underline transition-colors duration-150 hover:border-brand-border-hover"
            >
              <h2 className="font-display font-extrabold text-[17px] uppercase tracking-[-.01em] text-tz-black">
                {page.h1}
              </h2>
              <p className="text-[13.5px] text-brand-text-2 mt-1.5">{page.description}</p>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black mt-12 mb-3">
        Según lo que lleves
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {VERTICAL_PAGES.map((page) => (
          <li key={page.slug}>
            <Link
              href={verticalPath(page.slug)}
              className="block h-full rounded-card border border-tz-linen bg-white p-5 no-underline transition-colors duration-150 hover:border-brand-border-hover"
            >
              <h3 className="font-display font-extrabold text-[15px] uppercase tracking-[-.01em] text-tz-black">
                {page.title}
              </h3>
            </Link>
          </li>
        ))}
      </ul>

      <LandingCta />
    </LandingShell>
  );
}
