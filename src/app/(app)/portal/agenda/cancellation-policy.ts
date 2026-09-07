/**
 * E5-05: un único texto para la política de cancelación, repetido en la
 * tarjeta (antes de reservar) y junto al botón de confirmar (antes de
 * confirmar) — con el número real de horas del centro, nunca un literal fijo
 * en el cliente (`cancelWindowHours` siempre llega del servidor).
 */
export function cancellationPolicyLabel(cancelWindowHours: number): string {
  return `Cancelación gratuita hasta ${cancelWindowHours}h antes de la clase.`;
}

export function cancellationPolicyShortLabel(cancelWindowHours: number): string {
  return `Cancela gratis hasta ${cancelWindowHours}h antes.`;
}
