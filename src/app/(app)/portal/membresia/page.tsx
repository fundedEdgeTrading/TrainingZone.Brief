import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { PlanType } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import {
  getMemberForUser,
  getMemberPlanAdherence,
  getLastEpTrainerName,
  getMemberPaymentHistory,
  getPendingSessionFeedback,
} from "@/lib/portal-queries";
import { getActiveMembershipPlans } from "@/lib/public-membership-queries";
import { isRecurring } from "@/lib/member-billing";
import { planServiceKind } from "@/lib/members-queries";
import { resolveTimezone } from "@/lib/timezone";
import { zonedToday } from "@/lib/date-utils";
import Link from "next/link";
import PurchasePlanButton from "./purchase-plan-button";
import { RenewalModal } from "./renewal-modal";
import { PendingSessionsRating } from "./pending-sessions";

export const metadata: Metadata = { title: "Mi membresía · Training Zone" };

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
 * sesiones) y /portal/comprar (catálogo, facturación) en una sola pantalla
 * "producto contratado" — ver handoff NavBar premium 1b.
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

  const [adherence, trainerName, plans, history, pending] = await Promise.all([
    getMemberPlanAdherence(member.id, timezone),
    getLastEpTrainerName(member.id),
    getActiveMembershipPlans(session.user.orgId),
    getMemberPaymentHistory(member.id),
    getPendingSessionFeedback(member.id, timezone),
  ]);

  const activeSub = member.subscriptions[0];
  const kind = activeSub ? planServiceKind(activeSub.plan.type) : undefined;
  const recurring = activeSub ? isRecurring(activeSub.plan.type) : false;
  const sessionsIncluded = activeSub?.plan.sessionsIncluded ?? 0;
  const sessionsRemaining = activeSub?.sessionsRemaining ?? 0;
  const sessionsPct = sessionsIncluded > 0 ? Math.max(0, Math.min(100, (sessionsRemaining / sessionsIncluded) * 100)) : 0;
  const trainerFirstName = trainerName?.split(" ")[0] ?? null;

  // El plan que coincide con la suscripción activa va primero y se etiqueta
  // como renovación de lo que ya tiene, en vez de una compra nueva.
  const sortedPlans = activeSub
    ? [...plans].sort((a, b) => (a.id === activeSub.planId ? -1 : b.id === activeSub.planId ? 1 : 0))
    : plans;
  const renewPlan = activeSub ? (plans.find((p) => p.id === activeSub.planId) ?? null) : null;

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
              Producto contratado
            </div>
            <div className="font-display font-extrabold text-[28px] sm:text-[34px] leading-[1.05] text-white mt-3.5 uppercase tracking-[-.01em]">
              {activeSub ? `${kind ? SERVICE_LABEL[kind] : ""} · ${activeSub.plan.name}` : "Sin membresía activa"}
            </div>
            <p className="text-sm text-brand-muted-2 mt-3.5 max-w-[440px] leading-[1.55]">
              {activeSub ? (
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
                  {recurring ? "Cuota mensual mientras no des de baja." : "Renovación manual cuando agotes las sesiones."}
                </>
              ) : (
                "Elige un plan más abajo para activar tu acceso."
              )}
            </p>
          </div>
          {activeSub && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                <span
                  className="w-[7px] h-[7px] rounded-full"
                  style={{ background: member.state === "DELINQUENT" ? "#8a3420" : "#4b5a22" }}
                />
                {member.state === "DELINQUENT" ? "Recibo pendiente" : "Al corriente de pago"}
              </span>
              {adherence.avgPerWeek > 0 && (
                <span className="bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                  {adherence.avgPerWeek} {adherence.avgPerWeek === 1 ? "día" : "días"} / semana
                </span>
              )}
              <span className="bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                {euros(activeSub.priceCents)} / {recurring ? "mes" : "bono"}
              </span>
            </div>
          )}
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          {!recurring && (
            <div className="bg-white/[.06] border border-white/[.16] rounded-2xl px-5 py-[18px]">
              <div className="text-[11px] font-bold tracking-[.1em] uppercase text-brand-muted">Sesiones restantes</div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-display font-extrabold text-[40px] leading-none text-white tabular-nums">{sessionsRemaining}</span>
                <span className="text-base font-bold text-brand-muted-2">de {sessionsIncluded}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[.14] overflow-hidden mt-3">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${sessionsPct}%`, background: "linear-gradient(90deg,#4b5a22,#c8ab72)" }}
                />
              </div>
              <div className="text-xs text-brand-muted mt-2">
                {activeSub?.endDate
                  ? `Caducan el ${activeSub.endDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`
                  : "Sin fecha de caducidad"}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[.06] border border-white/[.16] rounded-2xl px-4 py-3.5">
              <div className="text-[10px] font-bold tracking-[.1em] uppercase text-brand-muted">Adherencia</div>
              <div className="font-display font-extrabold text-2xl text-white mt-1.5 tabular-nums">
                {adherence.pct ?? "—"}
                {adherence.pct != null && <span className="text-sm text-brand-muted-2">%</span>}
              </div>
            </div>
            <div className="bg-white/[.06] border border-white/[.16] rounded-2xl px-4 py-3.5">
              <div className="text-[10px] font-bold tracking-[.1em] uppercase text-brand-muted">Racha</div>
              <div className="font-display font-extrabold text-2xl text-white mt-1.5 tabular-nums">
                {adherence.streakWeeks}
                <span className="text-sm text-brand-muted-2"> sem</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Valora tus sesiones (F16) — el badge de "Mi membresía" en el sidebar cuenta estas pendientes */}
      <PendingSessionsRating pending={pendingItems} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-brand-border rounded-2xl p-[22px] tz-fade-up" style={{ animationDelay: "0.1s" }}>
          <div className="font-display font-extrabold text-base uppercase text-brand-text">Renovar o ampliar</div>
          <p className="text-[13px] text-brand-muted mt-1.5 mb-4">Mismo producto o cambio de modalidad, pago online.</p>
          {sortedPlans.length === 0 ? (
            <p className="text-sm text-brand-muted">No hay planes disponibles ahora mismo — contacta con recepción.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {sortedPlans.map((plan) => {
                const isCurrent = activeSub?.planId === plan.id;
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

        <div className="bg-white border border-brand-border rounded-2xl p-[22px] tz-fade-up" style={{ animationDelay: "0.14s" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="font-display font-extrabold text-base uppercase text-brand-text">Historial</div>
            <Link href="/portal/membresia/facturas" className="text-xs font-bold text-brand-muted hover:text-brand-text uppercase tracking-[.04em]">
              Ver todo →
            </Link>
          </div>
          <p className="text-[13px] text-brand-muted mt-1.5 mb-4">Últimos movimientos de tu membresía.</p>
          {history.length === 0 ? (
            <p className="text-sm text-brand-muted">Todavía no hay pagos registrados.</p>
          ) : (
            <div className="flex flex-col">
              {history.map((h, i) => (
                <div
                  key={h.id}
                  className={`flex items-center justify-between gap-3 py-[11px] text-[13px] ${
                    i < history.length - 1 ? "border-b border-tz-sand" : ""
                  }`}
                >
                  <span className="text-brand-text">{h.concept}</span>
                  <span className="text-brand-muted">
                    {h.date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })} · {euros(h.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeSub && !recurring && (
        <Suspense fallback={null}>
          <RenewalModal
            subscriptionId={activeSub.id}
            sessionsRemaining={sessionsRemaining}
            sessionsIncluded={sessionsIncluded}
            trainerFirstName={trainerFirstName}
            renewPlan={renewPlan ? { id: renewPlan.id, name: renewPlan.name, priceLabel: euros(renewPlan.priceCents) } : null}
          />
        </Suspense>
      )}
    </div>
  );
}
