import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import AptaLogo from "@/components/apta-logo";
import { isDemoModeActive } from "@/lib/platform-plans";
import { loadDemoMemberCheckout, verifyDemoMemberCheckoutToken } from "@/lib/demo-member-checkout";
import DemoMemberCheckoutForm from "./demo-member-checkout-form";

export const metadata: Metadata = { title: "Pago de demo · Training Zone" };
export const dynamic = "force-dynamic";

function euros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * HU-ST-11 / RB-PAGO-024 · El equivalente de `/demo-checkout` para el plano 2
 * (gimnasio → socio). Sin `STRIPE_SECRET_KEY` el socio no podía comprar nada, y
 * con ello toda la mitad del producto que se enseña en una demo —bono, saldo,
 * reserva— quedaba inalcanzable.
 *
 * **Temporal**: se retira el día que Stripe esté vivo en producción. Mientras
 * tanto `isDemoModeActive()` la apaga sola en cuanto haya clave configurada.
 */
export default async function DemoMemberCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  // Con Stripe configurado esta pantalla no existe: se va al cobro real.
  if (!isDemoModeActive()) redirect("/portal/membresia");

  const { t: token } = await searchParams;
  if (!token) notFound();

  const verified = verifyDemoMemberCheckoutToken(token);
  if (!verified.ok) notFound();

  const summary = await loadDemoMemberCheckout(verified.intent);
  if (!summary) notFound();

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
            Esto <strong>NO es un cobro real</strong>. Al confirmar, {summary.memberName} recibe{" "}
            {summary.planName} exactamente como si hubiera pagado, para poder seguir viendo el resto del
            producto.
          </p>
        </div>

        <div className="border border-brand-border rounded-control px-4 py-3 mb-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-brand-text">{summary.planName}</span>
            <span className="font-display font-extrabold text-lg text-brand-text">{euros(summary.priceCents)}</span>
          </div>
          <p className="text-xs text-brand-text-2 mt-1">
            {summary.recurring ? "Cuota recurrente" : "Pago único"} · {summary.memberName}
          </p>
        </div>

        <DemoMemberCheckoutForm token={token} />

        <p className="text-[11px] text-faint text-center mt-4">
          Esta pantalla desaparece en cuanto se configure Stripe en el entorno.
        </p>
      </div>
    </div>
  );
}
