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

// ---------------------------------------------------------------------------
// M5 · Formulario que rellena el cliente sin cuenta (E14-19)
// ---------------------------------------------------------------------------
//
// El texto legal vive aquí, junto al resto, y no dentro del componente: la
// invariante del trimestre sobre rótulos («fuente única compartida, no copies
// una tabla como espejo») vale para el texto que firma una persona antes que
// para ningún otro. Si algún día hay versión móvil de este formulario, leerá de
// aquí.
//
// La versión que se guarda con cada consentimiento es `CONSENT_VERSION` cuando
// quien rellena ya es socio —es el mismo texto del onboarding— y
// `LEAD_CONSENT_VERSION` cuando todavía es un lead, por el mismo motivo por el
// que son dos constantes: un lead no ha firmado el contrato de servicio.

/**
 * Capa informativa del art. 13 del formulario de alta a distancia. Va ANTES del
 * primer campo y antes de la casilla de salud, que es lo que pide E10-01: se
 * decide con la información delante, no después de haberla dado.
 */
export function buildMemberFormPrivacyNotice(orgName: string): LeadPrivacyNotice {
  return {
    responsable: `${orgName}, como responsable del tratamiento.`,
    finalidad:
      "Preparar tu valoración y tu programa de entrenamiento: conocer tu punto de partida, tus objetivos y las " +
      "molestias que haya que tener en cuenta para que entrenes seguro.",
    baseJuridica:
      "Tu consentimiento expreso para los datos de salud (art. 9.2.a RGPD) y la relación de servicio para el resto " +
      "(art. 6.1.b RGPD). El envío de comunicaciones comerciales, si lo aceptas, va por su propio consentimiento y " +
      "es independiente de todo lo demás.",
    destinatarios:
      "Tu entrenador y el equipo autorizado del centro, y los proveedores que nos prestan servicio (alojamiento y " +
      "correo) como encargados del tratamiento. Cada consulta de tus datos de salud queda registrada.",
    conservacion:
      "Mientras seas socio y, después, el plazo de prescripción de las posibles reclamaciones derivadas del " +
      "entrenamiento.",
    derechos:
      "Acceso, rectificación, supresión, oposición, limitación y portabilidad, y a retirar tu consentimiento en " +
      "cualquier momento, escribiendo a info@trainingzone.es.",
    politicaUrl: "/privacidad",
  };
}

/**
 * Rótulos de las cuatro casillas del formulario. El de salud es el único
 * obligatorio y va SOLO, en su propio bloque: un consentimiento que cubriera a
 * la vez la salud y el marketing no sería específico y no valdría para ninguno
 * de los dos (arts. 6.1.a, 7 y 9.2.a RGPD).
 */
export const MEMBER_FORM_CONSENT_COPY: Record<ConsentKind, { title: string; label: string; help: string }> = {
  health: {
    title: "Datos de salud",
    label:
      "Consiento expresamente que el centro trate los datos de salud que doy en este formulario (peso, dolor, " +
      "molestias y limitaciones) para valorar mi estado y adaptar mi entrenamiento.",
    help:
      "Es lo único obligatorio para enviarlo, porque todo lo que se pregunta aquí es dato de salud. Si prefieres no " +
      "darlo, cierra esta página: lo veréis en el centro, con tu entrenador delante, y no pierdes nada.",
  },
  images: {
    title: "Uso de imágenes",
    label: "Autorizo las fotos de evolución física, visibles solo para mí y para mi entrenador.",
    help: "Opcional. Sin esto no podremos guardar tu galería de progreso.",
  },
  ai: {
    title: "Propuestas con inteligencia artificial",
    label:
      "Consiento que mis datos, seudonimizados (sin nombre, DNI ni contacto), se traten con sistemas de IA de " +
      "proveedores que actúan como encargados del tratamiento, para preparar propuestas de programación.",
    help:
      "Opcional. Toda propuesta la revisa y la aprueba tu entrenador antes de aplicarse, y oponerte no afecta a tu " +
      "acceso al servicio.",
  },
  marketing: {
    title: "Comunicaciones comerciales",
    label: LEAD_MARKETING_CONSENT_LABEL,
    help: "Opcional y separado de todo lo anterior. Puedes darte de baja con un clic en cualquier correo.",
  },
};

/**
 * Lo que se le pide al tutor de un socio menor (E10-12, art. 7.2 LOPDGDD). No
 * basta una casilla: hay que poder acreditar QUIÉN consintió, así que se piden
 * su nombre, su documento y una declaración expresa.
 */
export const GUARDIAN_DECLARATION_LABEL =
  "Declaro ser la madre, el padre o el tutor legal de quien va a entrenar, y consiento en su nombre el tratamiento " +
  "de sus datos, incluidos los de salud, descrito más arriba.";
