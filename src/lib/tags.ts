/**
 * E1 · Etiquetas de socio — tipos y catálogo compartido.
 *
 * El fichero lo dejó puesto S2 con su contrato en prosa; lo llena E1. El
 * reparto que da por hecho el resto del lote sigue siendo el mismo:
 *
 *  · `tags.ts` (este)      — puro: claves, rótulos y la definición en texto
 *                            llano de cada regla automática. Sin Prisma: lo
 *                            importan el servidor y componentes de cliente.
 *  · `tag-engine.ts`       — las nueve reglas. Cada una PONE Y QUITA, y lo
 *                            segundo es la mitad que se olvida siempre.
 *  · `tags-queries.ts`     — el contrato con E2, con el ámbito de centro ya
 *                            aplicado.
 *
 * DOS CLASES Y LA DISTINCIÓN ES DE DATO, NO DE NOMBRE. `MemberTagDefinition.kind`
 * es un enum (`AUTOMATIC` / `MANUAL`). Una automática no se puede quitar a
 * mano: volvería sola en la siguiente pasada del cron y parecería un fallo. Si
 * el equipo necesita contradecir al sistema, eso es una etiqueta manual
 * distinta, nunca un borrado.
 *
 * ÁMBITO DE CENTRO en TODA lectura y TODA escritura, vía `isCenterInScope` /
 * `isMemberInScope`. `MemberTag` no lleva `centerId` a propósito: el centro de
 * una etiqueta es el del socio (`Member.primaryCenterId`), y denormalizarlo
 * crearía una segunda verdad que se queda vieja en cuanto el socio se mueve.
 */

/**
 * Las nueve automáticas de salida. Las claves son ESTABLES y son el contrato
 * con E2: la condición de un flujo guarda la clave, no el rótulo, así que
 * renombrar una etiqueta en `/etiquetas` no puede dejar flujos apuntando a
 * nada. Se siembran como `MemberTagDefinition` con `kind = AUTOMATIC`.
 *
 * Siete de las nueve YA TIENEN SU SEÑAL CALCULADA en otro sitio y no se
 * reimplementan: impago es `Member.state = DELINQUENT` + `delinquentSince`;
 * congelado es `FROZEN`; excliente es `CANCELLED`; bono por acabarse es la
 * misma condición que `runLowPackBalanceRule`; cumple este mes es `birthDate`
 * (ya hay `birthday-jobs.ts`); primeros 30 días es `joinedAt`; grupo reducido y
 * entrenamiento personal salen del plan contratado (`ServiceKind` y
 * `service-labels.ts`, que ya son fuente única). La única que necesita cálculo
 * propio es «2 semanas sin venir».
 */
export const AUTOMATIC_TAG_KEYS = [
  "grupo_reducido",
  "entrenamiento_personal",
  "primeros_30_dias",
  "bono_por_acabarse",
  "dos_semanas_sin_venir",
  "impago",
  "congelado",
  "excliente",
  "cumple_este_mes",
] as const;

export type AutomaticTagKey = (typeof AUTOMATIC_TAG_KEYS)[number];

export function isAutomaticTagKey(key: string): key is AutomaticTagKey {
  return (AUTOMATIC_TAG_KEYS as readonly string[]).includes(key);
}

/** Rótulo de cada automática, como se ve en la ficha y en `/etiquetas`. */
export const AUTOMATIC_TAG_LABEL: Record<AutomaticTagKey, string> = {
  grupo_reducido: "Grupo reducido",
  entrenamiento_personal: "Entrenamiento personal",
  primeros_30_dias: "Primeros 30 días",
  bono_por_acabarse: "Bono por acabarse",
  dos_semanas_sin_venir: "2 semanas sin venir",
  impago: "Impago",
  congelado: "Congelado",
  excliente: "Excliente",
  cumple_este_mes: "Cumple este mes",
};

/**
 * Su definición en texto llano, que es lo que se enseña en `/etiquetas`. Mismo
 * patrón que las reglas de aptitud (E3-04): una regla que nadie puede leer es
 * una regla en la que nadie confía — y aquí además es lo que evita la discusión
 * de «¿por qué a este socio no le ha entrado el flujo?».
 *
 * Si cambias el umbral de una regla en `tag-engine.ts`, cambia también la
 * frase: `tags.test.ts` comprueba que las nueve tienen rótulo y definición,
 * pero ninguna máquina puede comprobar que la frase dice la verdad.
 */
export const AUTOMATIC_TAG_DESCRIPTION: Record<AutomaticTagKey, string> = {
  grupo_reducido: "Tiene una suscripción activa de grupos reducidos.",
  entrenamiento_personal: "Tiene una suscripción activa de entrenamiento personal.",
  primeros_30_dias: "Se dio de alta hace menos de 30 días y sigue de alta (cliente o prueba).",
  bono_por_acabarse: "Le quedan 1 o 2 sesiones en un bono activo — la misma condición que la alerta de bono bajo.",
  dos_semanas_sin_venir:
    "Lleva 14 días o más sin una sesión asistida. Si nunca ha venido, se cuenta desde el alta. Solo mientras está de alta: quien está congelado o de baja tiene su propia etiqueta.",
  impago: "Tiene un impago abierto: su estado es Suspendido, con la fecha del primer recibo devuelto.",
  congelado: "Tiene la cuota congelada por voluntad propia (estado Congelado).",
  excliente: "Causó baja: su estado es Excliente, con su fecha y su motivo.",
  cumple_este_mes: "Cumple años este mes, en el calendario de su centro.",
};

/** Color de la píldora. Presentación pura, mismo vocabulario que `Badge`. */
export type TagTone = "good" | "warning" | "critical" | "trial" | "prospect" | "neutral" | "gold";

export const AUTOMATIC_TAG_TONE: Record<AutomaticTagKey, TagTone> = {
  grupo_reducido: "neutral",
  entrenamiento_personal: "neutral",
  primeros_30_dias: "trial",
  bono_por_acabarse: "warning",
  dos_semanas_sin_venir: "warning",
  impago: "critical",
  congelado: "warning",
  excliente: "neutral",
  cumple_este_mes: "gold",
};

/**
 * Las dos manuales de salida. Se siembran UNA vez por organización y a partir
 * de ahí son del centro: se pueden renombrar y desactivar como cualquier otra
 * manual, y la siembra no las resucita porque desactivar no borra la fila.
 *
 * «Lesión activa» es un rótulo de trabajo, NO un dato de salud: quien la pone
 * ya ha visto la ficha por su camino auditado (`health-access.ts`). La etiqueta
 * no guarda ni la zona ni el diagnóstico, igual que `buildAlertContext` en
 * `retention.ts` no copia la lesión a la alerta.
 */
export const MANUAL_SEED_TAGS: { key: string; label: string; tone: TagTone }[] = [
  { key: "embajador", label: "Embajador", tone: "gold" },
  { key: "lesion_activa", label: "Lesión activa", tone: "warning" },
];

/** Longitud máxima del rótulo de una etiqueta manual. */
export const TAG_LABEL_MAX = 40;

/**
 * Clave estable a partir del rótulo que escribe el centro. Se calcula UNA vez,
 * al crear: renombrar después no la toca, que es justo lo que protege a las
 * condiciones de los flujos de E2.
 */
export function tagKeyFromLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** Una etiqueta tal y como se pinta: en la ficha, en el listado y en `/etiquetas`. */
export type MemberTagView = {
  id: string;
  key: string;
  label: string;
  kind: "AUTOMATIC" | "MANUAL";
  tone: TagTone;
  description: string | null;
  /** Desde cuándo la tiene. */
  assignedAt: Date;
  /** Regla que la puso, cuando la puso el motor. `null` = la puso una persona. */
  ruleKey: string | null;
  /** Quién la puso. `null` = el sistema. */
  assignedByName: string | null;
};

/** El color guardado en `MemberTagDefinition.color`, ya validado. */
export function toneOf(color: string | null | undefined, fallback: TagTone = "neutral"): TagTone {
  const tones: TagTone[] = ["good", "warning", "critical", "trial", "prospect", "neutral", "gold"];
  return tones.includes(color as TagTone) ? (color as TagTone) : fallback;
}

/**
 * Una automática NUNCA se quita ni se pone a mano. Vive aquí, en el módulo puro,
 * porque lo comprueban tres sitios —la acción del servidor, el botón de la ficha
 * y el catálogo— y tres copias de esta regla son tres oportunidades de que una
 * se olvide.
 */
export function canEditTagByHand(kind: "AUTOMATIC" | "MANUAL"): boolean {
  return kind === "MANUAL";
}

export const AUTOMATIC_TAG_HAND_ERROR =
  "Esta etiqueta la mantiene el sistema: quitarla a mano no serviría de nada porque volvería en la siguiente pasada. Si necesitas contradecirla, crea una etiqueta manual.";
