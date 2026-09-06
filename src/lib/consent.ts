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

/** Los cuatro consentimientos que guarda `Member`, con su pareja bandera/fecha. */
export const CONSENT_FIELD = {
  health: { flag: "consentHealth", at: "consentHealthAt" },
  images: { flag: "consentImages", at: "consentImagesAt" },
  marketing: { flag: "consentMarketing", at: "consentMarketingAt" },
  ai: { flag: "consentAI", at: "consentAIAt" },
} as const;

export type ConsentKind = keyof typeof CONSENT_FIELD;

/**
 * E12-12: los que puede retirar el STAFF a petición del socio (p. ej. por
 * teléfono). La declaración de salud queda fuera a propósito: es condición
 * del servicio (ver E10-03), y retirarla implica la baja, no un botón de
 * este panel.
 */
export const STAFF_REVOCABLE_CONSENTS: readonly ConsentKind[] = ["images", "marketing", "ai"];
