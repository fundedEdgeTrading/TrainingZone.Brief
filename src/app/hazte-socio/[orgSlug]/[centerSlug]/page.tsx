import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { PlanType } from "@prisma/client";
import AptaLogo from "@/components/apta-logo";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getPublicMembershipContext } from "@/lib/public-membership-queries";
import { isRecurring } from "@/lib/member-billing";
import { planServiceKind } from "@/lib/members-queries";
import MemberBillingLinkForm from "./member-billing-link-form";

export const metadata: Metadata = { title: "Hazte socio · Training Zone" };

const SERVICE_LABEL: Record<"EP" | "GROUP" | "ONLINE", string> = {
  EP: "Entrenamiento personal",
  GROUP: "Grupos reducidos",
  ONLINE: "Online",
};

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function planPeriodLabel(plan: { type: PlanType; sessionsIncluded: number | null }) {
  if (isRecurring(plan.type)) return "Cuota mensual";
  return plan.sessionsIncluded ? `Bono de ${plan.sessionsIncluded} sesiones` : "Bono";
}

export default async function PublicMembershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; centerSlug: string }>;
  searchParams: Promise<{ checkout?: string; motivo?: string }>;
}) {
  const { orgSlug, centerSlug } = await params;
  const { checkout, motivo } = await searchParams;
  const ctx = await getPublicMembershipContext(orgSlug, centerSlug);
  if (!ctx) notFound();

  const checkoutAction = `/api/hazte-socio/${orgSlug}/${centerSlug}/checkout`;

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          {ctx.organization.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización
            <img src={ctx.organization.logoUrl} alt={ctx.organization.name} className="h-9 w-auto object-contain mb-3" />
          ) : (
            <AptaLogo variant="dark" className="text-2xl mb-3" />
          )}
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text">
            Hazte socio de {ctx.center.name}
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">Elige tu plan y paga online — tu acceso queda listo en minutos.</p>
        </div>

        {checkout === "error" && (
          <div className="mb-6 rounded-control border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical">
            {motivo || "No se ha podido iniciar el pago. Inténtalo de nuevo."}
          </div>
        )}

        {!ctx.stripeReady ? (
          <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-4 text-sm text-brand-text-2">
            Este centro aún no tiene el cobro online activado — contacta directamente con ellos para hacerte socio.
          </div>
        ) : ctx.plans.length === 0 ? (
          <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-4 text-sm text-brand-text-2">
            Este centro no tiene planes disponibles ahora mismo.
          </div>
        ) : (
          <form method="POST" action={checkoutAction} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre">
                  <Input name="firstName" required placeholder="Tu nombre" />
                </Field>
                <Field label="Apellidos">
                  <Input name="lastName" required placeholder="Tus apellidos" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" hint="Aquí recibirás tu acceso al portal de socio">
                  <Input name="email" type="email" required placeholder="tu@email.com" />
                </Field>
                <Field label="Teléfono">
                  <Input name="phone" required placeholder="600 000 000" />
                </Field>
              </div>
            </div>

            <div className="space-y-3">
              {ctx.plans.map((plan) => {
                const kind = planServiceKind(plan.type);
                return (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-4 rounded-control border border-brand-border p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-sm text-brand-text truncate">{plan.name}</span>
                        {kind && (
                          <span className="inline-flex items-center rounded-pill bg-tz-bone px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-brand-muted">
                            {SERVICE_LABEL[kind]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-muted mt-1">{planPeriodLabel(plan)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-display font-extrabold text-lg text-brand-text">{euros(plan.priceCents)}</span>
                      <Button type="submit" name="planId" value={plan.id}>
                        Contratar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-brand-border">
          <h2 className="font-display font-bold text-sm uppercase tracking-[.03em] text-brand-text">
            ¿Ya eres socio?
          </h2>
          <p className="text-xs text-brand-muted mt-1 mb-3">
            Gestiona tu suscripción — cambia tu método de pago o cancela tu cuota sin contraseña.
          </p>
          <MemberBillingLinkForm orgSlug={orgSlug} centerSlug={centerSlug} />
        </div>
      </div>
    </div>
  );
}
