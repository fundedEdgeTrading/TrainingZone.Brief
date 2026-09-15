import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { centerScopeFor } from "@/lib/center-scope";
import { listIssuedRefunds, listRefundCandidates, type RefundListItem } from "@/lib/stripe-refunds";
import { assertRefundable } from "@/lib/billing-shared";
import { isStripeConfiguredForOrg } from "@/lib/stripe";
import { PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { RefundForm } from "./refund-form";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function fecha(date: Date | null) {
  return date ? date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function nombre(payment: RefundListItem) {
  return `${payment.member.firstName} ${payment.member.lastName}`;
}

/**
 * HU-ST-20 · Reembolsos y notas de crédito, DESDE APTA (decisión D-S7).
 *
 * Hasta ahora "devolver" era marcar `REFUNDED` en local, y si el cobro venía de
 * Stripe la acción se negaba en seco: el dinero había que devolverlo a mano
 * desde el Dashboard, y `Payment.stripeRefundId` se quedaba siempre en NULL. El
 * gimnasio acababa con dos verdades —la de Apta y la de Stripe— que no cuadraban.
 *
 * Dos fronteras que esta pantalla no negocia:
 *
 *  · **Solo dirección.** Recepción cobra; devolver es de quien responde del
 *    dinero. La guarda de rol está aquí y otra vez en la acción del servidor.
 *  · **Ámbito de centro.** El listado sale de `centerScopeFor`, así que un
 *    reembolso de otro centro ni se ve ni se puede emitir por URL — la acción
 *    lo vuelve a comprobar con el `memberId` del cobro.
 */
export default async function ReembolsosPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);

  const scope = await centerScopeFor(session.user);
  const centerIds = scope ?? undefined;

  const [candidates, issued, stripeConfigured] = await Promise.all([
    listRefundCandidates(session.user.orgId, centerIds),
    listIssuedRefunds(session.user.orgId, centerIds),
    isStripeConfiguredForOrg(session.user.orgId),
  ]);

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        kicker="Cobros · Devoluciones"
        description="Reembolsos y notas de crédito emitidos desde aquí, contra la cuenta de Stripe del centro (D-S7). Los cobros de caja —efectivo, transferencia, Bizum— siguen el flujo local y no pasan por Stripe. El motivo es obligatorio y queda en el registro de auditoría con su autor."
        actions={
          <>
            <Link href="/billing" className="text-xs text-faint hover:text-tz-black transition-colors duration-150">
              ← Cobros
            </Link>
            <Link href="/billing/disputas" className="text-xs text-faint hover:text-tz-black transition-colors duration-150">
              Disputas
            </Link>
          </>
        }
      />

      {!stripeConfigured && (
        <div className="rounded-xl border border-brand-border bg-warning-bg px-4 py-3 text-xs text-warning-text">
          Este gimnasio todavía no tiene la cuenta de Stripe lista para cobrar, así que solo se pueden registrar
          devoluciones de cobros de caja. Los cobros de Stripe se devolverán en cuanto la cuenta esté conectada.
        </div>
      )}

      <Card title="Cobros que se pueden devolver" meta={`${candidates.length}`}>
        {candidates.length === 0 ? (
          <p className="text-sm text-brand-muted">No hay cobros pendientes de devolver en tus centros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[.08em] text-brand-muted">
                  <th className="py-2 pr-3 font-bold">Socio</th>
                  <th className="py-2 pr-3 font-bold">Fecha</th>
                  <th className="py-2 pr-3 font-bold">Método</th>
                  <th className="py-2 pr-3 font-bold text-right">Importe</th>
                  <th className="py-2 pr-3 font-bold text-right">Queda</th>
                  <th className="py-2 font-bold text-right">Devolución</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((payment) => {
                  // La misma decisión que aplica el motor, para no enseñar un
                  // botón que la acción va a rechazar: el guardián es uno solo
                  // (`assertRefundable`), no una comprobación de pantalla.
                  const decision = assertRefundable(payment);
                  return (
                    <tr key={payment.id} className="border-t border-brand-border/60">
                      <td className="py-2 pr-3">
                        <Link href={`/members/${payment.member.id}`} className="hover:underline">
                          {nombre(payment)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-brand-muted">{fecha(payment.date)}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={payment.method === "STRIPE" ? "good" : "neutral"} dot={false}>
                          {PAYMENT_METHOD_LABEL[payment.method]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{euros(payment.amountCents)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {decision.refundable ? euros(decision.maxRefundableCents) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {decision.refundable ? (
                          <RefundForm
                            paymentId={payment.id}
                            maxRefundableCents={decision.maxRefundableCents}
                            subscriptionId={payment.subscriptionId}
                            isStripe={decision.via === "STRIPE"}
                          />
                        ) : (
                          <span className="text-xs text-brand-muted">{decision.error}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Devoluciones emitidas" meta={`${issued.length}`} delay={0.05}>
        {issued.length === 0 ? (
          <p className="text-sm text-brand-muted">Todavía no se ha devuelto ningún cobro en tus centros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[.08em] text-brand-muted">
                  <th className="py-2 pr-3 font-bold">Socio</th>
                  <th className="py-2 pr-3 font-bold">Devuelto el</th>
                  <th className="py-2 pr-3 font-bold text-right">Importe</th>
                  <th className="py-2 pr-3 font-bold">Motivo</th>
                  <th className="py-2 pr-3 font-bold">Autor</th>
                  <th className="py-2 font-bold">Documento</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((payment) => {
                  const devuelto = payment.refundedAmountCents ?? payment.amountCents;
                  const parcial = devuelto < payment.amountCents;
                  return (
                    <tr key={payment.id} className="border-t border-brand-border/60">
                      <td className="py-2 pr-3">
                        <Link href={`/members/${payment.member.id}`} className="hover:underline">
                          {nombre(payment)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-brand-muted">{fecha(payment.refundedAt)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {euros(devuelto)}
                        {parcial && (
                          <span className="ml-1.5 text-[11px] text-brand-muted">de {euros(payment.amountCents)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-brand-muted">{payment.refundReason ?? "—"}</td>
                      <td className="py-2 pr-3 text-brand-muted">
                        {/* Sin autor = se emitió desde el Dashboard de Stripe y
                            lo trajo el webhook. Inventar uno sería peor. */}
                        {payment.refundedBy?.name ?? "Stripe (Dashboard)"}
                      </td>
                      <td className="py-2">
                        {payment.stripeCreditNoteId ? (
                          <Badge tone="good" dot={false}>
                            Nota de crédito
                          </Badge>
                        ) : payment.stripeRefundId ? (
                          <Badge tone="neutral" dot={false}>
                            Refund Stripe
                          </Badge>
                        ) : (
                          <Badge tone="neutral" dot={false}>
                            Caja
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
