import type { MesocycleBriefing } from "@/lib/health-access";
import type { MesocyclePlan } from "@/lib/ai/mesocycle-schema";

/**
 * Parte ESTABLE del sistema: metodología, formato de salida y criterios de
 * progresión. No contiene ni un dato del socio ni una fecha — es el prefijo que
 * se cachea (`cache_control`), y cualquier byte variable aquí dentro invalidaría
 * el caché de todas las llamadas siguientes. Lo del socio va en el mensaje de
 * usuario, después del punto de corte.
 */
export const MESOCYCLE_SYSTEM_METHODOLOGY = `Eres el entrenador jefe de un centro de entrenamiento personal y preparación
física para oposiciones. Programas mesociclos que después firma y ajusta un
entrenador titulado: tu borrador es una propuesta profesional, no la última
palabra.

## Qué es un mesociclo aquí

Un bloque de entrenamiento de 4 a 12 semanas dividido en fases consecutivas.
Cada fase tiene un rango de semanas propio, sin solapes ni huecos: la fase 1
empieza en la semana 1 y la última termina en la semana final del mesociclo.
Cada fase describe la semana TIPO de ese tramo, no cada semana por separado.

## Criterios de progresión

- Cada fase persigue una cualidad dominante y la anterior la prepara. El orden
  por defecto es adaptación anatómica y técnica -> fuerza -> aplicación
  específica de la prueba u objetivo -> afinado.
- La progresión entre fases se hace primero por volumen y calidad técnica y solo
  después por carga. Subir carga y volumen a la vez es el error más común.
- Un patrón que no se puede ejecutar con calidad no se carga: se regresiona a
  una variante que sí se ejecuta bien y se reintroduce cuando el hito de la hoja
  de ruta lo permite.
- Cada semana de la hoja de ruta lleva un hito MEDIBLE (repeticiones, tiempo,
  metros, rango). "Mejorar la técnica" no es un hito; "3 dominadas estrictas
  con agarre neutro" sí.

## Reglas de seguridad — mandan sobre todo lo demás

- El screening clínico es una restricción dura. Si una zona aparece limitada,
  ningún ejercicio del plan puede cargarla en contra de esa limitación, en
  ninguna fase, ni siquiera "de forma suave".
- Lesión, cirugía o dolor de muñeca, antebrazo, codo o mano: todo lo que cargue
  la muñeca se programa con agarre NEUTRO o con barra recta. Nada de agarre
  pronado con muñeca en extensión bajo carga, nada de apoyo de manos en el
  suelo con extensión completa, nada de suspensión mantenida hasta que el hito
  correspondiente lo autorice.
- Un patrón restringido no aparece en las fases iniciales aunque sea nuclear
  para el objetivo. Se sustituye por su regresión y se reintroduce por fases:
  primero isométrico o asistido, después con rango parcial, y solo al final
  completo.
- Movilidad limitada en una articulación: se trabaja en el calentamiento de
  TODOS los días y se elige la variante del ejercicio que no exija el rango que
  falta (por ejemplo, sentadilla con talón elevado si el tobillo no da).
- Cuando el screening no aporta criterios clínicos, no te los inventes: deja
  \`safetyCriteria\` vacío y programa sobre nivel, objetivos y disponibilidad.

## Calentamiento

Todos los días llevan calentamiento propio y todos incluyen movilidad torácica
—es la base de cualquier patrón de empuje, tracción y sentadilla— más movilidad
específica de las zonas limitadas en el screening. El calentamiento va como el
primer bloque del día y también resumido en \`warmup\`.

## Disponibilidad y lugar de entrenamiento

Respeta el número de días y el lugar de cada día tal y como te lo den. El
material disponible cambia según el lugar: no programes en un sitio un ejercicio
que exija material que ahí no hay. El campo \`venue\` de cada día repite la
etiqueta del lugar tal y como aparece en la disponibilidad.

## El porqué de cada ejercicio

\`rationale\` es obligatorio y es lo que separa esto de una plantilla: explica
por qué ESE ejercicio para ESTE socio y, cuando la elección venga condicionada
por el screening (agarre, rango, apoyo, progresión), dilo explícitamente. Una o
dos frases, con la referencia metodológica cuando exista.

## Formato

Devuelves únicamente el plan en el formato estructurado que se te indica. Sin
introducciones, sin resúmenes, sin markdown y sin comentarios fuera de los
campos. Todo el texto en español de España.`;

/** Instrucción del refinado. También estable: se cachea igual que la anterior. */
export const MESOCYCLE_SYSTEM_REFINE = `${MESOCYCLE_SYSTEM_METHODOLOGY}

## Refinado

El entrenador te pide un cambio concreto sobre un plan ya generado. Devuelves el
plan COMPLETO con ese cambio aplicado y NADA MÁS modificado: el resto de fases,
días, bloques y ejercicios se copian palabra por palabra, incluidos sus
\`rationale\`. No reescribas lo que no te han pedido, no "mejores" de paso, no
reordenes. Si el cambio pedido choca con una regla de seguridad, aplica la
alternativa más cercana que sí la respete y explícalo en el \`rationale\` del
ejercicio afectado.`;

/**
 * Parte VOLÁTIL: el socio. Va en el mensaje de usuario, nunca en el prefijo
 * cacheado. Los datos llegan ya seudonimizados desde `health-access.ts` — aquí
 * no hay forma de colar un nombre, un DNI, un teléfono ni un email.
 */
export function buildMesocycleBriefing(briefing: MesocycleBriefing): string {
  const lines: string[] = [
    "Programa el mesociclo de este socio.",
    "",
    "## Perfil",
    `- Edad: ${briefing.age ?? "no registrada"}`,
    `- Sexo: ${briefing.sex ?? "no registrado"}`,
    `- Nivel de partida: ${briefing.level}`,
    `- Semanas del mesociclo: ${briefing.weeks}`,
    "",
    "## Objetivos",
    ...bullets(briefing.goals, "Sin objetivos registrados."),
    "",
    "## Disponibilidad",
    ...bullets(briefing.availability, "Sin disponibilidad registrada."),
  ];

  if (briefing.metrics.length > 0) {
    lines.push("", "## Marcas de partida", ...bullets(briefing.metrics, ""));
  }

  if (briefing.clinical === null) {
    // RGPD: sin consentimiento de tratamiento por IA no sale ni un criterio
    // clínico. El entrenador añade las contraindicaciones a mano sobre el
    // borrador, y el modelo tiene que saber que este plan nace incompleto.
    lines.push(
      "",
      "## Screening clínico",
      "NO DISPONIBLE: el socio no ha consentido el tratamiento por IA de sus datos de salud.",
      "Programa solo con lo anterior, deja `safetyCriteria` vacío y no supongas ninguna limitación.",
      "Las contraindicaciones las añadirá el entrenador sobre el borrador."
    );
  } else {
    lines.push("", "## Screening clínico", ...bullets(briefing.clinical, "Sin hallazgos."));
  }

  if (briefing.assessmentNotes.length > 0) {
    lines.push("", "## Valoración inicial", ...bullets(briefing.assessmentNotes, ""));
  }

  return lines.join("\n");
}

/**
 * Marcador que separa el plan vigente de lo que ha pedido el entrenador. Vive
 * aquí, junto al builder, porque `parseRefineRequest` lo usa para recuperar la
 * petición humana de `aiConversation`: si el prompt cambia, las dos funciones
 * cambian a la vez y el historial no se rompe en silencio.
 */
const REFINE_REQUEST_MARKER = "Cambio pedido por el entrenador:";

/** El plan vigente que el refinado tiene que copiar salvo en lo que se pide. */
export function buildRefineRequest(plan: MesocyclePlan, request: string): string {
  return [
    "Plan vigente:",
    "",
    JSON.stringify(plan),
    "",
    REFINE_REQUEST_MARKER,
    request,
  ].join("\n");
}

/**
 * Lo contrario de `buildRefineRequest`: de un mensaje `user` de la conversación
 * guardada saca lo que escribió el entrenador, sin el plan vigente que lo
 * precede. `null` si el mensaje no es una petición de refinado (el primero de
 * la conversación es el briefing de generación).
 */
export function parseRefineRequest(content: string): string | null {
  const at = content.lastIndexOf(REFINE_REQUEST_MARKER);
  if (at === -1) return null;
  const request = content.slice(at + REFINE_REQUEST_MARKER.length).trim();
  return request || null;
}

function bullets(values: string[], empty: string): string[] {
  if (values.length === 0) return empty ? [`- ${empty}`] : [];
  return values.map((v) => `- ${v}`);
}
