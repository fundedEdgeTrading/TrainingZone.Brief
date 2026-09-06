/**
 * E10-17 · Reglamento de IA: clasificación, transparencia y alfabetización.
 *
 * Calendario verificado, que es lo que decide qué es exigible HOY y qué no:
 *  - **art. 4 (alfabetización)**: aplicable desde el 2/2/2025. Alcanza a los
 *    proveedores Y a los responsables del despliegue — es decir, también al
 *    centro que opera el generador, no solo a quien lo construye.
 *  - **art. 50 (transparencia)**: aplicable desde el 2/8/2026. Ya está en vigor.
 *  - **alto riesgo (Anexo III)**: retrasado al 2/12/2027.
 *
 * Clasificación razonada: el generador de mesociclos **no encaja en ningún
 * supuesto del Anexo III** —no es empleo, ni educación reglada, ni crédito, ni
 * servicios esenciales, ni dispositivo médico— y el semáforo de aptitud es
 * determinista, no IA. Conclusión: **riesgo limitado**, arts. 4 y 50.
 *
 * Conviene no precipitarse ante el ruido comercial de este mercado: declararse
 * de alto riesgo "por si acaso" arrastra obligaciones que no tocan, y el
 * análisis quedaría igual de mal hecho.
 */

export type AiRiskLevel = "inaceptable" | "alto" | "limitado" | "minimo";

export type AiSystemClassification = {
  system: string;
  riskLevel: AiRiskLevel;
  /** Fecha de la clasificación. Un análisis sin fecha no se puede revisar. */
  classifiedOn: string;
  /** Por qué NO es de alto riesgo, supuesto a supuesto. */
  reasoning: string[];
  /** Obligaciones que sí aplican hoy. */
  obligations: string[];
  /** Qué obligaría a reabrir el análisis. */
  reopenIf: string[];
  /** Dónde vive el análisis largo, para el despacho. */
  document: string;
};

export const MESOCYCLE_AI_CLASSIFICATION: AiSystemClassification = {
  system: "Generador de propuestas de mesociclo (Claude API)",
  riskLevel: "limitado",
  classifiedOn: "2026-09-06",
  reasoning: [
    "No es empleo ni gestión de trabajadores (Anexo III.4): no decide sobre contratación, promoción ni cese.",
    "No es educación ni formación profesional reglada (Anexo III.3): no evalúa ni admite en ningún programa oficial.",
    "No es acceso a crédito ni a servicios esenciales públicos o privados (Anexo III.5).",
    "No es producto sanitario: no diagnostica, no trata y no sustituye a un profesional sanitario.",
    "El semáforo de aptitud, que sí condiciona lo que el socio puede hacer, es DETERMINISTA (`AptitudeRule`): no es un sistema de IA.",
    "La propuesta nace en DRAFT y no llega al socio por ningún endpoint sin que un profesional cualificado la apruebe.",
  ],
  obligations: [
    "Art. 50: marcar de forma visible que el contenido lo ha generado una IA y quién lo ha revisado.",
    "Art. 4: acreditar la alfabetización en IA de quien opera el sistema.",
    "Art. 28 RGPD y decisión D-C5: sin contrato de encargo firmado, la IA no trata datos de un socio real.",
  ],
  reopenIf: [
    "Si alguna vez el mesociclo llega al socio SIN revisión humana, se reabre la clasificación y con ella el análisis del art. 22 RGPD (decisión individual automatizada).",
    "Si el sistema pasa a decidir sobre el personal del centro, entraría en el Anexo III.4.",
    "Si se le pide una valoración de aptitud clínica en vez de una propuesta de programación.",
  ],
  document: "docs/legal/04-USO-DE-IA.md",
};

/**
 * Marca del art. 50, tal y como se pinta.
 *
 * "De forma visible, no en un pie": la marca dice a la vez las dos cosas que
 * importan —que lo generó una IA y quién responde de ello—, porque un
 * "generado con IA" a secas invita a pensar que nadie lo ha mirado, y un
 * "revisado por Sergio" a secas oculta de dónde salió.
 */
export function aiGeneratedLabel(input: { reviewerName?: string | null; approved: boolean }): string {
  if (input.approved && input.reviewerName?.trim()) {
    return `Propuesta generada con IA · revisada por ${input.reviewerName.trim()}`;
  }
  return "Propuesta generada con IA · pendiente de revisión por un entrenador";
}

// ---------------------------------------------------------------------------
// Art. 4 · Alfabetización en IA de quien opera el sistema
// ---------------------------------------------------------------------------

/** Entidad bajo la que se anota la formación en `AuditLog`. */
export const AI_LITERACY_ENTITY = "AiLiteracy";
export const AI_LITERACY_ACTION = "AI_LITERACY_ACKNOWLEDGED";

/** Versión del contenido formativo. Al cambiarlo se vuelve a acreditar. */
export const AI_LITERACY_VERSION = "2026-09-v1";

/**
 * Lo que tiene que entender quien pulsa "Generar". No es un curso: es lo
 * mínimo que separa usar la herramienta de creerle.
 */
export const AI_LITERACY_POINTS = [
  "La propuesta es un borrador estadístico, no un criterio profesional: puede proponer una progresión que no encaje con este socio.",
  "Nada que salga del modelo llega al socio sin que tú lo apruebes. Aprobar es firmar: la responsabilidad del plan es tuya.",
  "Los datos que viajan van seudonimizados —sin nombre, DNI, dirección ni contacto— y solo si el socio ha consentido el tratamiento con IA.",
  "Los criterios de seguridad heredados del screening son un límite, no una sugerencia: si la propuesta los pisa, se corrige antes de aprobar.",
  "El modelo no sabe lo que pasó en la última sesión ni lo que te dijo el socio en la sala. Eso lo pones tú.",
  "Si algo de la propuesta te chirría y no sabes por qué, no la apruebes: pregunta o reescríbela.",
];
