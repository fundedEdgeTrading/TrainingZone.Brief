"use client";

import { useEffect } from "react";
import Script from "next/script";

import {
  CONVERSION_ATTRIBUTE,
  isConversionName,
  type AnalyticsConfig,
  type ConversionName,
} from "@/lib/analytics";

declare global {
  interface Window {
    /** La cola que expone la analítica sin cookies. Puede no existir: es opcional a propósito. */
    plausible?: (event: string, options?: { props?: Record<string, string> }) => void;
  }
}

/**
 * Dispara un evento de conversión. Es la vía imperativa, para cuando la
 * conversión no ocurre al enviar sino al RESPONDER — el formulario de leads no
 * navega: manda una acción de servidor y solo entonces se sabe si el lead ha
 * entrado. Contarlo en el `submit` contaría también los envíos que fallan.
 *
 * Nunca lanza: la analítica puede no haber cargado todavía, o estar bloqueada
 * por una extensión, y medir jamás puede impedir convertir.
 */
export function trackConversion(name: ConversionName) {
  try {
    window.plausible?.(name);
  } catch {
    /* silencio deliberado */
  }
}

/**
 * E9-09 · Analítica sin cookies + eventos de conversión.
 *
 * Un único componente en el layout raíz, y no una llamada en cada formulario:
 * los tres puntos de conversión viven en tres carpetas distintas, y una función
 * que hay que acordarse de llamar es una función que alguien no llamará. Aquí
 * se escucha `submit` en fase de captura y se dispara el evento del atributo
 * `data-tz-conversion` del formulario, sea cual sea la carpeta y sea el envío
 * nativo (POST a `/api/checkout`) o una acción de servidor.
 *
 * Captura y no burbujeo: un `preventDefault` en el manejador del formulario no
 * puede dejar el evento sin contar.
 *
 * Sin analítica configurada no se carga nada y el escuchador no hace más que
 * comprobar un atributo — es lo que se quiere en desarrollo y en CI.
 */
export function Analytics({ config }: { config: AnalyticsConfig | null }) {
  useEffect(() => {
    function onSubmit(event: Event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const name = form.getAttribute(CONVERSION_ATTRIBUTE);
      if (isConversionName(name)) trackConversion(name);
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  if (!config) return null;

  return (
    <Script
      // `afterInteractive`: medir no compite con pintar. La visita se registra
      // igual, unos milisegundos después.
      strategy="afterInteractive"
      src={config.src}
      data-domain={config.domain}
    />
  );
}
