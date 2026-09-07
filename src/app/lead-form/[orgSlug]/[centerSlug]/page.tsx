import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrgLogo } from "@/components/org-logo";
import { getCachedPublicLeadFormContext } from "@/lib/public-lead-queries";
import { GENERIC_CENTER_METADATA, centerLeadFormMetadata } from "@/lib/public-center-seo";
import { PublicLeadForm } from "./public-lead-form";

/**
 * E9-14 · Mismo criterio que la ficha de alta: la consulta se cachea diez
 * minutos con etiqueta por centro y se invalida al editarlo. Sin `revalidate`
 * en la ruta: el layout raíz lee `auth()` y `headers()`, y pedir renderizado
 * incremental convierte este formulario en un 500 (`DYNAMIC_SERVER_USAGE`).
 */

/**
 * E9-04 · `/lead-form` y `/hazte-socio` compiten por la misma intención.
 *
 * Sin canónica, Google elige probablemente esta —es la que el gimnasio embebe
 * en su web, y por tanto la que recibe los enlaces— y el visitante aterriza en
 * un formulario en vez de en la página con precios. `index:false, follow:true`:
 * fuera del índice, pero sin cortar el flujo de enlaces hacia la que sí va.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; centerSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, centerSlug } = await params;
  const ctx = await getCachedPublicLeadFormContext(orgSlug, centerSlug);
  if (!ctx) return { ...GENERIC_CENTER_METADATA, robots: { index: false, follow: true } };

  return centerLeadFormMetadata({
    orgName: ctx.organization.name,
    orgSlug,
    centerName: ctx.center.name,
    centerSlug,
    city: ctx.center.city,
    neighborhood: ctx.center.neighborhood,
    description: ctx.center.description,
    publicPage: ctx.center.publicPage,
  });
}

export default async function PublicLeadFormPage({
  params,
}: {
  params: Promise<{ orgSlug: string; centerSlug: string }>;
}) {
  const { orgSlug, centerSlug } = await params;
  const ctx = await getCachedPublicLeadFormContext(orgSlug, centerSlug);
  if (!ctx) notFound();

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          {/* E9-12 · Con la caja declarada siempre: el logo iba justo encima
              del h1 y sin dimensiones recolocaba la página entera al cargar. */}
          <OrgLogo url={ctx.organization.logoUrl} alt={ctx.organization.name} className="mb-3" />
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text">
            {ctx.center.name}
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">Cuéntanos sobre ti y te contactamos para tu primera valoración.</p>
        </div>
        <PublicLeadForm
          orgSlug={orgSlug}
          centerSlug={centerSlug}
          orgName={ctx.organization.name}
          channels={ctx.channels}
        />
      </div>
    </div>
  );
}
