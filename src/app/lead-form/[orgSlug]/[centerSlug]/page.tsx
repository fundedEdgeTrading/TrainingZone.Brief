import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AptaLogo from "@/components/apta-logo";
import { getPublicLeadFormContext } from "@/lib/public-lead-queries";
import { PublicLeadForm } from "./public-lead-form";

export const metadata: Metadata = { title: "Únete · Training Zone" };

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
