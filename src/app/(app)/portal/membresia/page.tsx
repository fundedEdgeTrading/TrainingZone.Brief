import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { PlanType } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import {
  getMemberForUser,
  getMemberPlanAdherence,
  getLastEpTrainerName,
  getPendingSessionFeedback,
} from "@/lib/portal-queries";
import { getActiveMembershipPlans } from "@/lib/public-membership-queries";
import { isRecurring } from "@/lib/member-billing";
import { planNameWithoutService } from "@/lib/members-queries";
import { memberBonos } from "@/lib/session-balance";
import { resolveTimezone } from "@/lib/timezone";
import { zonedToday } from "@/lib/date-utils";
import PurchasePlanButton from "./purchase-plan-button";
import { RenewalModal } from "./renewal-modal";
import { PendingSessionsRating } from "./pending-sessions";
import { getMemberBillingSnapshot } from "./billing-view";
import { ReceiptDownloadButton } from "./receipt-download-button";
import { SubscriptionManagement } from "./subscription-management";
import { FreezeManagement } from "./freeze-management";
import { getMemberFreezePolicyView } from "./freeze-view";
import { listCancelReasons, listFreezeReasons } from "@/lib/member-lifecycle";

const RECEIPT_STATUS_LABEL: Record<string, string> = { PAID: "Cobrado", FAILED: "Fallido", REFUNDED: "Devuelto" };

function shortDate(date: Date) {
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export const metadata: Metadata = { title: "Mi membresía · Training Zone" };

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function planPeriodLabel(plan: { type: PlanType; sessionsIncluded: number | null }) {
  if (isRecurring(plan.type)) return "Cuota mensual";
  return plan.sessionsIncluded ? `Bono de ${plan.sessionsIncluded} sesiones` : "Bono";
}

// "Ayer · 21 jul" / "Hoy · 22 jul" / "Mar · 23 jul" — misma convención que el
// resto del portal (evita desajustes de hidratación al formatear en cliente).
function relativeDayLabel(date: Date, today: Date) {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  const dayMonth = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  if (diffDays === 0) return `Hoy · ${dayMonth}`;
  if (diffDays === 1) return `Ayer · ${dayMonth}`;
  const weekday = date.toLocaleDateString("es-ES", { weekday: "short" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${dayMonth}`;
}

/**
 * F6/F16: fusión de las antiguas /portal/plan (adherencia, valoración de
 * sesiones) y /portal/comprar (catálogo, compra) en una sola pantalla
 * "producto contratado" — ver handoff NavBar premium 1b.
 *
 * El socio no ve aquí lo que lleva gastado: ni historial de pagos ni el precio
 * de su cuota/bono en curso. Los precios del catálogo sí se enseñan, porque son
 * los de la compra que va a hacer.
 */
export default async function PortalMembresiaPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; motivo?: string; renovar?: string }>;
}) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const { checkout, motivo } = await searchParams;
  const timezone = await resolveTimezone(member.primaryCenter.timezone);
  const today = zonedToday(timezone);

  const [adherence, trainerName, plans, pending, billing] = await Promise.all([
    getMemberPlanAdherence(member.id, timezone),
    getLastEpTrainerName(member.id),
    getActiveMembershipPlans(session.user.orgId),
    getPendingSessionFeedback(member.id, timezone),
    getMemberBillingSnapshot(session.user.orgId, member.id),
  ]);

  const [freezePolicy, freezeReasons, cancelReasons] = await Promise.all([
    billing.subscriptionId ? getMemberFreezePolicyView(billing.subscriptionId) : Promise.resolve(null),
    // E14-15: el motivo es obligatorio también aquí, así que el catálogo viaja
    // con la pantalla; sin entradas configuradas el socio no puede congelar y
    // eso es correcto: es dirección quien decide qué motivos existen.
    listFreezeReasons(session.user.orgId),
    listCancelReasons(session.user.orgId),
  ]);

  // Un socio puede tener varios bonos activos a la vez —entrenamiento personal
  // y grupos, por ejemplo—, y cada uno lleva su propio saldo, su caducidad y su
  // renovación. Esta pantalla los enseña TODOS: mientras resolvía el bono como
  // `subscriptions[0]`, el segundo bono no aparecía en ninguna parte y sus
  // sesiones parecían perdidas.
  const bonos = memberBonos(member.subscriptions);
  const activeSub = bonos[0] ?? null;
  const several = bonos.length > 1;
  // Con un solo producto la cuota mensual no necesita tarjeta de saldo (no se
  // agota); con varios sí sale, para que el socio pueda contar sus productos y
  // le cuadren con lo que ve aquí.
  const heroBonos = several ? bonos : bonos.filter((b) => !b.bono.recurring);
  const trainerFirstName = trainerName?.split(" ")[0] ?? null;

  // El aviso de "te quedas sin sesiones" es de UN bono concreto: el numerado
  // que peor anda. Con dos bonos, mirar solo el primero dejaba al socio sin
  // aviso justo en el que estaba agotando.
  const lowestBono = bonos
    .filter((b) => !b.bono.recurring && !b.bono.unlimited)
    .reduce<(typeof bonos)[number] | null>((low, b) => (!low || b.bono.remaining < low.bono.remaining ? b : low), null);

  // Los planes que el socio ya tiene contratados van primero y se etiquetan
  // como renovación de lo suyo, en vez de una compra nueva.
  const ownedPlanIds = new Set(bonos.map((b) => b.planId));
  const sortedPlans = [...plans].sort(
    (a, b) => Number(ownedPlanIds.has(b.id)) - Number(ownedPlanIds.has(a.id))
  );
  const renewPlan = lowestBono ? (plans.find((p) => p.id === lowestBono.planId) ?? null) : null;

  const pendingItems = pending.map((p) => {
    const dateLabel = relativeDayLabel(p.sessionDate, today);
    return {
      bookingId: p.bookingId,
      sessionName: p.sessionName,
      dateLabel,
      time: p.time,
      focus: p.focus,
      trainerName: p.trainerName,
      meta: `${dateLabel} · ${p.time}${p.trainerName ? ` · ${p.trainerName}` : ""}`,
    };
  });

  return (
    <div className="max-w-[1120px] mx-auto flex flex-col gap-[18px]">
      {checkout === "error" && (
        <div className="rounded-control border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical">
          {motivo || "No se ha podido iniciar el pago. Inténtalo de nuevo."}
        </div>
      )}
      {checkout === "success" && (
        <div className="rounded-control border border-good/30 bg-good-bg px-4 py-3 text-sm text-good">
          Pago recibido — en unos segundos tu bono aparecerá activo.
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-3 text-sm text-brand-text-2">
          Has cancelado el pago. Puedes intentarlo de nuevo cuando quieras.
        </div>
      )}

      {/* E5-02: cambio de estado — baja programada o congelación, antes de nada más. */}
      {billing.cancelAt && (
        <div className="rounded-control border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text">
          Baja programada para el {shortDate(billing.cancelAt)}. Hasta entonces sigues teniendo acceso completo.
        </div>
      )}
      {billing.status === "FROZEN" && (
        <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-3 text-sm text-brand-text-2">
          Tu suscripción está congelada{billing.pauseUntil ? ` hasta el ${shortDate(billing.pauseUntil)}` : " sin fecha de reanudación"}.
        </div>
      )}

      {/* Hero del producto contratado */}
      <div className="relative overflow-hidden bg-brand-ink border border-brand-border-dark rounded-[22px] p-6 sm:px-9 sm:py-8 grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-7 tz-fade-up">
        <div
          className="absolute -right-[90px] -top-[90px] w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at 30% 30%, rgba(200,171,114,.22), transparent 70%)" }}
        />
        <div className="relative z-10 flex flex-col justify-between gap-[22px]">
          <div>
            <div className="inline-flex items-center gap-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-apta-gold">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
              {several ? "Productos contratados" : "Producto contratado"}
            </div>
            <div className="font-display font-extrabold text-[28px] sm:text-[34px] leading-[1.05] text-white mt-3.5 uppercase tracking-[-.01em]">
              {!activeSub
                ? "Sin membresía activa"
                : several
                  ? "Tu membresía"
                  : [activeSub.bono.serviceLabel, planNameWithoutService(activeSub.plan.name, activeSub.bono.serviceLabel)]
                      .filter(Boolean)
                      .join(" · ")}
            </div>
            <p className="text-sm text-brand-muted-2 mt-3.5 max-w-[440px] leading-[1.55]">
              {!activeSub ? (
                "Elige un plan más abajo para activar tu acceso."
              ) : several ? (
                <>
                  Tienes {bonos.length} productos activos a la vez y cada uno lleva su propio saldo: gastar una sesión
                  de uno no toca el otro.
                  {trainerName ? (
                    <>
                      {" "}
                      Tu entrenador asignado es <b className="text-tz-bone">{trainerName}</b>.
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Activo desde el {activeSub.startDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  {trainerName ? (
                    <>
                      {" "}
                      · entrenador asignado <b className="text-tz-bone">{trainerName}</b>.
                    </>
                  ) : (
                    "."
                  )}{" "}
                  {activeSub.bono.recurring
                    ? "Cuota mensual mientras no des de baja."
                    : "Renovación manual cuando agotes las sesiones."}
                </>
              )}
            </p>
          </div>
          {activeSub && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                <span
                  className="w-[7px] h-[7px] rounded-full"
                  style={{ background: member.state === "DELINQUENT" ? "var(--color-critical)" : "var(--color-good)" }}
                />
                {member.state === "DELINQUENT" ? "Recibo pendiente" : "Al corriente de pago"}
              </span>
              {adherence.avgPerWeek > 0 && (
                <span className="bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                  {adherence.avgPerWeek} {adherence.avgPerWeek === 1 ? "día" : "días"} / semana
                </span>
              )}
            </div>
          )}
        </div>
        {/* Una tarjeta por bono: el socio que tiene entrenamiento personal y
            grupos ve los DOS saldos, no el del bono que se dio de alta último. */}
        <div className="relative z-10 flex flex-col gap-3">
          {heroBonos.map((b) => {
            const pct = b.bono.total > 0 ? (b.bono.remaining / b.bono.total) * 100 : 0;
            return (
              <div key={b.id} className="bg-white/[.06] border border-white/[.16] rounded-2xl px-5 py-[18px]">
                <div className="text-[11px] font-bold tracking-[.1em] uppercase text-brand-muted">
                  {several ? b.bono.serviceLabel ?? "Sesiones restantes" : "Sesiones restantes"}
                </div>
                {several && (
                  <div className="text-[12.5px] font-semibold text-brand-muted-2 mt-1 leading-[1.35]">
                    {planNameWithoutService(b.plan.name, b.bono.serviceLabel)}
                  </div>
                )}
                {b.bono.unlimited ? (
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-display font-extrabold text-[34px] leading-none text-white">∞</span>
                    <span className="text-base font-bold text-brand-muted-2">sesiones</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span
                        className={`font-display font-extrabold leading-none text-white tabular-nums ${several ? "text-[32px]" : "text-[40px]"}`}
                      >
                        {b.bono.remaining}
                      </span>
                      <span className="text-base font-bold text-brand-muted-2">de {b.bono.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[.14] overflow-hidden mt-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--color-good),var(--color-apta-gold))" }}
                      />
                    </div>
                  </>
                )}
                <div className="text-xs text-brand-muted mt-2">
                  {b.bono.recurring
                    ? "Cuota mensual · sesiones sin límite"
                    : b.endDate
                      ? `Caducan el ${b.endDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`
                      : "Sin fecha de caducidad"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* E5-02: lo que hoy faltaba — cuánto paga, cuándo se le cobra y sus recibos. */}
      {billing.hasSubscription && (
        <div className="bg-white border border-brand-border rounded-2xl p-[22px] tz-fade-up" style={{ animationDelay: "0.06s" }}>
          {/* Con varios productos contratados hay que decir de cuál es este
              importe: el desglose de cobro es de UNA suscripción. */}
          <div className="font-display font-extrabold text-base uppercase text-brand-text">
            {several && billing.planName ? `Tu cuota · ${billing.planName}` : "Tu cuota"}
          </div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-brand-muted">Importe</span>
              <span className="font-display font-extrabold text-base text-brand-text">
                {euros(billing.priceCents ?? 0)}
                {billing.recurring && <span className="text-xs font-bold text-brand-muted-2">/mes</span>}
              </span>
            </div>
            {billing.recurring ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-brand-muted">Próximo cobro</span>
                <span className="text-[13px] font-semibold text-brand-text text-right">
                  {billing.nextChargeAt ? shortDate(billing.nextChargeAt) : "—"}
                  {billing.cardLast4 ? ` · tarjeta ····${billing.cardLast4}` : ""}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-brand-muted">Caduca</span>
                <span className="text-[13px] font-semibold text-brand-text">
                  {billing.expiresAt ? shortDate(billing.expiresAt) : "Sin fecha de caducidad"}
                </span>
              </div>
            )}
          </div>

          {billing.receipts.length > 0 && (
            <div className="mt-5 pt-4 border-t border-brand-border">
              <div className="text-[11px] font-bold uppercase tracking-[.1em] text-brand-muted mb-2.5">Recibos</div>
              <div className="flex flex-col gap-2.5">
                {billing.receipts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-brand-text truncate">{r.concept}</div>
                      <div className="text-xs text-brand-muted mt-0.5">
                        {shortDate(r.date)} · {RECEIPT_STATUS_LABEL[r.status] ?? r.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[13px] font-bold text-brand-text tabular-nums">{euros(r.amountCents)}</span>
                      {r.downloadable ? (
                        <ReceiptDownloadButton paymentId={r.id} />
                      ) : (
                        <span className="text-xs text-brand-muted-2">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* E5-01: gestionar la suscripción y darse de baja sin salir del portal. */}
      {billing.hasSubscription && (
        <SubscriptionManagement
          recurring={billing.recurring}
          hasStripeCustomer={!!member.stripeCustomerId}
          initialCancelAt={billing.cancelAt}
          centerName={member.primaryCenter.name}
          centerPhone={member.primaryCenter.phone}
          cancelReasons={cancelReasons}
          planLabel={several ? billing.planName : null}
        >
          {/* E5-06: congelar/reanudar el bono desde el propio portal. */}
          {freezePolicy && (
            <FreezeManagement
              status={billing.status === "ACTIVE" || billing.status === "FROZEN" ? billing.status : null}
              pauseUntil={billing.pauseUntil}
              policy={freezePolicy}
              freezeReasons={freezeReasons}
            />
          )}
        </SubscriptionManagement>
      )}

      {/* Valora tus sesiones (F16) — el badge de "Mi membresía" en el sidebar cuenta estas pendientes */}
      <PendingSessionsRating pending={pendingItems} />

      <div className="bg-white border border-brand-border rounded-2xl p-[22px] tz-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="font-display font-extrabold text-base uppercase text-brand-text">Renovar o ampliar</div>
        <p className="text-[13px] text-brand-muted mt-1.5 mb-4">Mismo producto o cambio de modalidad, pago online.</p>
        {sortedPlans.length === 0 ? (
          <p className="text-sm text-brand-muted">No hay planes disponibles ahora mismo — contacta con recepción.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sortedPlans.map((plan) => {
              const isCurrent = ownedPlanIds.has(plan.id);
              return (
                <div
                  key={plan.id}
                  className="flex items-center justify-between gap-3 border border-brand-border rounded-xl px-4 py-3.5"
                >
                  <div>
                    <div className="text-[13.5px] font-bold text-brand-text">{plan.name}</div>
                    <div className="text-xs text-brand-muted mt-0.5">
                      {isCurrent ? "Renovar lo que ya tienes" : planPeriodLabel(plan)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display font-extrabold text-base text-brand-text">{euros(plan.priceCents)}</span>
                    <PurchasePlanButton
                      planId={plan.id}
                      className={
                        isCurrent
                          ? "bg-brand-ink text-tz-bone rounded-lg px-3.5 py-[9px] text-xs font-extrabold uppercase disabled:opacity-60"
                          : "border border-brand-border text-brand-text rounded-lg px-3.5 py-[9px] text-xs font-extrabold uppercase transition-colors duration-150 hover:bg-tz-bone disabled:opacity-60"
                      }
                    >
                      {isCurrent ? "Renovar" : "Elegir"}
                    </PurchasePlanButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lowestBono && (
        <Suspense fallback={null}>
          <RenewalModal
            subscriptionId={lowestBono.id}
            sessionsRemaining={lowestBono.bono.remaining}
            sessionsIncluded={lowestBono.bono.total}
            trainerFirstName={trainerFirstName}
            renewPlan={renewPlan ? { id: renewPlan.id, name: renewPlan.name, priceLabel: euros(renewPlan.priceCents) } : null}
          />
        </Suspense>
      )}
    </div>
  );
}
