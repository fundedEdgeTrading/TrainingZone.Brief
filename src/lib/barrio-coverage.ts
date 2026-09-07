/**
 * Cobertura del mapa de barrios (E11-05).
 *
 * El `FROM "PostalCodeArea"` de la agregación descarta cualquier CP que no esté
 * entre las filas sembradas: **un socio de Madrid con CP 28001 no sale en ningún
 * sitio**, y el mapa no decía cuánta gente no estaba enseñando. Dirección
 * miraba un plano sin saber si valía por el 90 % de su cartera o por el 40 %.
 *
 * Se distinguen dos ausencias porque tienen dos arreglos distintos:
 *
 *  · **Sin código postal** — el dato falta en la ficha. Lo arregla recepción.
 *  · **Fuera de cobertura** — el CP existe pero su ciudad no está sembrada en
 *    `PostalCodeArea`. Lo arregla dar de alta esa ciudad (`postal-codes.ts`).
 *
 * Módulo puro: la consulta vive en `barrio-coverage-queries.ts`.
 */

export type Coverage = {
  /** Total de fichas contadas. */
  total: number;
  /** Con un CP que sí está en `PostalCodeArea`: los que el mapa pinta. */
  represented: number;
  /** Sin código postal en la ficha. */
  noPostalCode: number;
  /** Con código postal, pero de una ciudad que no está sembrada. */
  outsideCoverage: number;
};

export type MapCoverage = { members: Coverage; leads: Coverage };

export function emptyCoverage(): Coverage {
  return { total: 0, represented: 0, noPostalCode: 0, outsideCoverage: 0 };
}

/**
 * La frase del pie, con la redacción del informe:
 *
 *     «Se representan 412 de 468 socios: 31 sin código postal y 25 en zonas
 *      fuera de cobertura»
 *
 * Cuando no falta nadie no se dice nada de lo que falta: enumerar dos ceros es
 * ruido, y hace que el aviso de verdad se lea como decoración.
 */
export function coverageSentence(coverage: Coverage, singular: string, plural: string): string {
  const { total, represented, noPostalCode, outsideCoverage } = coverage;
  if (total === 0) return `Todavía no hay ${plural} que situar.`;

  const noun = total === 1 ? singular : plural;
  const head = `Se ${represented === 1 ? "representa" : "representan"} ${represented} de ${total} ${noun}`;
  if (represented === total) return `${head}.`;

  const missing: string[] = [];
  if (noPostalCode > 0) missing.push(`${noPostalCode} sin código postal`);
  if (outsideCoverage > 0) missing.push(`${outsideCoverage} en zonas fuera de cobertura`);
  return `${head}: ${missing.join(" y ")}.`;
}

/** `true` si hay alguien fuera del plano. Es lo que decide si el pie se destaca. */
export function hasGaps(coverage: MapCoverage): boolean {
  return coverage.members.represented < coverage.members.total || coverage.leads.represented < coverage.leads.total;
}

/**
 * Las DOS aproximaciones encadenadas, dichas las dos.
 *
 * La nota anterior solo advertía de una: que la geometría es una teselación. Se
 * callaba que la correspondencia CP→barrio es también un "mejor esfuerzo"
 * reconocido (un mismo CP reparte calles entre barrios colindantes, y Correos no
 * publica una tabla 1:1). Declarar una sola de las dos deja creyendo que la otra
 * mitad es exacta.
 */
export function geometryNote(realGeometry: boolean): string {
  const shape = realGeometry
    ? "Los contornos son los barrios reales publicados por el ayuntamiento."
    : "Los contornos son una teselación desde el centroide de cada CP, no el barrio real.";
  return `Dos aproximaciones encadenadas: la correspondencia entre código postal y barrio es un «mejor esfuerzo» (un CP reparte calles entre barrios colindantes). ${shape}`;
}
