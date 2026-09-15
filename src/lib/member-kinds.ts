/**
 * M4 · Los CUATRO TIPOS DE PERSONA, en un módulo sin Prisma detrás.
 *
 * Vive separado de `member-lifecycle.ts` —que es quien ESCRIBE las transiciones—
 * por la misma razón que `dashboard-range.ts` vive fuera de `dashboard-queries.ts`:
 * el filtro de `/members`, la columna y el panel de la ficha son componentes de
 * CLIENTE, y arrastrar Prisma al navegador rompe la compilación. Aquí solo hay
 * tipos, rótulos y la traducción tipo → estado, todo probable sin base de datos.
 *
 * `member-lifecycle.ts` lo reexporta entero, así que el lado servidor puede
 * seguir importando de un único sitio.
 */
import type { MemberState } from "@prisma/client";

// ---------------------------------------------------------------------------
// Los cuatro tipos, para la pantalla
// ---------------------------------------------------------------------------

/**
 * Los cuatro tipos de persona más `EN_CAPTACION`, que NO es un quinto tipo: es
 * dónde caen `PROSPECT` y `TRIAL`, que son estados de embudo y no de socio. Sin
 * él el filtro de `/members` dejaría fuera a media tabla, porque `MemberState`
 * tiene seis valores y los tipos de persona son cuatro.
 */
export type MemberKind = "CLIENTE" | "CONGELADO" | "SUSPENDIDO" | "EXCLIENTE" | "EN_CAPTACION";

/**
 * UNA sola definición de «quién es excliente», compartida por el filtro de
 * `/members`, la columna, la agrupación y el desglose del panel. Derivar el
 * tipo del estado (y no al revés) es lo que permite que `MemberState` siga
 * intacto.
 */
export function memberKindOf(member: { state: MemberState } | MemberState): MemberKind {
  const state = typeof member === "string" ? member : member.state;
  switch (state) {
    case "ACTIVE":
      return "CLIENTE";
    case "FROZEN":
      return "CONGELADO";
    case "DELINQUENT":
      return "SUSPENDIDO";
    case "CANCELLED":
      return "EXCLIENTE";
    default:
      return "EN_CAPTACION";
  }
}

export const MEMBER_KIND_LABEL: Record<MemberKind, string> = {
  CLIENTE: "Cliente",
  CONGELADO: "Congelado",
  SUSPENDIDO: "Suspendido",
  EXCLIENTE: "Excliente",
  EN_CAPTACION: "En captación",
};

/** Orden de lectura: del que paga al que se fue. */
export const MEMBER_KIND_ORDER: MemberKind[] = [
  "CLIENTE",
  "CONGELADO",
  "SUSPENDIDO",
  "EXCLIENTE",
  "EN_CAPTACION",
];

/** Estados de `MemberState` que caen en cada tipo. Es lo que traduce un filtro de pantalla a un `where` de Prisma. */
export const MEMBER_KIND_STATES: Record<MemberKind, MemberState[]> = {
  CLIENTE: ["ACTIVE"],
  CONGELADO: ["FROZEN"],
  SUSPENDIDO: ["DELINQUENT"],
  EXCLIENTE: ["CANCELLED"],
  EN_CAPTACION: ["PROSPECT", "TRIAL"],
};

/**
 * LA AGRUPACIÓN ES DE PANTALLA Y NADA MÁS (D-L3-2). Congelado y suspendido se
 * pueden leer juntos bajo «En pausa» —es lo que pidió negocio— porque para
 * quien mira la tabla los dos son «ahora mismo no viene». Por dentro siguen
 * siendo dos tipos distintos y el flujo de impago sigue sabiendo quién debe
 * dinero: esta constante NO se usa para consultar, solo para rotular.
 */
export type MemberGroup = "CLIENTES" | "EN_PAUSA" | "EXCLIENTES" | "EN_CAPTACION";

export const MEMBER_KIND_GROUP: Record<MemberKind, MemberGroup> = {
  CLIENTE: "CLIENTES",
  CONGELADO: "EN_PAUSA",
  SUSPENDIDO: "EN_PAUSA",
  EXCLIENTE: "EXCLIENTES",
  EN_CAPTACION: "EN_CAPTACION",
};

export const MEMBER_GROUP_LABEL: Record<MemberGroup, string> = {
  CLIENTES: "Clientes",
  EN_PAUSA: "En pausa",
  EXCLIENTES: "Exclientes",
  EN_CAPTACION: "En captación",
};

export const MEMBER_GROUP_ORDER: MemberGroup[] = ["CLIENTES", "EN_PAUSA", "EXCLIENTES", "EN_CAPTACION"];

/** Los tipos que componen un rótulo agrupado, en el orden de lectura de arriba. */
export function kindsInGroup(group: MemberGroup): MemberKind[] {
  return MEMBER_KIND_ORDER.filter((k) => MEMBER_KIND_GROUP[k] === group);
}

/** Traducción de una selección de tipos de la pantalla a estados para el `where`. */
export function statesForKinds(kinds: MemberKind[]): MemberState[] {
  return kinds.flatMap((k) => MEMBER_KIND_STATES[k]);
}
