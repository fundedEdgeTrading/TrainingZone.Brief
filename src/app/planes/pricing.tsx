import Link from "next/link";
import { CONVERSIONS, CONVERSION_ATTRIBUTE } from "@/lib/analytics";
import {
  CORE_FEATURES,
  FEATURE_LABEL,
  PLATFORM_PLANS,
  listPurchasablePlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform-plans";

/**
 * E9-08 · El bloque de precios, aparte del resto de `/planes`.
 *
 * `/planes` conserva su `force-dynamic` porque los precios se resuelven del
 * entorno en cada petición y no se puede cachear la página con un catálogo que
 * cambia sin desplegar. Pero eso valía para el 15 % de la página que depende del
 * entorno, no para el hero, el tour, la FAQ y los testimonios, que son
 * estáticos.
 *
 * Sacándolo a su propio componente asíncrono dentro de un `<Suspense>`, el
 * armazón se envía en cuanto está y los precios llegan por streaming detrás: el
 * visitante ve el hero y puede pulsar antes de que el servidor haya terminado de
 * resolver el catálogo.
 */

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

export async function PricingBlock({ showYearly }: { showYearly: boolean }) {
  const purchasable = listPurchasablePlans();
  const interval = showYearly ? "year" : "month";
  const visible = purchasable.filter((p) => p.interval === interval || p.interval === "lifetime");

  return (
    <>
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
    </>
  );
}

/**
 * Hueco del bloque de precios mientras llega. Tres tarjetas de la misma altura
 * que las de verdad: es lo que evita que la página dé un tirón cuando el
 * streaming las sustituye.
 */
export function PricingSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex justify-center mb-8">
        <div className="h-10 w-[184px] rounded-pill bg-white border border-brand-border" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-card border border-tz-linen p-6 h-[420px] animate-pulse" />
        ))}
      </div>
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
        <h3 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">{plan.name}</h3>
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
          Actualizaciones incluidas de por vida. No incluye la programación por IA, que se factura por uso en el plan
          Élite.
        </p>
      )}

      <form action="/api/checkout" method="POST" className="mt-5" {...{ [CONVERSION_ATTRIBUTE]: CONVERSIONS.planCheckout }}>
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
        El registro de datos de tus socios —incluidos los de salud, su consentimiento y su auditoría— está en todos los
        planes: es una obligación legal, no un extra.
      </p>

      <div className="sm:overflow-x-auto">
        <table className="tz-stack-table w-full sm:min-w-[560px] bg-white border border-tz-linen rounded-card text-sm">
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
                <td data-label="" className="p-3 font-semibold text-brand-text-2">
                  {label}
                </td>
                {tiers.map((t) => (
                  <td key={t.code} data-label={t.name} className="p-3 sm:text-center text-tz-black">
                    ✓
                  </td>
                ))}
              </tr>
            ))}
            {features.map((f) => (
              <tr key={f} className="border-b border-tz-linen/70 last:border-0">
                <td data-label="" className="p-3 font-semibold text-brand-text-2">
                  {FEATURE_LABEL[f]}
                </td>
                {tiers.map((t) => (
                  <td
                    key={t.code}
                    data-label={t.name}
                    className={`p-3 sm:text-center ${t.features.includes(f) ? "text-tz-black" : "text-faint"}`}
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
