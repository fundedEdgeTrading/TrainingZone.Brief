import Link from "next/link";
import AptaLogo from "@/components/apta-logo";
import {
  CORE_FEATURES,
  FEATURE_LABEL,
  PLATFORM_PLANS,
  listPurchasablePlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform-plans";
import Hero from "./hero";
import HowItWorks from "./how-it-works";
import Testimonials from "./testimonials";
import Faq from "./faq";
import FinalCta from "./final-cta";

// Los precios se resuelven del entorno en cada petición: no se cachea la página
// con un catálogo que puede cambiar sin desplegar.
export const dynamic = "force-dynamic";

const INTERVAL_LABEL: Record<PlatformPlan["interval"], string> = {
  month: "Cobro mensual",
  year: "Cobro anual · 2 meses gratis",
  lifetime: "Pago único, para siempre",
};

/** Todas las capacidades que aparecen en algún plan, en el orden del catálogo. */
function allFeatures(): PlatformFeature[] {
  const seen: PlatformFeature[] = [];
  for (const plan of PLATFORM_PLANS) {
    for (const f of plan.features) if (!seen.includes(f)) seen.push(f);
  }
  return seen;
}

export default async function PlanesPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string; checkout?: string; periodo?: string }>;
}) {
  const params = await searchParams;
  const purchasable = listPurchasablePlans();

  // Mensual por defecto; el anual se enseña con ?periodo=ano.
  const showYearly = params.periodo === "ano";
  const interval = showYearly ? "year" : "month";
  const visible = purchasable.filter((p) => p.interval === interval || p.interval === "lifetime");

  // Alguien ha llegado aquí desde una ruta que su plan no incluye.
  const blockedFeature = params.feature && FEATURE_LABEL[params.feature as PlatformFeature];

  return (
    <div className="min-h-screen bg-tz-bone">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <AptaLogo variant="dark" className="text-3xl" />
        <Link href="/login" className="text-[13px] font-bold text-tz-black underline">
          Iniciar sesión
        </Link>
      </header>

      <Hero />

      <main className="px-4 pb-16 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <HowItWorks />

          <div id="planes" className="text-center max-w-2xl mx-auto mb-8">
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl uppercase tracking-[-.01em] text-tz-black">
              Elige tu plan
            </h1>
            <p className="text-sm text-muted mt-3">
              Todo lo esencial para gestionar tu centro está en cualquier plan. Los planes superiores
              añaden la capa que convierte tus datos en decisiones.
            </p>
          </div>

          {blockedFeature && (
            <p className="max-w-2xl mx-auto mb-6 text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control px-4 py-3 text-center">
              <b>{blockedFeature}</b> no está incluido en tu plan actual.
            </p>
          )}

          {params.checkout === "cancelado" && (
            <p className="max-w-2xl mx-auto mb-6 text-sm text-critical bg-critical-bg rounded-control px-4 py-3 text-center">
              Has cancelado el pago. Puedes volver a intentarlo cuando quieras.
            </p>
          )}

          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-white border border-brand-border rounded-pill p-1">
              <PeriodLink active={!showYearly} href="/planes" label="Mensual" />
              <PeriodLink active={showYearly} href="/planes?periodo=ano" label="Anual" />
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="max-w-xl mx-auto text-sm text-brand-muted bg-white border border-brand-border rounded-card p-6 text-center">
              Todavía no hay precios configurados en este entorno. Escríbenos y te damos de alta a mano.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((plan) => (
                <PlanCard key={plan.code} plan={plan} />
              ))}
            </div>
          )}

          <ComparisonTable />

          <Testimonials />

          <Faq />

          <FinalCta />

          <p className="text-center text-xs text-faint mt-10 max-w-2xl mx-auto">
            Los precios no incluyen IVA. El cobro a tus socios lo gestionas con tu propia cuenta de
            Stripe: Apta no cobra comisión sobre tus ingresos ni interviene en tu contabilidad.
          </p>
        </div>
      </main>
    </div>
  );
}

function PeriodLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-pill text-[13px] font-bold transition-colors duration-150 ${
        active ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:text-tz-black"
      }`}
    >
      {label}
    </Link>
  );
}

function PlanCard({ plan }: { plan: PlatformPlan }) {
  const centers =
    plan.maxCenters === null
      ? "Centros ilimitados"
      : plan.maxCenters === 1
        ? "1 centro"
        : `Hasta ${plan.maxCenters} centros`;

  return (
    <div
      className={`bg-white rounded-card p-6 flex flex-col ${
        plan.recommended ? "border-2 border-tz-black shadow-pop" : "border border-tz-linen"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
          {plan.name}
        </h2>
        {plan.recommended && (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] bg-tz-black text-tz-bone rounded-pill px-2 py-1">
            Recomendado
          </span>
        )}
        {plan.limitedOffer && (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] bg-apta-gold text-tz-black rounded-pill px-2 py-1">
            Plazas limitadas
          </span>
        )}
      </div>

      <p className="font-display font-extrabold text-2xl text-tz-black mt-2">{plan.priceLabel}</p>
      <p className="text-xs text-muted mt-0.5">{INTERVAL_LABEL[plan.interval]}</p>
      <p className="text-[13px] font-semibold text-brand-text-2 mt-4">{centers}</p>

      <ul className="mt-3 space-y-1.5 flex-1">
        <li className="text-[13px] text-muted">Todo el núcleo de gestión incluido</li>
        {plan.features.map((f) => (
          <li key={f} className="text-[13px] text-brand-text-2 flex gap-2">
            <span aria-hidden="true">✓</span>
            {FEATURE_LABEL[f]}
          </li>
        ))}
      </ul>

      {plan.interval === "lifetime" && (
        <p className="text-xs text-muted mt-4 border-t border-tz-linen pt-3">
          Actualizaciones incluidas de por vida. No incluye la programación por IA, que se factura por
          uso en el plan Élite.
        </p>
      )}

      <form action="/api/checkout" method="POST" className="mt-5">
        <input type="hidden" name="planCode" value={plan.code} />
        <button
          type="submit"
          className="w-full rounded-control bg-tz-black text-tz-bone font-semibold text-[15px] py-3 transition-colors duration-200 hover:bg-brand-ink-soft"
        >
          Contratar {plan.name}
        </button>
      </form>
    </div>
  );
}

/** Derivada del catálogo: añadir un tier o mover una capacidad no obliga a tocar esta tabla. */
function ComparisonTable() {
  const features = allFeatures();
  const tiers = PLATFORM_PLANS.filter((p) => p.interval === "month" || p.interval === "lifetime");

  return (
    <div className="mt-14">
      <h2 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black text-center mb-2">
        Qué incluye cada plan
      </h2>
      <p className="text-center text-sm text-muted mb-5">
        El registro de datos de tus socios —incluidos los de salud, su consentimiento y su auditoría—
        está en todos los planes: es una obligación legal, no un extra.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] bg-white border border-tz-linen rounded-card text-sm">
          <thead>
            <tr className="border-b border-tz-linen">
              <th className="text-left p-3 font-semibold text-brand-text-2">Funcionalidad</th>
              {tiers.map((t) => (
                <th key={t.code} className="p-3 font-display font-extrabold uppercase text-tz-black">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CORE_FEATURES.map((label) => (
              <tr key={label} className="border-b border-tz-linen/70">
                <td className="p-3 text-brand-text-2">{label}</td>
                {tiers.map((t) => (
                  <td key={t.code} className="p-3 text-center text-tz-black">
                    ✓
                  </td>
                ))}
              </tr>
            ))}
            {features.map((f) => (
              <tr key={f} className="border-b border-tz-linen/70 last:border-0">
                <td className="p-3 text-brand-text-2">{FEATURE_LABEL[f]}</td>
                {tiers.map((t) => (
                  <td
                    key={t.code}
                    className={`p-3 text-center ${t.features.includes(f) ? "text-tz-black" : "text-faint"}`}
                  >
                    {t.features.includes(f) ? "✓" : "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="p-3 text-brand-text-2 font-semibold">Centros incluidos</td>
              {tiers.map((t) => (
                <td key={t.code} className="p-3 text-center text-tz-black font-semibold">
                  {t.maxCenters === null ? "Ilimitados" : t.maxCenters}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
