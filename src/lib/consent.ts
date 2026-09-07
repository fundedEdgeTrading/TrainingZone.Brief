/**
 * Texto legal que firma el socio y su versionado (F3 §4.4).
 *
 * El texto anterior prometía literalmente que «mis datos no serán cedidos a
 * terceros», y enviar las lesiones de un socio a un proveedor de IA —aunque sea
 * como encargado del tratamiento (Art. 28 RGPD)— es una comunicación que ese
 * texto no ampara. Por eso el consentimiento se reescribe y se vuelve a
 * recoger: `Member.consentVersion` guarda qué versión firmó cada socio, y quien
 * tenga una anterior recibe el aviso de re-consentimiento (sin bloquearle el
 * acceso).
 */

/** Versión vigente. Al cambiar el texto SIEMPRE se sube esta constante. */
export const CONSENT_VERSION = "2026-08-v2";

/** Versión anterior, la que firmaron los socios del piloto. */
export const CONSENT_VERSION_LEGACY = "2026-07-v1";

/**
 * Borrador pendiente de validación por el asesor legal antes de publicarse
 * (roadmap §4.4). Se mantiene aquí, en un único sitio, porque lo consumen el
 * onboarding, el portal del socio y el aviso de re-consentimiento.
 */
export const CONSENT_TEXT = [
  "En cumplimiento del RGPD (UE) 2016/679 y la LOPDGDD 3/2018, consiento el tratamiento de mis datos personales y de salud por parte de Training Zone Cesar Augusto S.L. con la finalidad de diseñar y realizar mi programa de entrenamiento.",
  "Consiento asimismo que, para elaborar propuestas de programación, dichos datos sean tratados mediante sistemas de inteligencia artificial operados por proveedores que actúan como encargados del tratamiento bajo contrato conforme al artículo 28 del RGPD. Estos datos se transmiten seudonimizados: no incluyen mi nombre, DNI, dirección ni datos de contacto. Toda propuesta generada es revisada y aprobada por un profesional cualificado antes de aplicarse.",
  "Mis datos no serán cedidos a terceros para finalidades distintas de las descritas. Puedo oponerme al tratamiento con inteligencia artificial sin que ello afecte a mi acceso al servicio, y ejercer mis derechos de acceso, rectificación, supresión, oposición y portabilidad en info@trainingzone.es.",
];

/**
 * Un socio necesita volver a consentir si firmó una versión distinta de la
 * vigente (o ninguna, caso de las fichas creadas antes del onboarding).
 */
export function needsReconsent(member: { consentVersion: string | null }): boolean {
  return member.consentVersion !== CONSENT_VERSION;
}

/**
 * La oposición al tratamiento con IA tiene que ser real: sin este permiso, el
 * generador de mesociclos (F6) entra por la vía sin datos clínicos. No basta
 * con `consentAI` — sin consentimiento de salud tampoco hay dato que enviar.
 */
export function canUseClinicalDataForAI(member: { consentAI: boolean; consentHealth: boolean }): boolean {
  return member.consentAI && member.consentHealth;
}

// ---------------------------------------------------------------------------
// E10-01 · Captación pública: capa informativa y consentimiento del dato de salud
// ---------------------------------------------------------------------------
//
// El formulario público pedía "¿Alguna lesión, enfermedad o patología?" como
// campo obligatorio de texto libre, sin aviso, sin casilla y sin enlace a la
// política — y `health-access.ts` estampaba `consentSignedAt: new Date()`, es
// decir, la firma de un consentimiento que nadie había prestado (arts. 7, 9.2.a
// y 13 RGPD; art. 6 LOPDGDD).
//
// Lo que hace este bloque: la capa informativa vive AQUÍ, junto al texto que
// firma el socio, para que no haya dos redacciones distintas circulando; y la
// decisión de si se captura o no el dato de salud es una función pura, probable
// sin base de datos, que consumen tanto el formulario público como el alta en
// recepción.

/**
 * Versión del aviso y del consentimiento de captación. Es INDEPENDIENTE de
 * `CONSENT_VERSION`: quien deja sus datos en el formulario todavía no es socio
 * y no ha firmado el contrato, así que igualar ambas versiones haría creer que
 * un lead aceptó un texto que nunca vio.
 */
export const LEAD_CONSENT_VERSION = "2026-09-v1";

/** Pregunta del formulario público: sí/no, sin texto libre (minimización). */
export const LEAD_HEALTH_QUESTION = "¿Tienes alguna lesión o condición que debamos tener en cuenta?";

/**
 * Lo que se guarda cuando la respuesta es "sí". El detalle NO se recoge por
 * internet: se recoge en la valoración presencial, con el entrenador delante,
 * que es quien puede preguntar y matizar. Un `HealthRecord` nacido aquí es un
 * marcador para esa conversación, no un diagnóstico.
 */
export const LEAD_HEALTH_MINIMISED_DESCRIPTION =
  "Declara una lesión o condición a detallar en la valoración presencial.";

/** Rótulo de la casilla del dato de salud. Nunca premarcada (art. 4.11 RGPD). */
export const LEAD_HEALTH_CONSENT_LABEL =
  "Consiento que el centro trate el dato de salud que acabo de indicar para valorar si el entrenamiento es adecuado para mí.";

/**
 * Rótulo de la casilla comercial. Va SEPARADA de la de salud a propósito: un
 * consentimiento que cubre dos finalidades distintas no es específico y no
 * vale para ninguna de las dos.
 */
export const LEAD_MARKETING_CONSENT_LABEL =
  "Quiero recibir novedades, promociones y actividades del centro por email o teléfono.";

export type LeadPrivacyNotice = {
  responsable: string;
  finalidad: string;
  baseJuridica: string;
  destinatarios: string;
  conservacion: string;
  derechos: string;
  politicaUrl: string;
};

/**
 * Capa informativa del art. 13, primera capa: lo mínimo imprescindible sobre el
 * propio formulario, con el enlace a la política completa como segunda capa.
 * El responsable es el centro, así que el nombre entra por parámetro.
 */
export function buildLeadPrivacyNotice(orgName: string): LeadPrivacyNotice {
  return {
    responsable: `${orgName}, como responsable del tratamiento.`,
    finalidad: "Ponernos en contacto contigo, agendar tu primera valoración y gestionarte como posible socio.",
    baseJuridica:
      "Tu consentimiento para el dato de salud (art. 9.2.a RGPD) y tu solicitud de información para el resto de datos (art. 6.1.b RGPD). El envío de comunicaciones comerciales, si lo aceptas, va por su propio consentimiento.",
    destinatarios:
      "Nadie ajeno al centro, salvo los proveedores que nos prestan servicio (alojamiento y correo) como encargados del tratamiento.",
    conservacion:
      "Doce meses desde el último contacto si no llegas a darte de alta; si te das de alta, el plazo pasa a ser el de socio.",
    derechos:
      "Acceso, rectificación, supresión, oposición, limitación y portabilidad, y a retirar tu consentimiento en cualquier momento, escribiendo a info@trainingzone.es.",
    politicaUrl: "/privacidad",
  };
}

export type LeadHealthCapture =
  | { capture: true; description: string; consentSignedAt: Date; consentVersion: string }
  | { capture: false; reason: "sin_consentimiento" | "sin_condicion" };

/**
 * ¿Se crea `HealthRecord` a partir de este formulario, y con qué firma?
 *
 * Dos condiciones acumulativas y una consecuencia:
 * - sin casilla marcada NO hay dato de salud, aunque la persona haya dicho que
 *   sí tiene una lesión: el lead se crea igual con sus datos de contacto;
 * - sin condición declarada tampoco hay nada que guardar, y guardar "ninguna"
 *   es acumular un dato del art. 9 que no aporta nada;
 * - cuando sí se captura, `consentSignedAt` sale de aquí y viaja con la versión
 *   del texto que la persona tenía delante. Nunca se estampa por defecto.
 */
export function resolveLeadHealthCapture(input: {
  hasCondition: boolean | null;
  healthConsent: boolean;
  now?: Date;
}): LeadHealthCapture {
  if (!input.healthConsent) return { capture: false, reason: "sin_consentimiento" };
  if (input.hasCondition !== true) return { capture: false, reason: "sin_condicion" };
  return {
    capture: true,
    description: LEAD_HEALTH_MINIMISED_DESCRIPTION,
    consentSignedAt: input.now ?? new Date(),
    consentVersion: LEAD_CONSENT_VERSION,
  };
}
