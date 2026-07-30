import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyMemberBillingToken } from "@/lib/email-verification";
import { createMemberBillingPortalSession } from "@/lib/member-billing";

// El token expira y es de un solo enlace: la página no puede quedar cacheada
// con la primera respuesta que reciba (mismo motivo que /recuperar-clave/[token]).
export const dynamic = "force-dynamic";

function InfoScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">{title}</h1>
        <p className="text-sm text-muted mt-3">{body}</p>
        <a
          href="/login"
          className="inline-block mt-6 font-semibold bg-tz-black text-tz-bone rounded-control px-6 py-3 text-sm no-underline"
        >
          Volver al login
        </a>
      </div>
    </div>
  );
}

/** A.1: enlace mágico "gestionar mi suscripción" — sin login, redirige directo al Billing Portal de Stripe del socio. */
export default async function ManageMemberBillingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyMemberBillingToken(token);

  if (!result.ok) {
    return (
      <InfoScreen
        title={result.error === "expired" ? "Enlace caducado" : "Enlace no válido"}
        body="Este enlace para gestionar tu suscripción ya no es válido. Pide uno nuevo desde la página de alta de tu centro."
      />
    );
  }

  const member = await prisma.member.findUnique({ where: { id: result.memberId }, select: { id: true, orgId: true } });
  if (!member) {
    return <InfoScreen title="Enlace no válido" body="No hemos encontrado la cuenta asociada a este enlace." />;
  }

  const portal = await createMemberBillingPortalSession(member.orgId, member.id);
  if (!portal.ok) {
    // Sin tecnicismos: da igual si Stripe no está configurado para el gimnasio
    // o si el socio nunca ha pagado nada online — al socio le vale el mismo
    // mensaje y el mismo siguiente paso.
    return (
      <InfoScreen
        title="Todavía no puedes gestionar tu pago online"
        body="Todavía no tienes un método de pago registrado con nosotros. Contacta con tu centro para gestionar tu cuota."
      />
    );
  }

  // `redirect` acepta URLs absolutas y sirve para redirigir a un destino
  // externo (Stripe Billing Portal) desde un Server Component.
  redirect(portal.url);
}
