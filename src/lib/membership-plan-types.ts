import type { PlanType } from "@prisma/client";
import { planServiceKind, type ServiceKind } from "@/lib/session-balance";

/**
 * E4-29 · La parte del producto que NO toca la base de datos: tipos, rótulos y
 * la regla de qué tipo queda tras guardar.
 *
 * Vive aparte de `membership-plans.ts` porque de aquí tiran también componentes
 * de cliente (el formulario de edición): importar el módulo con Prisma dentro
 * arrastraba el driver de Postgres al bundle del navegador y rompía el build.
 */

export const PLAN_TYPES: PlanType[] = ["MONTHLY", "SESSION_PACK", "DROP_IN", "PERSONAL_TRAINING", "DUO", "ONLINE"];

/** Rótulo único de cada tipo de producto, compartido por las dos superficies. */
export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  MONTHLY: "Cuota mensual",
  SESSION_PACK: "Bono de sesiones",
  DROP_IN: "Sesión suelta",
  PERSONAL_TRAINING: "Entrenamiento personal",
  DUO: "Dúo",
  ONLINE: "Online",
};

/** Tipos que consumen sesiones de un bono: para ellos las sesiones incluidas son obligatorias. */
export const PACK_TYPES: PlanType[] = ["SESSION_PACK", "PERSONAL_TRAINING", "DUO"];

/** Traducción de la modalidad de tres valores de la app al tipo del dominio. */
export function planTypeFor(serviceKind: ServiceKind, sessionsIncluded: number | null): PlanType {
  if (serviceKind === "EP") return "PERSONAL_TRAINING";
  if (serviceKind === "ONLINE") return "ONLINE";
  return sessionsIncluded ? "SESSION_PACK" : "MONTHLY";
}

/**
 * Qué tipo queda tras guardar.
 *
 * La regla que faltaba: si quien edita manda una MODALIDAD y el producto ya es
 * de esa modalidad, se conserva su tipo. Sin esto, guardar una "sesión suelta"
 * desde la app la convertía en bono de sesiones sin que nadie lo pidiera —
 * traducir `GROUP` siempre daba `SESSION_PACK` o `MONTHLY`.
 */
export function resolvePlanType(
  current: PlanType | null,
  input: { planType?: PlanType | null; serviceKind?: ServiceKind | null; sessionsIncluded: number | null }
): PlanType {
  if (input.planType) return input.planType;
  if (!input.serviceKind) return current ?? planTypeFor("GROUP", input.sessionsIncluded);
  if (current && planServiceKind(current) === input.serviceKind) return current;
  return planTypeFor(input.serviceKind, input.sessionsIncluded);
}
