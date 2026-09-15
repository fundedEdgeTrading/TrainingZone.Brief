import type { MemberState } from "@prisma/client";

import { planServiceKind, type ServiceKind } from "@/lib/members-queries";

/**
 * Ejes de filtro de la tabla de socios y su parámetro de URL. Todos son
 * multi-valor: dentro de un eje los valores se combinan con OR, entre ejes con
 * AND (`?state=ACTIVE,TRIAL&centerId=abc`).
 *
 * Estado y Centro se resuelven en la query (son columnas de `Member`); Plan y
 * Alta se resuelven aquí, en memoria, porque «el plan del socio» es el de su
 * suscripción más reciente y eso no se expresa en un `where` de Prisma.
 *
 * El eje «Responsable» del handoff queda fuera: no hay responsable de un socio
 * en el modelo (no existe `Member.assignedTrainerId`) y decidir de dónde sale
 * —último `Booking`, `Subscription` de EP…— es una pregunta abierta del propio
 * handoff, no algo que se pueda inventar aquí.
 */
export const MEMBER_AXIS = {
  state: "state",
  center: "centerId",
  plan: "plan",
  joined: "joined",
  // E1 · etiqueta de socio. Es el único eje MULTI-VALOR POR FILA: un socio tiene
  // varias etiquetas a la vez, así que la fila casa si comparte alguna con la
  // selección (OR dentro del eje, como los demás).
  tag: "tag",
} as const;

/** Modalidad del plan vigente. `NONE` = sin suscripción. */
export type PlanKind = ServiceKind | "NONE";

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  EP: "Entrenamiento personal",
  GROUP: "Grupos",
  ONLINE: "Online",
  NONE: "Sin plan",
};

export const PLAN_KIND_ORDER: PlanKind[] = ["EP", "GROUP", "ONLINE", "NONE"];

export const JOINED_OPTIONS = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "y", label: "Este año" },
  { value: "old", label: "Hace más de un año" },
];

export function planKindOf(planType: string | null | undefined): PlanKind {
  if (!planType) return "NONE";
  return planServiceKind(planType) ?? "NONE";
}

function daysSince(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export function inJoinedRange(joinedAt: Date, range: string, now: Date): boolean {
  const days = daysSince(joinedAt, now);
  switch (range) {
    case "30":
      return days <= 30;
    case "90":
      return days <= 90;
    case "y":
      return joinedAt.getFullYear() === now.getFullYear();
    case "old":
      return days > 365;
    default:
      return true;
  }
}

/** Fila reducida a lo que se filtra: sirve igual para el listado y para los recuentos. */
export type MemberFilterRow = {
  state: MemberState;
  primaryCenterId: string;
  joinedAt: Date;
  planKind: PlanKind;
  /** Claves de las etiquetas ACTIVAS del socio (E1). Vacío = ninguna. */
  tagKeys: string[];
};

export type MemberSelection = {
  state: string[];
  centerId: string[];
  plan: string[];
  joined: string[];
  tag: string[];
};

export function matchesMemberFilters(row: MemberFilterRow, selection: MemberSelection, now: Date): boolean {
  if (selection.state.length && !selection.state.includes(row.state)) return false;
  if (selection.centerId.length && !selection.centerId.includes(row.primaryCenterId)) return false;
  if (selection.plan.length && !selection.plan.includes(row.planKind)) return false;
  if (selection.joined.length && !selection.joined.some((r) => inJoinedRange(row.joinedAt, r, now))) return false;
  if (selection.tag.length && !selection.tag.some((t) => row.tagKeys.includes(t))) return false;
  return true;
}

/**
 * Cuántas filas quedarían al añadir cada valor manteniendo el resto de filtros.
 * Es el número que va a la derecha de cada opción del panel y lo que evita el
 * callejón sin salida de «filtro → 0 resultados».
 */
export function memberFacetCounts(
  base: MemberFilterRow[],
  selection: MemberSelection,
  now: Date,
): Record<keyof MemberSelection, Record<string, number>> {
  const axes = Object.keys(selection) as (keyof MemberSelection)[];
  const counts = {
    state: {} as Record<string, number>,
    centerId: {} as Record<string, number>,
    plan: {} as Record<string, number>,
    joined: {} as Record<string, number>,
    tag: {} as Record<string, number>,
  };

  for (const axis of axes) {
    for (const row of base) {
      const value =
        axis === "state"
          ? row.state
          : axis === "centerId"
            ? row.primaryCenterId
            : axis === "plan"
              ? row.planKind
              : null;

      // Los rangos de alta no son un valor de la fila: hay que probar cada uno.
      // Las etiquetas sí lo son, pero varias por fila: cuentan todas.
      const candidates =
        axis === "joined"
          ? JOINED_OPTIONS.map((o) => o.value)
          : axis === "tag"
            ? row.tagKeys
            : value
              ? [value]
              : [];
      for (const candidate of candidates) {
        if (axis === "joined" && !inJoinedRange(row.joinedAt, candidate, now)) continue;
        // «Si añado este valor a este eje»: el resto de ejes se mantienen.
        const probe = { ...selection, [axis]: [candidate] };
        if (!matchesMemberFilters(row, probe, now)) continue;
        counts[axis][candidate] = (counts[axis][candidate] ?? 0) + 1;
      }
    }
  }

  return counts;
}
