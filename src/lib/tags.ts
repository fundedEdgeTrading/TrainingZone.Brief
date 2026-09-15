/**
 * E1 · Etiquetas de socio — tipos y catálogo compartido.
 *
 * ESTE FICHERO LO DEJA PUESTO S2 Y LO LLENA E1. Está aquí, vacío y con firma,
 * para que seis sesiones que arrancan el mismo día no se peleen por crearlo.
 * Si eres otra pista y necesitas algo de aquí, pídelo en la ventana de merge.
 *
 * El reparto que da por hecho el resto del lote:
 *
 *  · `tags.ts` (este)      — puro: claves, rótulos y la definición en texto
 *                            llano de cada regla automática. Sin Prisma: lo
 *                            importan el servidor y componentes de cliente.
 *  · `tag-engine.ts`       — las nueve reglas. Cada una PONE Y QUITA, y lo
 *                            segundo es la mitad que se olvida siempre.
 *  · `tags-queries.ts`     — el contrato con E2 (ver abajo), con el ámbito de
 *                            centro ya aplicado.
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

/**
 * LO QUE FALTA POR ESCRIBIR, con la forma acordada. Se deja como contrato en
 * prosa y no como `declare const` ni como función que lanza: un export
 * declarado y no implementado es `undefined` en ejecución sin que TypeScript
 * diga nada, y eso se descubre en producción.
 *
 * En este fichero (E1):
 *
 *   AUTOMATIC_TAG_LABEL: Record<AutomaticTagKey, string>
 *     Rótulo de cada automática, como se ve en la ficha y en `/etiquetas`.
 *
 *   AUTOMATIC_TAG_DESCRIPTION: Record<AutomaticTagKey, string>
 *     Su definición en texto llano («lleva 14 días sin una sesión asistida»).
 *     Mismo patrón que las reglas de aptitud (E3-04): una regla que nadie
 *     puede leer es una regla en la que nadie confía.
 *
 * En `tags-queries.ts`, y ESTE ES EL CONTRATO CON E2 — E2 no puede empezar sin
 * él, así que va con estos nombres exactos y con el ámbito de centro ya
 * aplicado dentro, no delegado en quien llama:
 *
 *   tagsForMember(user: ScopedUser, memberId: string): Promise<MemberTagView[]>
 *     «¿Qué etiquetas tiene este socio AHORA?». Lee `MemberTag`, que es el
 *     estado actual; el histórico está en `MemberTagEvent`.
 *
 *   membersWithTag(user: ScopedUser, tagKey: string, opts?: { centerIds?: string[] }): Promise<string[]>
 *     «¿Quién tiene esta etiqueta?». Devuelve ids de socio ya acotados al
 *     ámbito de quien pregunta.
 *
 * En `tag-engine.ts`:
 *
 *   runTagRules(orgId: string, now: Date): Promise<TagRunReport>
 *     Una pasada del cron. Idempotente: dos seguidas no cambian nada. Pone Y
 *     QUITA, y cada movimiento deja su `MemberTagEvent` con la regla que lo
 *     provocó — el panel de un flujo tiene que poder explicar por qué entró un
 *     socio.
 */
