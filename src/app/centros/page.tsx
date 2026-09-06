import Link from "next/link";
import type { Metadata } from "next";

import { listDirectoryCities } from "@/lib/public-sitemap-queries";
import { membershipPath } from "@/lib/public-center-seo";
import { LandingCta, LandingHero, LandingShell } from "@/components/landing-shell";

export const metadata: Metadata = {
  title: "Centros",
  description: "Los centros de entrenamiento que gestionan su agenda, sus bonos y sus socios con Apta, por ciudad.",
  alternates: { canonical: "/centros" },
};

/**
 * E9-11 · Índice de centros.
 *
 * Resuelve la orfandad: hasta aquí no existía **ningún** índice interno que
 * enlazara a las páginas de centro, así que un visitante solo llegaba a una si
 * el gimnasio publicaba la URL en su propia web. Una página que solo se alcanza
 * escribiendo su dirección exacta no es pública, es un enlace privado.
 *
 * Dinámico: el juego de centros publicados cambia sin desplegar. La caché la
 * pone E9-14 con `revalidate`.
 */
export const revalidate = 600;

export default async function CentrosPage() {
  const cities = await listDirectoryCities();

  return (
    <LandingShell breadcrumb={[{ href: "/planes", label: "Apta" }, { href: "/centros", label: "Centros" }]}>
      <LandingHero
        h1="Centros que entrenan con Apta"
        intro="Cada centro tiene su propia página: quién es, dónde está, cuándo abre y con qué cuotas y bonos puedes hacerte socio online."
      />

      {cities.length === 0 ? (
        <p className="mt-8 rounded-card border border-tz-linen bg-white p-6 text-sm text-muted">
          Todavía no hay ningún centro con la página pública publicada. En cuanto lo haya, aparecerá aquí y en el
          sitemap.
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {cities.map((city) => (
            <section key={city.slug} aria-labelledby={`ciudad-${city.slug}`}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2
                  id={`ciudad-${city.slug}`}
                  className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black"
                >
                  {city.label}
                </h2>
                <Link href={`/centros/${city.slug}`} className="text-[12.5px] underline text-brand-text-2">
                  Ver los {city.centers.length} de {city.label}
                </Link>
              </div>
              <ul className="space-y-3">
                {city.centers.map((center) => (
                  <li key={`${center.orgSlug}/${center.centerSlug}`}>
                    <CenterCard center={center} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <LandingCta label="Publicar mi centro en Apta" />
    </LandingShell>
  );
}

/** La tarjeta que enlaza a la ficha del centro. Compartida con `/centros/[ciudad]`. */
export function CenterCard({
  center,
}: {
  center: {
    orgSlug: string;
    centerSlug: string;
    name: string;
    neighborhood: string | null;
    address: string | null;
    description: string | null;
  };
}) {
  return (
    <Link
      href={membershipPath(center.orgSlug, center.centerSlug)}
      className="block rounded-card border border-tz-linen bg-white p-5 no-underline transition-colors duration-150 hover:border-brand-border-hover"
    >
      <h3 className="font-display font-extrabold text-[16px] uppercase tracking-[-.01em] text-tz-black">
        {center.name}
      </h3>
      <p className="text-[12.5px] text-brand-muted mt-1">
        {[center.neighborhood, center.address].filter(Boolean).join(" · ")}
      </p>
      {center.description && <p className="text-[13.5px] text-brand-text-2 mt-2 line-clamp-2">{center.description}</p>}
    </Link>
  );
}
