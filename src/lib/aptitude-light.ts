import type { AptitudeLight, HealthRecordType } from "@prisma/client";
import { injuryZoneLabel, ruleMatchesRecord } from "@/lib/injury-zones";
import type { BriefCondition, BriefRule } from "@/lib/brief-queries";

/**
 * Semáforo de aptitud: de las condiciones declaradas de un socio a la luz que
 * ve el entrenador (E3-03 · RB-SALUD-012).
 *
 * Lo que arregla: el semáforo se apagaba en silencio. Solo se miraban las reglas
 * que casaban, así que una condición SIN regla —hipertensión, embarazo, diabetes,
 * un postoperatorio, o una lesión cuya zona nadie ha normalizado— dejaba al socio
 * en "Sin restricciones". En la sala eso está al revés de lo que importa: la
 * rodilla se ve cojear, la tensión no.
 *
 * A partir de aquí:
 *  · una condición declarada sin regla enciende AMBER, nunca GREEN;
 *  · con varias, manda la más restrictiva;
 *  · "Sin restricciones" solo se pinta cuando NO hay ninguna condición.
 */

const LIGHT_RANK: Record<AptitudeLight, number> = { RED: 2, AMBER: 1, GREEN: 0 };

/** La más restrictiva de dos luces. `null` = todavía no hay ninguna. */
export function worstLight(a: AptitudeLight | null, b: AptitudeLight | null): AptitudeLight | null {
  if (!a) return b;
  if (!b) return a;
  return LIGHT_RANK[b] > LIGHT_RANK[a] ? b : a;
}

export type AptitudeOutcome = {
  /** `null` SOLO cuando el socio no tiene ninguna condición ni lesión declarada. */
  light: AptitudeLight | null;
  matchedRules: BriefRule[];
  /**
   * Condiciones declaradas para las que no hay ninguna regla escrita. Son la
   * razón del ámbar, y el brief tiene que decirlo con esas palabras: es una
   * condición sin regla, no una adaptación conocida.
   */
  unmatchedConditions: BriefCondition[];
};

export function resolveAptitude(conditions: BriefCondition[], rules: BriefRule[]): AptitudeOutcome {
  const matchedRules: BriefRule[] = [];
  const unmatchedConditions: BriefCondition[] = [];
  let light: AptitudeLight | null = null;

  for (const condition of conditions) {
    const matches = rules.filter((rule) => ruleMatchesRecord(rule, condition));
    if (matches.length === 0) {
      // Ámbar por defecto: lo declarado cuenta aunque nadie haya escrito todavía
      // la regla que lo traduce.
      unmatchedConditions.push(condition);
      light = worstLight(light, "AMBER");
      continue;
    }
    matchedRules.push(...matches);
    for (const rule of matches) light = worstLight(light, rule.light);
  }

  return { light, matchedRules, unmatchedConditions };
}

/** ¿Se puede pintar "Sin restricciones"? Solo si no hay nada declarado. */
export function hasNoDeclaredConditions(outcome: AptitudeOutcome): boolean {
  return outcome.light === null;
}

/**
 * Rótulos de lo que hay declarado, para pintar la condición SIN pintar el
 * historial. El entrenador lee adaptaciones, no diagnósticos (E3-05): la
 * descripción clínica —medicamentos, cirugías, patologías— no sale de aquí.
 */
export const HEALTH_TYPE_LABEL: Record<HealthRecordType, string> = {
  INJURY: "Lesión",
  CHRONIC_CONDITION: "Condición crónica",
  MEDICATION: "Medicación",
  SURGERY: "Cirugía",
  PREGNANCY: "Embarazo",
  ALLERGY: "Alergia",
};

/** "Lesión · Hombro derecho", "Condición crónica". Nunca la descripción libre. */
export function conditionLabel(condition: BriefCondition): string {
  const type = HEALTH_TYPE_LABEL[condition.type as HealthRecordType] ?? "Condición";
  if (condition.zoneCode) return `${type} · ${injuryZoneLabel(condition.zoneCode, condition.side)}`;
  // Zona heredada que la migración de E3-02 no supo normalizar: se enseña como
  // está, que es mejor que callarla, y queda pendiente de revisión manual.
  if (condition.zone) return `${type} · ${condition.zone}`;
  return type;
}
