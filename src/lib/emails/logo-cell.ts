import type { EmailLogo } from "@/lib/brand-logo";

/**
 * Logo de la cabecera de los emails, que es oscura (`#1D1D1C`). Lo comparten
 * `templates.ts` y `flow-templates.ts`: antes cada una llevaba su copia de la
 * etiqueta `<img>`, con un tamaño fijo de 155×26 que deformaba cualquier logo
 * que no fuera el de Apta.
 *
 * `emailBrandLogo` (src/lib/brand-logo.ts) da la versión para fondo oscuro o,
 * si el gimnasio no la tiene, el logo normal marcado para ir sobre una pastilla
 * clara. Una cadena suelta es una URL que ya vale para fondo oscuro (el logo de
 * Apta en blanco).
 */
export type LogoInput = string | EmailLogo;

/** El mismo hueso que `.tz-logo-plate` en la web. */
const PLATE = "#F4F0E8";

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function emailLogoCellHtml(logo: LogoInput, alt: string): string {
  const { url, onPlate } = typeof logo === "string" ? { url: logo, onPlate: false } : logo;
  if (url.endsWith("/brand/tz-logo-white.png")) {
    // El de Apta: proporción conocida, tamaño fijo (Outlook necesita los dos).
    return `<img src="${attr(url)}" alt="${attr(alt)}" width="155" height="26" style="height:26px;width:155px;display:block;border:0;">`;
  }
  // Logo del gimnasio: proporción desconocida. Alto fijo y ancho automático
  // con tope, para no deformarlo.
  const img = `<img src="${attr(url)}" alt="${attr(alt)}" height="26" style="height:26px;width:auto;max-width:200px;display:block;border:0;">`;
  if (!onPlate) return img;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td style="background:${PLATE};border-radius:8px;padding:6px 10px;">${img}</td></tr></table>`;
}
