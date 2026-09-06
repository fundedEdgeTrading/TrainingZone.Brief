import type { ServiceKind } from "@/lib/session-balance";

/**
 * E12-04 · Cómo se llama cada modalidad. UNA definición, para todas las
 * superficies.
 *
 * Estaba redefinida OCHO veces con cuatro nombres para lo mismo: el socio veía
 * "Entrenamiento personal" en su portal, recepción "Personal Training" en su
 * ficha y la app "Personal", para el mismo bono. Parecían tres productos.
 *
 * El nombre canónico es el que ve el socio, en castellano. Para meterlo dentro
 * de una frase ("tu plan no incluye sesiones de …") está `serviceLabelLower`:
 * es el MISMO rótulo en minúscula, no otro nombre.
 */
export const SERVICE_LABEL: Record<ServiceKind, string> = {
  EP: "Entrenamiento personal",
  GROUP: "Grupos reducidos",
  ONLINE: "Online",
};

/** Rótulo de una modalidad. Si llega una clave desconocida se devuelve tal cual. */
export function serviceLabel(kind: string): string {
  return SERVICE_LABEL[kind as ServiceKind] ?? kind;
}

/** El mismo rótulo, para dentro de una frase: "sesiones de entrenamiento personal". */
export function serviceLabelLower(kind: string): string {
  return serviceLabel(kind).toLocaleLowerCase("es-ES");
}
