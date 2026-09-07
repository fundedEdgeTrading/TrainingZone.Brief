import { MAX_GROUP_CAPACITY } from "@/app/(app)/agenda/agenda-utils";

/**
 * E2-13: el tope global de aforo (`MAX_GROUP_CAPACITY = 30`) se respeta en las
 * dos superficies, y el tope del CENTRO no puede saltárselo.
 *
 * Lo que fallaba:
 *
 * - `aforo/actions.ts` solo validaba `capacity >= 1` y el input no declaraba
 *   `max`, así que fijar 500 como aforo por defecto convertía 500 en el techo
 *   del centro —`saveSession` lo leía como `groupCapacityCeiling`— y el tope
 *   global dejaba de existir para ese centro.
 * - El `PATCH /capacity` móvil usaba un 30 fijo, ignorando el aforo por
 *   defecto del centro, y aceptaba CUALQUIER `sessionId`: incluidas las
 *   franjas de entrenamiento personal, que la web fuerza a 1 plaza.
 *
 * Aquí vive la aritmética, sin Prisma, para que web y app apliquen el mismo
 * número y no dos parecidos.
 */

export { MAX_GROUP_CAPACITY };

/**
 * Tope efectivo de un centro: el suyo si lo ha fijado, y en todo caso nunca por
 * encima del global. El `Math.min` es lo que arregla también los centros que ya
 * tengan un valor absurdo guardado de antes.
 */
export function centerCapacityCeiling(centerDefault: number | null | undefined): number {
  if (centerDefault == null || !Number.isFinite(centerDefault) || centerDefault < 1) return MAX_GROUP_CAPACITY;
  return Math.min(Math.round(centerDefault), MAX_GROUP_CAPACITY);
}

export type CapacityCheck<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Aforo por defecto del centro, tal y como llega del formulario web o del
 * cuerpo del PATCH. Vacío/`null` significa "no fijar ninguno" y hace que las
 * sesiones nuevas caigan al valor por defecto de la aplicación.
 */
export function checkCenterDefaultCapacity(raw: unknown): CapacityCheck<number | null> {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };

  const capacity = Math.round(Number(raw));
  if (!Number.isFinite(capacity) || capacity < 1) {
    return { ok: false, error: "El aforo debe ser un número entero mayor que 0 (o vacío para no fijar ninguno)." };
  }
  if (capacity > MAX_GROUP_CAPACITY) {
    return {
      ok: false,
      error: `El aforo máximo de un grupo reducido es ${MAX_GROUP_CAPACITY} plazas: no puedes fijar ${capacity}.`,
    };
  }
  return { ok: true, value: capacity };
}

/**
 * Aforo de UNA sesión de grupo.
 *
 * El techo es `max(tope del centro, aforo actual)`: una sesión creada con más
 * de 30 plazas antes del arreglo tiene que poder seguir editándose desde el
 * móvil —y bajarse— en vez de quedar bloqueada porque su propio valor ya
 * incumple la regla. Lo que no se puede es SUBIRLA por encima de lo que ya
 * tenía.
 *
 * El suelo es la ocupación real: bajar de ahí dejaría a socios ya inscritos
 * fuera de una sesión en la que siguen apuntados.
 */
export function checkSessionCapacity(params: {
  capacity: unknown;
  /** Tope del centro, ya resuelto con `centerCapacityCeiling`. */
  ceiling: number;
  /** Aforo que tiene hoy la sesión. */
  currentCapacity: number;
  /** Plazas ocupadas en la ocurrencia más llena. */
  occupied: number;
}): CapacityCheck<number> {
  const capacity = Math.round(Number(params.capacity));
  if (!Number.isFinite(capacity) || capacity < 1) return { ok: false, error: "El aforo va de 1 plaza en adelante." };

  const ceiling = Math.max(params.ceiling, params.currentCapacity);
  if (capacity > ceiling) return { ok: false, error: `El aforo va de 1 a ${ceiling} plazas.` };

  if (capacity < params.occupied) {
    return {
      ok: false,
      error: `Ya hay ${params.occupied} plazas ocupadas: cancela una reserva antes de bajar el aforo.`,
    };
  }
  return { ok: true, value: capacity };
}
