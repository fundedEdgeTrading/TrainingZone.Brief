import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { verifyMemberBillingOrDunningToken } from "@/lib/email-verification";
import { tokenPageMetadata } from "@/lib/seo";
import { getMemberDunningStatus, getOpenInvoiceForMember } from "@/lib/stripe-dunning";
import { formatInstantDate, DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { RecoveryPanel } from "./recovery-panel";

// El token expira y es de un solo enlace: la página no puede quedar cacheada
// con la primera respuesta que reciba (mismo motivo que /recuperar-clave/[token]).
export const dynamic = "force-dynamic";

/**
 * E9-02 · El token viaja en la URL: `noindex`, `nofollow`, `nocache` y
 * `referrer: no-referrer` — sin esto, un enlace de este correo indexado es
 * acceso sin contraseña, y la cabecera `Referer` filtra el token a cualquier
 * tercero que la página cargue.
 */
export const metadata: Metadata = tokenPageMetadata("Gestionar suscripción");

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function InfoScreen({ title, body }: { title: string; body: string }) {
  return (
    <Shell title={title}>
      <p className="text-sm text-muted mt-3">{body}</p>
      <a
        href="/login"
        className="inline-block mt-6 font-semibold bg-tz-black text-tz-bone rounded-control px-6 py-3 text-sm no-underline"
      >
        Volver al login
      </a>
    </Shell>
  );
}

function euros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * HU-ST-19 · Pantalla de recuperación del socio.
 *
 * A.1 la dejó como un simple trampolín al Billing Portal de Stripe: entrabas y
 * te redirigía. El problema es que cambiar la tarjeta en el portal **no cobra
 * la factura pendiente** — el socio hacía todo bien, salía convencido de que
 * estaba arreglado y su acceso se cortaba igual días después, cuando Stripe
 * volvía a intentarlo. Ahora la pantalla enseña lo que se debe y ofrece las dos
 * cosas: pagarlo en el momento, y cambiar el método de pago si es lo que falla.
 *
 * Se entra sin sesión, solo con el token del email de impago, así que no pinta
 * nada que no sea de este socio ni acepta ningún identificador del formulario.
 */
export default async function ManageMemberBillingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyMemberBillingOrDunningToken(token);

  if (!result.ok) {
    return (
      <InfoScreen
        title={result.error === "expired" ? "Enlace caducado" : "Enlace no válido"}
        body="Este enlace para gestionar tu suscripción ya no es válido. Entra en tu portal de socio para actualizar tu método de pago, o contacta con tu centro."
      />
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: result.memberId },
    select: {
      id: true,
      orgId: true,
      firstName: true,
      primaryCenter: { select: { timezone: true } },
      organization: { select: { name: true } },
    },
  });
  if (!member) {
    return <InfoScreen title="Enlace no válido" body="No hemos encontrado la cuenta asociada a este enlace." />;
  }

  const [invoice, dunning] = await Promise.all([
    getOpenInvoiceForMember(member.orgId, member.id),
    getMemberDunningStatus(member.id),
  ]);
  const timezone = member.primaryCenter?.timezone || DEFAULT_TIMEZONE;

  return (
    <Shell title={invoice ? "Tienes un recibo pendiente" : "Tu método de pago"}>
      <p className="text-sm text-muted mt-3">
        {invoice
          ? `Hola, ${member.firstName}. No hemos podido cobrar tu cuota de ${member.organization.name}. Puedes pagarla ahora mismo desde aquí, sin esperar al siguiente intento.`
          : `Hola, ${member.firstName}. No tienes ningún recibo pendiente. Desde aquí puedes cambiar tu método de pago cuando quieras.`}
      </p>

      {invoice && (
        <dl className="mt-5 text-left text-sm border border-brand-border rounded-control divide-y divide-brand-border">
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-brand-muted">Importe</dt>
            <dd className="font-semibold tabular-nums text-brand-text">{euros(invoice.amountDueCents)}</dd>
          </div>
          {invoice.concept && (
            <div className="flex items-center justify-between px-4 py-2.5 gap-4">
              <dt className="text-brand-muted shrink-0">Concepto</dt>
              <dd className="font-semibold text-brand-text text-right">{invoice.concept}</dd>
            </div>
          )}
          {/* El plazo es el que fija el centro (D-S5) y llega resuelto del
              servidor: aquí no hay ningún número de días escrito. */}
          {dunning?.delinquent && dunning.deadline && (
            <div className="flex items-center justify-between px-4 py-2.5 gap-4">
              <dt className="text-brand-muted shrink-0">
                {dunning.blocked ? "Reservas" : "Puedes reservar hasta"}
              </dt>
              <dd className={`font-semibold text-right ${dunning.blocked ? "text-critical" : "text-brand-text"}`}>
                {dunning.blocked ? "Bloqueadas" : formatInstantDate(dunning.deadline, timezone)}
              </dd>
            </div>
          )}
        </dl>
      )}

      <RecoveryPanel token={token} hasPendingInvoice={invoice != null} />

      <p className="text-[12px] text-brand-muted mt-5">
        El pago lo procesa Stripe. Nunca guardamos los datos de tu tarjeta.
      </p>
    </Shell>
  );
}
