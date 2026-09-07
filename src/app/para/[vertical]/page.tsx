import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FEATURE_PAGES, VERTICAL_PAGES, featurePath, verticalPage, verticalPath } from "@/lib/landing-pages";
import { LandingCta, LandingHero, LandingShell } from "@/components/landing-shell";

/**
 * E9-11 · Una página por vertical.
 *
 * El hero de `/planes` ya nombraba los tres —"tu gimnasio, tu box o tu
 * estudio"— y ninguno tenía dónde aterrizar. Son tres negocios con tres
 * búsquedas distintas: quien lleva un box no busca "software de pilates", y una
 * sola página que intente servir a los tres no gana ninguna de las tres.
 */
export function generateStaticParams() {
  return VERTICAL_PAGES.map((page) => ({ vertical: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const page = verticalPage(vertical);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: verticalPath(page.slug) },
    openGraph: { type: "article", title: page.title, description: page.description, url: verticalPath(page.slug) },
  };
}

export default async function VerticalLandingPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const page = verticalPage(vertical);
  if (!page) notFound();

  const others = VERTICAL_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <LandingShell
      breadcrumb={[
        { href: "/planes", label: "Apta" },
        { href: "/funcionalidades", label: "Funcionalidades" },
        { href: verticalPath(page.slug), label: page.title },
      ]}
    >
      <LandingHero h1={page.h1} intro={page.intro} />

      <ul className="mt-8 space-y-3">
        {page.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3 text-[14.5px] text-brand-text-2 leading-relaxed">
            <span aria-hidden="true" className="text-apta-gold font-bold shrink-0">
              ✓
            </span>
            {bullet}
          </li>
        ))}
      </ul>

      <LandingCta />

      <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black mt-12 mb-3">
        Lo que incluye, en detalle
      </h2>
      <ul className="flex flex-wrap gap-2">
        {FEATURE_PAGES.map((feature) => (
          <li key={feature.slug}>
            <Link
              href={featurePath(feature.slug)}
              className="inline-block rounded-pill border border-tz-linen bg-white px-3.5 py-2 text-[12.5px] font-semibold text-brand-text-2 no-underline transition-colors duration-150 hover:border-brand-border-hover"
            >
              {feature.title}
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black mt-10 mb-3">
        ¿Llevas otra cosa?
      </h2>
      <ul className="flex flex-wrap gap-2">
        {others.map((other) => (
          <li key={other.slug}>
            <Link
              href={verticalPath(other.slug)}
              className="inline-block rounded-pill border border-tz-linen bg-white px-3.5 py-2 text-[12.5px] font-semibold text-brand-text-2 no-underline transition-colors duration-150 hover:border-brand-border-hover"
            >
              {other.title}
            </Link>
          </li>
        ))}
      </ul>
    </LandingShell>
  );
}
