import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { BookingStatus } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { getMemberMovements } from "@/lib/member-movements";
import { SERVICE_LABEL } from "@/lib/service-labels";

/**
 * E5-09: la mitad web del libro de movimientos del bono que ya tenía la app
 * (`/api/mobile/v1/portal/consumption`, E2-15). Lee `getMemberMovements`
 * (`@/lib/member-movements`), la misma función que consume la ruta móvil —
 * no una consulta parecida — para que el escenario "paridad con la app" se
 * cumpla porque las dos superficies leen el mismo origen.
 */
export const metadata: Metadata = { title: "Movimientos del bono · Training Zone" };

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  BOOKED: "Reservada",
  WAITLISTED: "Lista de espera",
  CANCELLED: "Cancelada",
  ATTENDED: "Asistida",
  NO_SHOW: "No presentada",
};

const TONE_CLASS: Record<"neutral" | "critical" | "good", string> = {
  neutral: "text-brand-text",
  critical: "text-critical",
  good: "text-good",
};

function shortDate(dayParam: string) {
  // `formatDateParam` da "YYYY-MM-DD" en hora local; se reconstruye a
  // mediodía para que el `toLocaleDateString` no se cruce de día por zona horaria.
  const [year, month, day] = dayParam.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PortalMovimientosPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const view = await getMemberMovements(member.id);

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-[18px]">
      <div>
        <h2 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text leading-none">
          Movimientos del bono
        </h2>
        <p className="text-sm text-brand-muted mt-1.5">
          Cada sesión gastada y cada devolución, con fecha, motivo y saldo resultante.
        </p>
      </div>

      {view.balances.length === 0 ? (
        <p className="text-sm text-brand-muted">No tienes ningún bono activo.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {view.balances.map((b) => (
            <div key={b.subscriptionId} className="bg-white border border-brand-border rounded-2xl p-[18px]">
              <div className="text-[11px] font-bold tracking-[.1em] uppercase text-brand-muted">
                {SERVICE_LABEL[b.serviceKind]} · {b.planName}
              </div>
              {b.unlimited ? (
                <div className="font-display font-extrabold text-xl text-brand-text mt-2">Ilimitado</div>
              ) : (
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="font-display font-extrabold text-[28px] leading-none text-brand-text tabular-nums">
                    {b.remaining}
                  </span>
                  <span className="text-sm font-bold text-brand-muted-2">de {b.total} restantes</span>
                </div>
              )}
              {b.renewsAt && <div className="text-xs text-brand-muted mt-2">Caduca el {shortDate(b.renewsAt)}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-brand-border rounded-2xl p-[22px]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="font-display font-extrabold text-base uppercase text-brand-text">Historial</div>
          <div className="text-xs text-brand-muted">
            {view.summary.spent} gastadas · {view.summary.returned} devueltas
          </div>
        </div>
        {view.detailSince && (
          <p className="text-xs text-brand-muted-2 mt-1.5">Detalle disponible desde el {shortDate(view.detailSince)}.</p>
        )}

        {view.movements.length === 0 ? (
          <p className="text-sm text-brand-muted mt-4">Todavía no hay movimientos en tu bono.</p>
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-brand-border">
            {view.movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-brand-text truncate">{m.concept}</div>
                  <div className="text-xs text-brand-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{shortDate(m.day)}</span>
                    {m.reason && (
                      <>
                        <span>·</span>
                        <span>{m.reason}</span>
                      </>
                    )}
                    {m.bookingStatus && (
                      <>
                        <span>·</span>
                        <span>{BOOKING_STATUS_LABEL[m.bookingStatus]}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[13.5px] font-extrabold tabular-nums ${TONE_CLASS[m.tone]}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </div>
                  <div className="text-xs text-brand-muted mt-0.5 tabular-nums">
                    {m.balanceAfter == null ? "—" : `saldo ${m.balanceAfter}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
