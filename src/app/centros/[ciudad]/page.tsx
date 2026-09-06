import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { directoryCity, listDirectoryCities } from "@/lib/public-sitemap-queries";
import { LandingCta, LandingHero, LandingShell } from "@/components/landing-shell";
import { CenterCard } from "../page";

/**
 * E9-11 · `/centros/[ciudad]`.
 *
 * La búsqueda que trae socios a un centro de barrio es local ("gimnasio en
 * Zaragoza"), y esta es la página que la responde con una lista en vez de con
 * una sola ficha. Además es el nodo que enlaza cada centro de la ciudad, así que
 * ninguna ficha depende de que alguien escriba su URL a mano.
 */
export const revalidate = 600;

export function generateStaticParams() {
  // No se prerrenderiza nada en build a propósito: el juego de ciudades depende
  // de qué centros hayan publicado su página, que cambia sin desplegar. Con
  // `revalidate` cada ciudad se cachea la primera vez que alguien la pide.
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string }> }): Promise<Metadata> {
  const { ciudad } = await params;
  const city = await directoryCity(ciudad);
  if (!city) return {};

  return {
    title: `Gimnasios y centros de entrenamiento en ${city.label}`,
    description: `Los centros de ${city.label} que gestionan su agenda, sus bonos y sus socios con Apta. Consulta cuotas y hazte socio online.`,
    alternates: { canonical: `/centros/${city.slug}` },
  };
}

export default async function CentrosCiudadPage({ params }: { params: Promise<{ ciudad: string }> }) {
  const { ciudad } = await params;
  const city = await directoryCity(ciudad);
  if (!city) notFound();

  const otras = (await listDirectoryCities()).filter((c) => c.slug !== city.slug);

  return (
    <LandingShell
      breadcrumb={[
        { href: "/planes", label: "Apta" },
        { href: "/centros", label: "Centros" },
        { href: `/centros/${city.slug}`, label: city.label },
      ]}
    >
      <LandingHero
        h1={`Centros de entrenamiento en ${city.label}`}
        intro={`${city.centers.length === 1 ? "Un centro" : `${city.centers.length} centros`} de ${city.label} con página propia: dirección, horario, cuotas y bonos, con alta online.`}
      />

      <ul className="mt-8 space-y-3">
        {city.centers.map((center) => (
          <li key={`${center.orgSlug}/${center.centerSlug}`}>
            <CenterCard center={center} />
          </li>
        ))}
      </ul>

      {otras.length > 0 && (
        <>
          <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black mt-12 mb-3">
            En otras ciudades
          </h2>
          <ul className="flex flex-wrap gap-2">
            {otras.map((other) => (
              <li key={other.slug}>
                <a
                  href={`/centros/${other.slug}`}
                  className="inline-block rounded-pill border border-tz-linen bg-white px-3.5 py-2 text-[12.5px] font-semibold text-brand-text-2 no-underline transition-colors duration-150 hover:border-brand-border-hover"
                >
                  {other.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <LandingCta label="Publicar mi centro en Apta" />
    </LandingShell>
  );
}
