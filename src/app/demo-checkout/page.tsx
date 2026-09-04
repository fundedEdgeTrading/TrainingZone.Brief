import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import AptaLogo from "@/components/apta-logo";
import { prisma } from "@/lib/prisma";
import { fundadorEnabled, fundadorMaxSeats, getPlatformPlan, isDemoModeActive } from "@/lib/platform-plans";
import DemoCheckoutForm from "./demo-checkout-form";

export const metadata: Metadata = { title: "Pago de demo · Apta" };
export const dynamic = "force-dynamic";

export default async function DemoCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  // Esta pantalla solo tiene sentido mientras Stripe no está configurado —
  // si alguien llega con Stripe ya activo, se le manda al pago real.
  if (!isDemoModeActive()) redirect("/planes");

  const { plan: planCode } = await searchParams;
  const plan = getPlatformPlan(planCode);
  if (!plan) notFound();

  // Mismas comprobaciones que `createLicenseCheckoutSession` (el checkout
  // real): esta pantalla es un sustituto de ESE checkout, no una vía aparte
  // sin el interruptor ni el cupo de la oferta Fundador. Con
  // `STRIPE_SECRET_KEY` vacío (modo demo real, a diferencia de este entorno de
  // QA), llegar aquí directamente por URL daba de alta el plan "de por vida"
  // gratis e ilimitado.
  if (plan.limitedOffer) {
    if (!fundadorEnabled()) notFound();
    const maxSeats = fundadorMaxSeats();
    if (maxSeats > 0) {
      const sold = await prisma.organization.count({ where: { platformPlan: plan.code } });
      if (sold >= maxSeats) notFound();
    }
  }

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          <AptaLogo variant="dark" className="text-2xl mb-3" />
          <span className="inline-flex items-center rounded-pill bg-apta-gold px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-tz-black mb-3">
            Modo demo
          </span>
          <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-brand-text">
            Stripe no está configurado en este entorno
          </h1>
          <p className="text-sm text-brand-text-2 mt-2">
            Esto NO es un cobro real. Rellena tus datos para ver cómo continúa el alta de {plan.name}{" "}
            ({plan.priceLabel}) sin pasar por Stripe.
          </p>
        </div>

        <DemoCheckoutForm planCode={plan.code} />
      </div>
    </div>
  );
}
