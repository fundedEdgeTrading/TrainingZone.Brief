"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { previewMemberFreeze, requestMemberFreeze, resumeMemberFreeze, type FreezeConflict } from "./freeze-actions";
import type { FreezePolicyView } from "./freeze-view";

function shortDate(date: Date) {
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

type Step = "closed" | "form" | "conflicts";

/**
 * E5-06: congelar el bono desde el propio portal — hoy solo lo toca el
 * staff. El socio ve los límites del centro (días/año, antelación) antes de
 * pedirlo, y si tiene reservas dentro del periodo elige explícitamente si las
 * mantiene o las cancela.
 */
export function FreezeManagement({
  status,
  pauseUntil,
  policy,
}: {
  status: "ACTIVE" | "FROZEN" | null;
  pauseUntil: Date | null;
  policy: FreezePolicyView;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [conflicts, setConflicts] = useState<FreezeConflict[]>([]);
  const [keepBookings, setKeepBookings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingResume, startResume] = useTransition();
  const toast = useToast();

  function openForm() {
    setStart("");
    setEnd("");
    setError(null);
    setStep("form");
  }

  function continueToPreview() {
    setError(null);
    if (!start || !end) {
      setError("Indica fecha de inicio y de fin.");
      return;
    }
    startTransition(async () => {
      const result = await previewMemberFreeze(start, end);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setKeepBookings(true);
        setStep("conflicts");
      } else {
        confirmFreeze([]);
      }
    });
  }

  function confirmFreeze(cancelIds: string[]) {
    setError(null);
    startTransition(async () => {
      const result = await requestMemberFreeze(start, end, cancelIds);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep("closed");
      toast.success("Tu bono queda congelado.");
    });
  }

  function resume() {
    startResume(async () => {
      const result = await resumeMemberFreeze();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Bono reanudado.");
    });
  }

  if (status === "FROZEN") {
    return (
      <div className="mt-3.5 pt-3.5 border-t border-brand-border flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[13px] text-brand-muted">
          Bono congelado{pauseUntil ? ` hasta el ${shortDate(pauseUntil)}` : ""}.
        </span>
        <button
          type="button"
          onClick={resume}
          disabled={pendingResume}
          className="text-xs font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink disabled:opacity-60"
        >
          {pendingResume ? "Reanudando…" : "Reanudar ahora"}
        </button>
      </div>
    );
  }

  if (status !== "ACTIVE") return null;

  return (
    <div className="mt-3.5 pt-3.5 border-t border-brand-border">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11.5px] text-brand-muted">
          Hasta {policy.maxDaysPerYear} días de congelación al año (te quedan {policy.remainingDays}), pidiéndolo con{" "}
          {policy.minNoticeDays} días de antelación.
        </p>
        {step === "closed" && (
          <button
            type="button"
            onClick={openForm}
            className="text-xs font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink shrink-0"
          >
            Congelar mi bono
          </button>
        )}
      </div>

      {step !== "closed" && (
        <div className="mt-3.5 border border-brand-border rounded-xl p-4 bg-tz-bone/40 flex flex-col gap-3.5">
          {step === "form" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-brand-muted uppercase tracking-[.06em]">
                  Desde
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="border border-brand-border rounded-lg px-2.5 py-2 text-sm text-brand-text normal-case font-medium"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-brand-muted uppercase tracking-[.06em]">
                  Hasta
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="border border-brand-border rounded-lg px-2.5 py-2 text-sm text-brand-text normal-case font-medium"
                  />
                </label>
              </div>
              {error && <p className="text-xs text-critical">{error}</p>}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={continueToPreview}
                  disabled={pending}
                  className="bg-brand-ink text-tz-bone rounded-lg px-4 py-2 text-xs font-extrabold uppercase disabled:opacity-60"
                >
                  {pending ? "Comprobando…" : "Continuar"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("closed")}
                  className="border border-brand-border text-brand-text rounded-lg px-4 py-2 text-xs font-extrabold uppercase hover:bg-tz-bone"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}

          {step === "conflicts" && (
            <>
              <p className="text-sm font-bold text-brand-text">
                Tienes {conflicts.length} {conflicts.length === 1 ? "reserva" : "reservas"} en ese periodo
              </p>
              <ul className="text-[13px] text-brand-muted list-disc pl-4 flex flex-col gap-0.5">
                {conflicts.map((c) => (
                  <li key={c.bookingId}>
                    {c.sessionName} · {c.dayLabel} · {c.startTime}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-brand-text">
                  <input type="radio" checked={keepBookings} onChange={() => setKeepBookings(true)} />
                  Mantenerlas
                </label>
                <label className="flex items-center gap-2 text-sm text-brand-text">
                  <input type="radio" checked={!keepBookings} onChange={() => setKeepBookings(false)} />
                  Cancelarlas
                </label>
              </div>
              {error && <p className="text-xs text-critical">{error}</p>}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => confirmFreeze(keepBookings ? [] : conflicts.map((c) => c.bookingId))}
                  className="bg-brand-ink text-tz-bone rounded-lg px-4 py-2 text-xs font-extrabold uppercase disabled:opacity-60"
                >
                  {pending ? "Congelando…" : "Confirmar congelación"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="border border-brand-border text-brand-text rounded-lg px-4 py-2 text-xs font-extrabold uppercase hover:bg-tz-bone"
                >
                  Atrás
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
