"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { loadTrainerAgendaDay } from "./agenda-actions";
import { shiftDayISO, type TrainerAgendaDayView } from "./agenda-day";

const ARROW_CLASS =
  "inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand-border text-brand-text-2 transition-colors enabled:hover:bg-brand-bg enabled:hover:text-brand-text disabled:opacity-30 disabled:cursor-default";

/**
 * Tarjeta "Agenda de hoy" con navegación por días.
 *
 * Las flechas eran `<Link href="/trainer?day=...">`: cada salto de día era una
 * navegación de página entera, con el esqueleto de `loading.tsx` tapándolo todo
 * (se veía como una recarga) y el scroll de vuelta arriba. Ahora el día se pide
 * con una acción de servidor y solo se repinta esta tarjeta; la URL se
 * sincroniza con `history.replaceState` para que el día siga sobreviviendo a un
 * refresco o a compartir el enlace, pero sin navegar.
 *
 * `spotlight` (sesión en curso / próxima) siempre habla de hoy, así que se
 * pinta en el servidor y solo se oculta al mirar otro día: se queda montado y
 * su cuenta atrás sigue corriendo.
 */
export function TrainerAgendaCard({
  initialView,
  todayISO,
  statusLabel,
  spotlight,
  delay = 0.28,
}: {
  initialView: TrainerAgendaDayView;
  todayISO: string;
  statusLabel: string | null;
  spotlight: React.ReactNode;
  delay?: number;
}) {
  const [view, setView] = useState(initialView);
  // Las flechas cuentan desde el último día pedido, no desde el pintado: así
  // varios clics seguidos avanzan varios días en vez de perderse esperando a
  // que vuelva el primero.
  const [targetDay, setTargetDay] = useState(initialView.dayISO);
  const lastRequested = useRef(initialView.dayISO);
  const [navigated, setNavigated] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function goToDay(dayISO: string) {
    if (dayISO === lastRequested.current || dayISO < todayISO) return;
    lastRequested.current = dayISO;
    setTargetDay(dayISO);
    setNavigated(true);
    const shown = view.dayISO;
    startTransition(async () => {
      try {
        const next = await loadTrainerAgendaDay(dayISO);
        // Respuesta atrasada: si ya se ha pedido otro día, manda el último clic.
        if (lastRequested.current !== next.dayISO) return;
        setView(next);
        // Solo la URL, sin navegar: el día sobrevive a un refresco y el enlace
        // se puede compartir, pero no se remonta la pantalla.
        window.history.replaceState(null, "", next.isToday ? "/trainer" : `/trainer?day=${next.dayISO}`);
      } catch {
        // La tarjeta se queda en el día que ya mostraba: preferible a vaciarla
        // o a tirar de la pantalla entera con un error.
        lastRequested.current = shown;
        setTargetDay(shown);
        toast.error("No se ha podido cargar la agenda de ese día.");
      }
    });
  }

  // La cascada de entrada está pensada para la carga inicial de la página; al
  // cambiar de día con las flechas se acorta para que la lista responda ya.
  const baseDelay = navigated ? 0.04 : 0.34;

  return (
    <Card
      title={view.title}
      meta={view.meta}
      delay={delay}
      action={
        <div className="flex items-center gap-3">
          {view.isToday && statusLabel && <span className="text-xs font-semibold text-brand-muted">{statusLabel}</span>}
          <div className="flex items-center gap-1">
            {!view.isToday && (
              <button
                type="button"
                onClick={() => goToDay(todayISO)}
                className="mr-1 text-xs font-bold uppercase tracking-[.06em] text-brand-muted hover:text-brand-text"
              >
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={() => goToDay(shiftDayISO(targetDay, -1))}
              disabled={targetDay <= todayISO}
              aria-label="Día anterior"
              className={ARROW_CLASS}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goToDay(shiftDayISO(targetDay, 1))}
              aria-label="Día siguiente"
              className={ARROW_CLASS}
            >
              ›
            </button>
          </div>
        </div>
      }
    >
      {/* Spotlight: solo aplica al día real de hoy, es estado en tiempo real */}
      <div hidden={!view.isToday}>{spotlight}</div>

      {/* Timeline */}
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity duration-200" : "transition-opacity duration-200"}>
        {view.sessions.length === 0 ? (
          view.isToday ? null : (
            <EmptyState title="Sin sesiones" description="No tienes sesiones programadas ese día." />
          )
        ) : (
          // El timeline crece con las sesiones del día: se acota para que la
          // tarjeta no empuje el resto del panel y se navega con scroll propio.
          <div className="max-h-[420px] overflow-y-auto -mr-1.5 pr-1.5">
            <div className="relative pl-[26px]">
              <span className="absolute left-[5px] top-[6px] bottom-[6px] w-[2px] rounded-full bg-gradient-to-b from-tz-linen to-tz-sand" />
              {/* `key` por día: la cascada de entrada se repite en cada salto en
                  vez de dejar a medias las filas que comparten id (recurrentes). */}
              <div key={view.dayISO} className="flex flex-col">
                {view.sessions.map((s, i) => (
                  <Link
                    key={s.id}
                    href={s.status === "past" ? `/agenda/session/${s.id}` : `/brief/${s.id}`}
                    // En móvil el chip baja a su propia línea: compartiendo fila
                    // con el título dejaba a este unos 60 px y todas las
                    // sesiones se leían "Fun…", "Pers…".
                    className={`relative grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:gap-4 p-[13px_14px] rounded-xl transition-[transform,background-color] duration-200 hover:translate-x-[3px] hover:bg-brand-bg tz-fade-up ${
                      s.status === "current" ? "bg-brand-bg" : s.status === "past" ? "opacity-60 hover:opacity-100" : ""
                    }`}
                    style={{ animationDelay: `${baseDelay + i * 0.04}s` }}
                  >
                    <span
                      className="absolute left-[-26px] top-1/2 -mt-[5px] w-3 h-3 rounded-full border-[3px] border-white"
                      style={{ background: s.status === "current" ? "var(--color-apta-gold)" : s.status === "past" ? "var(--color-brand-text-2)" : "var(--color-tz-linen)" }}
                    />
                    <div>
                      <div className="text-[13px] font-bold tabular-nums text-brand-text-2">{s.startTime}</div>
                      <div className="text-[11px] text-brand-muted-2">{s.durationMin} min</div>
                    </div>
                    <div className="min-w-0">
                      <div className={`text-[15px] font-bold text-brand-text truncate ${s.status === "current" ? "font-extrabold" : ""}`}>{s.title}</div>
                      <div className="text-xs text-brand-muted truncate">{s.meta}</div>
                    </div>
                    <span className="col-start-2 justify-self-start sm:col-auto sm:justify-self-auto">
                      <Badge tone={s.chipTone}>{s.chipLabel}</Badge>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
