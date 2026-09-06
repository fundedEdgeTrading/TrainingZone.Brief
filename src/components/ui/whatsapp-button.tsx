"use client";

import { buttonClass } from "@/components/ui/button";
import { buildWhatsappLink } from "@/lib/whatsapp";

/**
 * E12-17 · botón "Abrir WhatsApp" para los tres puntos de entrada (alerta de
 * retención, recibo fallido, lead sin responder). El mensaje llega ya
 * redactado con el nombre y el motivo; el destinatario del clic lo revisa y
 * puede editarlo dentro de la propia WhatsApp antes de enviarlo — no hace
 * falta un editor propio.
 *
 * `onOpen` registra la traza (que se abrió el contacto) ANTES de abrir la
 * pestaña nueva: si el navegador bloquea el popup, al menos la apertura queda
 * registrada, que es lo que pide la historia (E12-17), no si WhatsApp llegó a
 * cargar.
 */
export function WhatsAppButton({
  phone,
  message,
  logAction,
  size = "sm",
}: {
  phone: string | null | undefined;
  message: string;
  /** Server action que deja la traza (E12-17): se dispara al hacer clic, sin esperar a que termine. */
  logAction?: () => Promise<unknown>;
  size?: "sm" | "md" | "lg";
}) {
  const link = buildWhatsappLink(phone, message);

  if (!link.ok) {
    return (
      <span className="text-xs text-brand-muted" title="Este contacto no tiene teléfono guardado">
        Sin teléfono
      </span>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        logAction?.();
      }}
      className={buttonClass({ variant: "secondary", size })}
    >
      <span aria-hidden="true">💬</span> Abrir WhatsApp
    </a>
  );
}
