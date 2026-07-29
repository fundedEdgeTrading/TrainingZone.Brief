import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PLATFORM_PLANS } from "@/lib/platform-plans";
import { PlanCheckoutButton, ResendVerificationButton } from "./checkout-buttons";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  PENDING_PAYMENT: {
    title: "Activa tu plataforma",
    body: "Tu organización está creada. Falta un paso: elige un plan para empezar a usar Apta.",
  },
  PAST_DUE: {
    title: "Hay un problema con tu último cobro",
    body: "No hemos podido procesar tu último pago. Actualiza tu método de pago para no perder el acceso.",
  },
  SUSPENDED: {
    title: "Tu plataforma está suspendida",
    body: "El impago es persistente y el acceso ha quedado en solo lectura. Reactiva el pago para volver a operar con normalidad.",
  },
  CANCELLED: {
    title: "Tu suscripción ha sido cancelada",
    body: "Puedes reactivarla cuando quieras eligiendo un plan.",
  },
};

export default async function ActivarPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  if (session.user.role === "PLATFORM_ADMIN") redirect("/dashboard");

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true, platformStatus: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { identity: { select: { emailVerifiedAt: true } } },
    }),
  ]);

  if (!org) redirect("/login");

  // RB-PLAT-001: si ya está activa, no hay muro que mostrar.
  if (org.platformStatus === "ACTIVE" || org.platformStatus === "TRIALING") {
    redirect("/dashboard");
  }

  if (session.user.role === "MEMBER") redirect("/servicio-no-disponible");

  const copy = STATUS_COPY[org.platformStatus] ?? STATUS_COPY.PENDING_PAYMENT;
  const isOwner = session.user.role === "OWNER";

  return (
    <div className="min-h-screen bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">{org.name}</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">{copy.title}</h1>
          <p className="text-sm text-muted mt-2">{copy.body}</p>
        </div>

        {params.checkout === "cancelled" && (
          <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">
            Checkout cancelado. Puedes volver a intentarlo cuando quieras.
          </p>
        )}

        {isOwner ? (
          PLATFORM_PLANS.length > 0 ? (
            <div className="space-y-3">
              {PLATFORM_PLANS.map((plan) => (
                <div key={plan.code} className="border border-brand-border rounded-control p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-tz-black">{plan.name}</p>
                    <p className="text-xs text-muted">{plan.interval === "lifetime" ? "Pago único" : `Cobro ${plan.interval === "month" ? "mensual" : "anual"}`}</p>
                  </div>
                  <PlanCheckoutButton plan={plan} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
              Todavía no hay planes de precio configurados en este entorno. Contacta con Apta para activar tu cuenta.
            </p>
          )
        ) : (
          <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
            Solo la dirección de la organización puede activar el pago. Pide a tu director/a que complete este paso.
          </p>
        )}

        {isOwner && !user?.identity.emailVerifiedAt && (
          <div className="border-t border-tz-linen pt-4">
            <p className="text-sm text-muted mb-1">Tu email de facturación aún no está confirmado.</p>
            <ResendVerificationButton />
          </div>
        )}
      </div>
    </div>
  );
}
