import type { Metadata } from "next";
import { OrgLogo } from "@/components/org-logo";
import { tokenPageMetadata } from "@/lib/seo";
import { MEMBER_FORM_INVALID_MESSAGE, resolveMemberFormInvite } from "@/lib/member-forms";
import { PublicMemberForm } from "./public-member-form";

/**
 * M5 · El formulario que el centro manda por correo a quien todavía no tiene
 * cuenta en el portal (E14-18/19/20).
 *
 * El contenido es el mismo que rellena el socio desde `/portal/valoracion/<id>`
 * —no hay un segundo cuestionario— y aterriza en el mismo sitio:
 * `Assessment.answers` con `memberPartAt` marcado. Lo que cambia es la puerta:
 * aquí no hay sesión, solo un token de un solo uso.
 */

// Sin esto, Next.js podría cachear indefinidamente la primera respuesta que
// reciba cada token (p. ej. si el antivirus del cliente de correo visita el
// enlace antes que la persona). Mismo motivo que en `/onboarding/[token]`.
export const dynamic = "force-dynamic";

/**
 * E9-02 · El token viaja en la URL: `noindex`, `nofollow`, `nocache` y
 * `referrer: no-referrer`. Sin lo último, cualquier recurso de terceros que
 * cargara la página mandaría la URL COMPLETA —token incluido— en `Referer`.
 */
export const metadata: Metadata = tokenPageMetadata("Tu formulario");

function InvalidLinkScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh bg-tz-black flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
          Enlace no disponible
        </h1>
        <p className="text-sm text-muted mt-3">{message}</p>
      </div>
    </div>
  );
}

export default async function PublicMemberFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveMemberFormInvite(token);

  if (!resolved.ok) return <InvalidLinkScreen message={MEMBER_FORM_INVALID_MESSAGE[resolved.reason]} />;

  const ctx = resolved.context;

  return (
    <div className="min-h-dvh bg-tz-bone flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          <OrgLogo url={ctx.orgLogoUrl} alt={ctx.orgName} className="mb-3" />
          <p className="text-[11px] font-bold tracking-[.14em] uppercase text-brand-muted">{ctx.formLabel}</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text mt-1">
            ¡Hola, {ctx.firstName}!
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">
            Cuéntanos de dónde partes y qué quieres conseguir. Lo demás —las pruebas físicas y el cuestionario de
            salud— lo haréis tu entrenador y tú en el centro.
          </p>
        </div>
        <PublicMemberForm context={ctx} />
      </div>
    </div>
  );
}
