"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * F4 §5.3: con una valoración vencida el socio ve el formulario al entrar.
 *
 * **Con salida, siempre.** Un bloqueo sin escape deja al socio encerrado fuera
 * de su propia reserva por no haber contestado a unas preguntas, y eso es un
 * problema mayor que la valoración que falta. El aviso se cierra y no vuelve a
 * saltar en esta visita; en la siguiente sí, mientras siga pendiente.
 */
export function PendingAssessmentGate({
  label,
  portalPath,
  dueDateLabel,
}: {
  label: string;
  portalPath: string;
  dueDateLabel: string;
}) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  // El aviso vive en el layout del portal, que también envuelve a la pantalla
  // de la valoración: sin esto, el botón llevaría a una página tapada por el
  // mismo aviso que se acaba de pulsar.
  if (!open || pathname.startsWith(portalPath)) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-5 bg-[rgba(20,20,18,.55)] backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-[480px] max-w-full bg-white rounded-[22px] overflow-hidden shadow-pop"
      >
        <div className="px-7 pt-7 pb-5 border-b border-brand-border">
          <div className="text-[11px] font-bold tracking-[.12em] uppercase text-brand-muted">Valoración pendiente</div>
          <div className="font-display font-extrabold text-[22px] text-brand-text mt-1.5 tracking-[-.01em]">{label}</div>
        </div>
        <div className="px-7 py-6 flex flex-col gap-4">
          <p className="text-[14.5px] text-brand-text-2 leading-[1.6]">
            Te tocaba el <b>{dueDateLabel}</b>. La pasas con tu entrenador en la próxima sesión: son unos minutos y es
            lo que le permite ver cómo has evolucionado de verdad, en vez de por sensación.
          </p>
          <Link
            href={portalPath}
            className="block text-center bg-brand-ink text-tz-bone rounded-[11px] px-7 py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-brand-ink-soft transition-colors duration-150"
          >
            Ver mi valoración →
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="text-[13.5px] font-bold text-brand-muted hover:text-brand-text transition-colors duration-150"
          >
            Ahora no, seguir a mi portal
          </button>
        </div>
      </div>
    </div>
  );
}
