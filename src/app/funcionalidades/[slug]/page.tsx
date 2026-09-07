import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FEATURE_PAGES, featurePage, featurePath } from "@/lib/landing-pages";
import { LandingCta, LandingHero, LandingShell } from "@/components/landing-shell";

/**
 * E9-11 · Una página por capacidad del núcleo, generada desde `CORE_FEATURES`.
 *
 * `generateStaticParams` es la otra mitad de la historia: sin él estas páginas
 * serían dinámicas y no habría forma de que Google llegara a ninguna sin que
 * alguien enlazara la URL exacta. Con él se prerrenderizan las seis y entran en
 * el sitemap.
 */
export function generateStaticParams() {
  return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = featurePage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: featurePath(page.slug) },
    openGraph: { type: "article", title: page.title, description: page.description, url: featurePath(page.slug) },
  };
}

export default async function FeatureLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = featurePage(slug);
  if (!page) notFound();

  const others = FEATURE_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <LandingShell
      breadcrumb={[
        { href: "/planes", label: "Apta" },
        { href: "/funcionalidades", label: "Funcionalidades" },
        { href: featurePath(page.slug), label: page.title },
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
        Y también
      </h2>
      <ul className="flex flex-wrap gap-2">
        {others.map((other) => (
          <li key={other.slug}>
            <Link
              href={featurePath(other.slug)}
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
