import { sessionServiceKind } from "@/lib/members-queries";
import { canCancelWithoutPenalty } from "@/lib/portal-queries";
import BookingButton from "./booking-button";

type BookableSession = {
  id: string;
  name: string;
  classType: string;
  startTime: string;
  capacity: number;
  bookedCount: number;
  trainerName: string | null;
  startsAt: Date;
  myBookingId: string | null;
  myBookingStatus: string | null;
};

/**
 * Tarjeta premium de sesión reservable. Componente de servidor (solo
 * presentación) que envuelve el `BookingButton` (cliente). El tipo de sesión
 * —Grupo reducido vs Entrenamiento personal— se deriva del `classType` y se
 * muestra siempre como badge, con indicador visual distinto por tipo.
 */
export default function SessionCard({ session: s }: { session: BookableSession }) {
  const kind = sessionServiceKind(s.classType);
  const isGroup = kind === "GROUP";
  const full = s.bookedCount >= s.capacity;
  const booked = !!s.myBookingId;
  const pct = isGroup ? Math.min(100, Math.round((s.bookedCount / s.capacity) * 100)) : 0;

  return (
    <div className="relative overflow-hidden bg-brand-card border border-brand-border rounded-2xl p-[18px] pb-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:shadow-[0_14px_30px_-16px_rgba(29,29,28,.3)] hover:border-brand-border-hover">
      <div className="flex items-start justify-between gap-2.5">
        <div className="font-display font-extrabold text-[22px] leading-none text-brand-text tracking-[-.01em]">
          {s.startTime}
        </div>
        {isGroup ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.05em] rounded-full px-[11px] py-[5px] bg-[#eef0e4] text-[#4b5a22]">
            <span className="inline-flex items-center">
              <span className="w-[9px] h-[9px] rounded-full bg-[#4b5a22]" />
              <span className="w-[9px] h-[9px] rounded-full bg-[#4b5a22] -ml-[3px] border-[1.5px] border-[#eef0e4]" />
              <span className="w-[9px] h-[9px] rounded-full bg-[#4b5a22] -ml-[3px] border-[1.5px] border-[#eef0e4]" />
            </span>
            Grupo reducido
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.05em] rounded-full px-[11px] py-[5px] bg-brand-ink text-tz-bone">
            <span className="w-[9px] h-[9px] rounded-full bg-tz-bone" />
            Entrenamiento personal
          </span>
        )}
      </div>

      <div className="text-base font-bold text-brand-text mt-3">{s.name}</div>
      <div className="text-[13px] text-brand-muted mt-[3px]">{s.trainerName ?? "Sin entrenador"}</div>

      {isGroup ? (
        <div className="mt-3.5">
          <div className="h-1.5 rounded-full bg-tz-sand overflow-hidden">
            <div
              className="h-full bg-good rounded-full origin-left [animation:tzGrow_.7s_ease-out_both]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs font-semibold text-brand-muted mt-1.5">
            {s.bookedCount} / {s.capacity} plazas
            {full && !booked && " · lista de espera"}
          </div>
        </div>
      ) : (
        <div className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-ink" />
          Sesión individual · 1 a 1
        </div>
      )}

      <div className="flex items-center gap-2.5 mt-4">
        {booked && (
          <span className="inline-flex items-center bg-[#e9f9ef] text-good rounded-full px-[11px] py-1.5 text-xs font-bold">
            Reservada
          </span>
        )}
        <BookingButton
          sessionId={s.id}
          myBookingId={s.myBookingId}
          myBookingStatus={s.myBookingStatus}
          full={full}
          canCancelFreely={canCancelWithoutPenalty(s.startsAt)}
        />
      </div>
    </div>
  );
}
