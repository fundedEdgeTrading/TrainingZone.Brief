import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { centerScopeFor } from "@/lib/center-scope";
import { isStripeConfiguredForOrg } from "@/lib/stripe";
import { couponDiscountLabel, getCouponPerformance } from "@/lib/stripe-coupons";
import { Card, KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import CouponForm from "./coupon-form";
import { ArchiveCouponAction } from "./archive-coupon-form";

/**
 * HU-ST-27 · Cupones y códigos promocionales medibles.
 *
 * Una sola pantalla para los tres escenarios de la historia: se da de alta el
 * código (alta en la cuenta conectada + espejo), se ve cuáles están vivos, y se
 * lee cuántas ventas y cuánto importe ha traído cada uno.
 *
 * ## Gateo por plan
 *
 * `/billing/cupones` cuelga de `/billing`, que **NO está en
 * `FEATURE_BY_ROUTE`** — y la herencia por prefijo (E6-02) hace que esta
 * tampoco lo esté. Es una decisión, no un olvido: cobrar entra en todos los
 * planes, y un código de descuento es una forma de cobrar. Mismo criterio que
 * `/audit` (E6-07/D-C7), donde lo que se gatea es la explotación masiva, no el
 * acceso del gimnasio a su propia operación. La decisión está fijada en
 * `src/lib/stripe-coupons-gate.test.ts`: si alguien añade `/billing` o esta
 * ruta al mapa, el test de E6-02 exige además la llamada a `requireFeature`, o
 * CI se pone en rojo — la ruta nunca queda medio gateada en producción.
 *
 * ## Ámbito de centro
 *
 * El cupón no tiene centro (vive en la cuenta de Stripe de la organización), y
 * el esquema —congelado— no le da uno. Así que el ámbito se aplica donde sí lo
 * hay: la MEDICIÓN solo cuenta los cobros de socios de los centros de quien
 * mira (`centerScopeFor`, mismo criterio que `/billing`), y crear o archivar un
 * código es de dirección de organización (`actions.ts`).
 */
export default async function CuponesPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);

  const scope = await centerScopeFor(session.user);
  const centerIds = scope ?? undefined;
  const isOrgDirector = scope === null;

  const [coupons, stripeConfigured] = await Promise.all([
    getCouponPerformance(session.user.orgId, { centerIds, includeArchived: true }),
    isStripeConfiguredForOrg(session.user.orgId),
  ]);

  const active = coupons.filter((c) => c.active);
  const totalSales = coupons.reduce((sum, c) => sum + c.sales, 0);
  const totalGross = coupons.reduce((sum, c) => sum + c.grossCents, 0);
  const totalDiscount = coupons.reduce((sum, c) => sum + c.discountCents, 0);

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        kicker="Cupones"
        description="Códigos promocionales de tu cuenta de Stripe, con lo que ha traído cada uno. Un código retirado se archiva: nunca se borra, para que los cobros que ya lo aplicaron sigan contando."
        actions={
          <Link
            href="/billing"
            className="text-xs font-semibold text-brand-text-2 border border-brand-border rounded-lg px-3 py-1.5 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink"
          >
            Volver a Cobros
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Códigos activos" value={String(active.length)} delay={0.04} />
        <KpiCard label="Ventas con código" value={String(totalSales)} tone={totalSales ? "good" : "default"} delay={0.1} />
        <KpiCard label="Importe traído" value={euros(totalGross)} tone={totalGross ? "good" : "default"} delay={0.16} />
        <KpiCard label="Descuento concedido" value={euros(totalDiscount)} delay={0.22} />
      </div>

      {isOrgDirector ? (
        <Card title="Crear un código" meta="se crea en tu cuenta de Stripe" delay={0.1}>
          <CouponForm
            disabled={!stripeConfigured}
            disabledReason="Conecta tu cuenta de Stripe para poder crear códigos."
          />
        </Card>
      ) : (
        <Card title="Crear un código" meta="dirección de organización" delay={0.1}>
          <p className="text-sm text-brand-muted">
            Un código descuenta en todos los centros a la vez —Stripe los guarda en la cuenta, no en el centro—, así que
            lo da de alta la dirección de la organización. Lo que ves aquí abajo son las ventas de tus centros.
          </p>
        </Card>
      )}

      <Card title="Rendimiento por código" meta={`${coupons.length} código${coupons.length === 1 ? "" : "s"}`} delay={0.16}>
        {coupons.length === 0 ? (
          <EmptyState
            title="Todavía no hay códigos"
            description="Cuando crees uno, aquí verás cuántas ventas y cuánto importe ha traído."
          />
        ) : (
          <div className="sm:overflow-x-auto">
            <table className="tz-stack-table w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th scope="col" className="pb-2">Código</th>
                  <th scope="col" className="pb-2">Descuento</th>
                  <th scope="col" className="pb-2">Caduca</th>
                  <th scope="col" className="pb-2">Ventas</th>
                  <th scope="col" className="pb-2">Importe traído</th>
                  <th scope="col" className="pb-2">Descuento concedido</th>
                  <th scope="col" className="pb-2">Estado</th>
                  {isOrgDirector && <th scope="col" className="pb-2 sr-only">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-t border-brand-border">
                    <td data-label="Código" className="py-2.5 font-semibold text-brand-text">
                      {coupon.code ?? coupon.stripeCouponId}
                      {coupon.name && <span className="block text-xs font-normal text-brand-muted">{coupon.name}</span>}
                    </td>
                    <td data-label="Descuento" className="py-2.5">{couponDiscountLabel(coupon)}</td>
                    <td data-label="Caduca" className="py-2.5 text-brand-muted">
                      {coupon.redeemBy ? coupon.redeemBy.toLocaleDateString("es-ES") : "—"}
                    </td>
                    <td data-label="Ventas" className="py-2.5">{coupon.sales}</td>
                    <td data-label="Importe traído" className="py-2.5">{euros(coupon.grossCents)}</td>
                    <td data-label="Descuento concedido" className="py-2.5 text-brand-muted">{euros(coupon.discountCents)}</td>
                    <td data-label="Estado" className="py-2.5">
                      <Badge tone={coupon.active ? "good" : "neutral"}>{coupon.active ? "Activo" : "Archivado"}</Badge>
                    </td>
                    {isOrgDirector && (
                      <td data-label="Acciones" className="py-2.5 text-right">
                        {coupon.active && (
                          <ArchiveCouponAction couponId={coupon.id} code={coupon.code ?? coupon.stripeCouponId} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}
