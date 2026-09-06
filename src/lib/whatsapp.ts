/**
 * E12-17 · WhatsApp `wa.me` con mensaje pre-escrito. Decisión D-P3: solo
 * España durante este trimestre, así que no hace falta i18n de prefijos
 * internacionales — un móvil español de 9 dígitos se antepone con 34.
 *
 * Deliberadamente NO hay integración con la API de WhatsApp Business (sin
 * verificación de negocio, sin plantillas aprobadas, sin coste por
 * conversación): solo el enlace `wa.me` con el texto ya escrito, que el
 * destinatario del clic revisa y puede editar dentro de la propia WhatsApp
 * antes de enviarlo.
 */

/** Normaliza un teléfono español a dígitos con prefijo de país, o `null` si no hay teléfono utilizable. */
export function spanishWhatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  if (digits.length === 9) return `34${digits}`;
  if (digits.startsWith("34") && digits.length === 11) return digits;
  // Otro prefijo de país explícito (socio extranjero dado de alta con su
  // número real): se respeta tal cual en vez de forzar España sobre él.
  return digits.length >= 10 ? digits : null;
}

export type WhatsappLink = { ok: true; url: string } | { ok: false; reason: "sin_telefono" };

export function buildWhatsappLink(phone: string | null | undefined, message: string): WhatsappLink {
  const digits = spanishWhatsappDigits(phone);
  if (!digits) return { ok: false, reason: "sin_telefono" };
  return { ok: true, url: `https://wa.me/${digits}?text=${encodeURIComponent(message)}` };
}
