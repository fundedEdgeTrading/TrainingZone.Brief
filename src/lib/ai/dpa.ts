/**
 * Contrato de encargado del tratamiento con el proveedor de IA (decisión D-C5,
 * dentro de E3-15).
 *
 * *"El DPA con Anthropic se firma antes del piloto. Hasta entonces la IA no
 * toca datos de un socio real."*
 *
 * Mientras no conste firmado, la generación y el refinado **se bloquean para
 * socios reales** y solo operan sobre las organizaciones de demostración. No es
 * un aviso que se pueda cerrar: es una puerta, y el motivo se explica en
 * pantalla para que nadie tenga que adivinar por qué el botón no funciona.
 *
 * La firma se declara por entorno, no en base de datos: es un hecho del
 * contrato entre Apta y Anthropic, igual para todos los clientes, y tenerlo en
 * una fila editable sería darle a cualquier dirección de centro la llave de un
 * bloqueo de cumplimiento.
 *
 *   AI_DPA_SIGNED_AT="2026-09-20"   → firmado a partir de esa fecha
 *   AI_DEMO_ORG_SLUGS="a,b"         → organizaciones cuyos datos son de demo
 */

/** Organizaciones sembradas por `prisma/seed.ts`: datos inventados, no personas. */
const DEFAULT_DEMO_ORG_SLUGS = ["training-zone"];

export function aiDpaSignedAt(): Date | null {
  const raw = process.env.AI_DPA_SIGNED_AT?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Firmado = hay fecha y ya ha llegado. Una fecha futura todavía no vale. */
export function isAiDpaSigned(now: Date = new Date()): boolean {
  const signedAt = aiDpaSignedAt();
  return signedAt !== null && signedAt.getTime() <= now.getTime();
}

export function demoOrgSlugs(): string[] {
  const raw = process.env.AI_DEMO_ORG_SLUGS?.trim();
  if (!raw) return DEFAULT_DEMO_ORG_SLUGS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isDemoOrgSlug(slug: string | null | undefined): boolean {
  return !!slug && demoOrgSlugs().includes(slug);
}

export const AI_DPA_BLOCKED_REASON =
  "La generación con IA está bloqueada: el contrato de encargado del tratamiento con el " +
  "proveedor de IA no consta firmado (decisión D-C5). Hasta que lo esté, la IA solo opera " +
  "sobre datos de demostración, nunca sobre los de un socio real.";

export type AiGenerationGate = { allowed: true } | { allowed: false; reason: string };

/**
 * ¿Puede este socio pasar por la IA? Se pregunta ANTES de leer su ficha, no
 * después: el bloqueo es sobre el tratamiento, y leer la ficha para luego no
 * usarla ya sería tratarla.
 */
export function aiGenerationGate(org: { slug: string | null }, now: Date = new Date()): AiGenerationGate {
  if (isAiDpaSigned(now)) return { allowed: true };
  if (isDemoOrgSlug(org.slug)) return { allowed: true };
  return { allowed: false, reason: AI_DPA_BLOCKED_REASON };
}
