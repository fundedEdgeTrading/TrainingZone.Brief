import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrgLogo } from "@/components/org-logo";
import { publicIncentiveForReferred } from "@/lib/referral-rewards";
import { resolveReferralCode } from "@/lib/referrals";
import { NOINDEX } from "@/lib/seo";
import { ReferredLeadForm } from "./referred-lead-form";

/**
 * R1 (E14-30) · `/r/[code]` — el enlace del socio.
 *
 * Es una ruta PÚBLICA (`PUBLIC_PATHS`) y fuera del índice: el código no es un
 * secreto —está hecho para compartirse por WhatsApp— pero identifica a un socio
 * concreto y no pinta nada en una SERP. La allowlist de `robots.ts` ya deja
 * fuera todo lo que no esté en `INDEXABLE_PATHS`; esto lo dice además en la
 * propia página, que es donde lo mira quien audita.
 *
 * Un código que no existe, que está revocado (el socio se dio de baja) o cuyo
 * dueño ya no puede invitar responde 404: lo mismo para los tres casos, a
 * propósito. Distinguirlos convertiría la ruta en un oráculo para saber quién
 * sigue siendo socio de un gimnasio.
 *
 * Sin `revalidate`: el layout raíz lee `auth()` y `headers()`, y pedir
 * renderizado incremental convierte esto en un 500 (`DYNAMIC_SERVER_USAGE`) —la
 * misma nota que ya lleva `/lead-form`.
 */
export const metadata: Metadata = {
  title: "Te han invitado",
  robots: NOINDEX,
};

export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const resolved = await resolveReferralCode(code);
  if (!resolved) notFound();

  const incentive = await publicIncentiveForReferred(resolved.centerId);

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          {/* E9-12 · con la caja declarada siempre: sin dimensiones, el logo
              recoloca la página entera al cargar. */}
          <OrgLogo url={resolved.orgLogoUrl} alt={resolved.orgName} className="mb-3" />
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">
            {resolved.referrerFirstName} te invita
          </p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text mt-1">
            {resolved.centerName}
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">
            Déjanos tus datos y te llamamos para tu primera valoración, sin compromiso.
          </p>
        </div>
        <ReferredLeadForm
          code={resolved.code}
          orgName={resolved.orgName}
          referrerFirstName={resolved.referrerFirstName}
          incentive={incentive}
        />
      </div>
    </div>
  );
}
