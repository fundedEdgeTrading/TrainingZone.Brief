import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AptaLogo from "@/components/apta-logo";
import { getPublicLeadFormContext } from "@/lib/public-lead-queries";
import { GENERIC_CENTER_METADATA, centerLeadFormMetadata } from "@/lib/public-center-seo";
import { PublicLeadForm } from "./public-lead-form";

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
  const ctx = await getPublicLeadFormContext(orgSlug, centerSlug);
  if (!ctx) return { ...GENERIC_CENTER_METADATA, robots: { index: false, follow: true } };

  return centerLeadFormMetadata({
    orgName: ctx.organization.name,
    orgSlug,
    centerName: ctx.center.name,
    centerSlug,
    city: ctx.center.city,
    neighborhood: ctx.center.neighborhood,
    description: ctx.center.description,
  });
}

export default async function PublicLeadFormPage({
  params,
}: {
  params: Promise<{ orgSlug: string; centerSlug: string }>;
}) {
  const { orgSlug, centerSlug } = await params;
  const ctx = await getPublicLeadFormContext(orgSlug, centerSlug);
  if (!ctx) notFound();

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          {ctx.organization.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización
            <img src={ctx.organization.logoUrl} alt={ctx.organization.name} className="h-9 w-auto object-contain mb-3" />
          ) : (
            <AptaLogo variant="dark" className="text-2xl mb-3" />
          )}
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text">
            {ctx.center.name}
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">Cuéntanos sobre ti y te contactamos para tu primera valoración.</p>
        </div>
        <PublicLeadForm orgSlug={orgSlug} centerSlug={centerSlug} channels={ctx.channels} />
      </div>
    </div>
  );
}
