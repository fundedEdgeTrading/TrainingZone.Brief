/**
 * E10-12 · Control de edad y consentimiento de tutores (decisión D-P8).
 *
 * No había NINGUNA comprobación de edad en ningún flujo: `Member.birthDate` es
 * opcional y nunca se validaba, el alta pública ni siquiera pedía fecha de
 * nacimiento y no existía sitio donde registrar el consentimiento del tutor.
 * En España el umbral del art. 7 LOPDGDD son **14 años**: por debajo, el
 * consentimiento que preste el propio menor —y muy en particular el de sus
 * datos de salud— es NULO.
 *
 * Decisión D-P8: cada organización declara si admite menores y desde qué edad.
 * El valor por defecto es "solo mayores de 18", que es lo que no obliga a un
 * centro a montar el circuito de tutores para poder dar de alta a un socio.
 *
 * Módulo puro a propósito (ni Prisma ni `next/*`): lo importan el alta en
 * recepción, el onboarding del socio, el formulario público de leads y la API
 * móvil. Una comprobación de edad duplicada "como espejo" es exactamente el
 * fallo que este trimestre no se quiere repetir.
 */

/** Umbral del art. 7 LOPDGDD. Por debajo, el consentimiento del menor es nulo. */
export const LOPDGDD_CONSENT_AGE = 14;

/** Mayoría de edad. Por debajo, la política la declara el centro. */
export const ADULT_AGE = 18;

/**
 * Edad cumplida en `on`. `birthDate` viene de un `<input type="date">` y se
 * guarda a medianoche UTC, así que se lee con getters UTC: mezclando
 * convenciones, quien cumple años hoy aparecería con un año menos en cualquier
 * servidor al oeste de Greenwich, y aquí un año de diferencia bloquea un alta.
 */
export function ageOn(birthDate: Date, on: Date): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

export type GuardianConsent = {
  name?: string | null;
  email?: string | null;
  idDocument?: string | null;
  consentAt?: Date | null;
  evidence?: string | null;
};

export type AgePolicy = {
  allowsMinors: boolean;
  minimumAgeYears: number;
};

export type AgeAdmission =
  | { ok: true; age: number; minor: boolean; guardianRequired: boolean }
  | {
      ok: false;
      reason:
        | "sin_fecha_de_nacimiento"
        | "fecha_no_valida"
        | "menores_no_admitidos"
        | "por_debajo_de_la_edad_minima"
        | "falta_consentimiento_del_tutor";
      /** Motivo en claro. Se enseña tal cual: un alta bloqueada sin explicación
       *  acaba en alguien inventándose una fecha de nacimiento. */
      message: string;
      age?: number;
    };

/**
 * ¿Se puede completar este alta?
 *
 * El orden importa: primero la edad (que decide si hay algo que consentir) y
 * después el tutor. Al revés, un centro que no admite menores pediría datos de
 * tutor antes de decir que no admite menores.
 */
export function evaluateAgeAdmission(input: {
  birthDate: Date | null | undefined;
  policy: AgePolicy;
  guardian?: GuardianConsent | null;
  now?: Date;
}): AgeAdmission {
  const now = input.now ?? new Date();
  const { policy } = input;

  if (!input.birthDate) {
    return {
      ok: false,
      reason: "sin_fecha_de_nacimiento",
      message: "La fecha de nacimiento es obligatoria: sin ella no se puede saber si el alta necesita tutor.",
    };
  }
  if (Number.isNaN(input.birthDate.getTime())) {
    return { ok: false, reason: "fecha_no_valida", message: "La fecha de nacimiento no es válida." };
  }

  const age = ageOn(input.birthDate, now);
  if (age < 0 || age > 120) {
    return { ok: false, reason: "fecha_no_valida", message: "La fecha de nacimiento no es válida.", age };
  }

  const minor = age < ADULT_AGE;
  // El mínimo efectivo nunca baja de 14 aunque el centro configure menos: por
  // debajo del art. 7 LOPDGDD no hay consentimiento válido ni con tutor para
  // el dato de salud, y esta aplicación no sabe operar sin él.
  const effectiveMinimum = policy.allowsMinors
    ? Math.max(policy.minimumAgeYears, LOPDGDD_CONSENT_AGE)
    : ADULT_AGE;

  if (!policy.allowsMinors && minor) {
    return {
      ok: false,
      reason: "menores_no_admitidos",
      message: `Este centro solo admite socios mayores de ${ADULT_AGE} años. Cámbialo en Organización si quieres admitir menores.`,
      age,
    };
  }

  if (age < effectiveMinimum) {
    return {
      ok: false,
      reason: "por_debajo_de_la_edad_minima",
      message: `Este centro admite socios a partir de ${effectiveMinimum} años.`,
      age,
    };
  }

  // Todo menor de edad admitido necesita consentimiento del tutor, no solo el
  // menor de 14: entre 14 y 18 lo exige la política declarada por el centro,
  // y esta aplicación trata datos de salud en todos los casos.
  const guardianRequired = minor;
  if (guardianRequired && !hasVerifiableGuardianConsent(input.guardian)) {
    return {
      ok: false,
      reason: "falta_consentimiento_del_tutor",
      message:
        "Un socio menor de edad necesita el consentimiento de su tutor legal, con identificación y justificante " +
        "(art. 7.2 LOPDGDD). Sin él, el alta no se completa.",
      age,
    };
  }

  return { ok: true, age, minor, guardianRequired };
}

/**
 * El art. 7.2 LOPDGDD no pide una casilla: pide poder acreditar que el
 * consentimiento lo prestó quien tiene la patria potestad. Por eso hacen falta
 * las cuatro cosas: quién es, cómo se le identifica, cuándo consintió y qué
 * justificante lo respalda.
 */
export function hasVerifiableGuardianConsent(guardian: GuardianConsent | null | undefined): boolean {
  if (!guardian) return false;
  return Boolean(
    guardian.name?.trim() &&
      guardian.idDocument?.trim() &&
      guardian.consentAt instanceof Date &&
      !Number.isNaN(guardian.consentAt.getTime()) &&
      guardian.evidence?.trim(),
  );
}

/**
 * ¿Puede este formulario público recoger datos de salud de quien lo rellena?
 *
 * Escenario "leads" de E10-12: en el formulario público no hay tutor delante ni
 * forma de acreditar su consentimiento, así que de un menor no se capta dato de
 * salud — ni de un menor de 14 ni de uno de 16. El lead se crea igual: alguien
 * llamará y el circuito de tutores se hará en el centro.
 */
export function canCaptureLeadHealthData(input: { birthDate: Date | null | undefined; now?: Date }): boolean {
  if (!input.birthDate || Number.isNaN(input.birthDate.getTime())) return false;
  return ageOn(input.birthDate, input.now ?? new Date()) >= ADULT_AGE;
}

/** Rótulo de la política de edad de un centro, para pantallas y formularios. */
export function agePolicyLabel(policy: AgePolicy): string {
  if (!policy.allowsMinors) return `Solo mayores de ${ADULT_AGE} años`;
  const minimum = Math.max(policy.minimumAgeYears, LOPDGDD_CONSENT_AGE);
  return `A partir de ${minimum} años, con consentimiento del tutor si es menor de ${ADULT_AGE}`;
}
