# Guía de implementación · Agente de Entrenamiento Personal dentro de la web app

*4 sep 2026 · Cómo llevar las instrucciones del proyecto Claude «Agente de Entrenamiento Personal — Training Zone» (`Instrucciones_Agente_Entrenamiento_Personal_v2.md`, versión **2026-08-30-b**, más el `MEMORY_KIT.md` del 30 ago 2026) a la generación de mesociclos de la plataforma (F6, `src/lib/ai/*`).*

---

## 0. Qué hay hoy y qué se quiere

**Hoy** el mesociclo se genera en una sola llamada (`generateMesocyclePlan`) a partir de tres campos del entrenador —nivel, semanas y disponibilidad— y de lo que la app ya sabe del socio (edad, sexo, objetivos, marcas, screening clínico si hay `consentAI`, valoración inicial). El sistema del modelo es un texto genérico de metodología de ~90 líneas (`MESOCYCLE_SYSTEM_METHODOLOGY`), la salida es un árbol `Mesocycle → Phase → Day → Block → Exercise` validado con Zod, nace en `DRAFT`, se edita campo a campo y se refina en multi-turno con `claude-haiku-4-5`.

**Se quiere** que esa generación piense y escriba como el agente del proyecto Claude que los entrenadores ya usan: los 5 grupos de cliente, el método secuencial/programado, la regla de oro «en duda, pregunta» y su cara B, los 7 principios (cero cardio pasivo, nunca repetir la sesión entera, no infradosificar…), el formato de sesión de 5 columnas con «Clave» seca y ejercicio «nunca pelado», la maquetación para el compañero que le toque ese día, la comprobación de los siete patrones, y la memoria de *por qué* existe cada regla.

**Lo que NO se traslada** (y qué lo sustituye en la app):

| En el proyecto Claude | En la web app |
|---|---|
| Notion (feed, ficha, base de Entrenamientos inline, Registro de rotación, brief del entrenador) | La ficha del socio, el árbol `Mesocycle*` y el `SessionDebrief` (fecha, entrenador, RPE, nota) que ya rellena el entrenador. El «Registro de rotación» se convierte en un enlace `SessionDebrief → MesocycleDay` (§5.4). |
| Google Drive / Google Docs / Calendar | Vista imprimible del mesociclo (`tz-print-screen` del editor) + revisiones periódicas que ya programa `assessment-jobs.ts`. |
| `ESTADO.md` como fuente única del estado | El estado vive en la base de datos: `Mesocycle.status`, `Assessment.dueDate`, tareas. |
| Skills y bibliotecas `_BIBLIOTECA/` + búsqueda en PubMed en vivo | Fuera de alcance en la fase 1. Se instruye al modelo para citar en corto y **no inventar**; la biblioteca curada es una fase posterior (§8). |
| Regla de arranque «¿qué versión tienes?» | `methodologyVersion` guardado en cada mesociclo y un test que comprueba que la constante coincide con la cabecera del documento (§3.3). |
| OK explícito antes de cada acción en Notion | Ya existe: el mesociclo nace en `DRAFT` y no vale hasta que lo aprueba una persona (§7.4 del roadmap). Se refuerza con la lista de `[SUPUESTO — confirmar]` (§5.3). |

---

## 1. Principios de la integración

1. **Una sola fuente de metodología, versionada, dentro del repo.** Los documentos del agente se trocean en ficheros `.md` bajo `src/lib/ai/methodology/` y se cargan en el prompt de sistema. Quien cambie una regla la cambia ahí, sube la versión y la prueba unitaria le obliga a que ambas coincidan. Se acaba el desfase de «edité el .md pero el agente sigue con la regla vieja».
2. **Lo que la app ya sabe no se vuelve a preguntar** (§2.7, cara B de la regla de oro). El «protocolo de extracción» de 8 pasos se convierte en un asistente corto que llega **prerrellenado** con la valoración inicial, el screening y los objetivos, y solo pregunta lo que falta, con opciones cerradas.
3. **El modelo no puede preguntar a mitad de una generación**, así que la regla de oro cambia de forma: lo que falte lo devuelve como `assumptions[]` marcadas `[SUPUESTO — confirmar]` y `pendingQuestions[]` con opciones cerradas, y **la aprobación se bloquea hasta que el entrenador las resuelve**.
4. **La salida se estructura para el compañero que le toque ese día**, no para quien diseñó el plan: lo que hay que vigilar arriba, una tabla de 5 columnas, finisher en una línea, el razonamiento plegado. El editor y la impresión se rediseñan sobre ese contrato.
5. **Todo lo que el modelo devuelva se valida en código.** Los siete patrones, el cardio pasivo, las semanas sin huecos, el agarre neutro con muñeca lesionada: lo que sea comprobable por programa se comprueba y se enseña como aviso, sin fiarse de que el modelo obedeció.
6. **RGPD intacto.** El único punto de salida de datos sigue siendo `getMesocycleBriefingForMember` (seudonimizado y auditado). Los campos nuevos de texto libre del asistente pasan por el mismo filtro y **se usa `canUseClinicalDataForAI`** (consentAI **y** consentHealth), que hoy existe en `consent.ts` pero no se aplica (ver informe de QA `QA-MESO`).

---

## 2. Arquitectura propuesta

```
src/lib/ai/
├── anthropic.ts                 (sin cambios: cliente, modelos)
├── methodology/                 ← NUEVO · la matriz troceada, texto plano cacheable
│   ├── VERSION                  "2026-08-30-b"
│   ├── 00-rol-y-principios.md   §1, §3 (7 principios), §13
│   ├── 01-regla-de-oro.md       §2 + §2.7 reescritas para salida estructurada (asunciones)
│   ├── 02-glosario.md           §4.1 (solo términos que el modelo usa al escribir)
│   ├── 03-reglas-cientificas.md §7 (sin PubMed en vivo: citar en corto, no inventar)
│   ├── 04-reglas-programacion.md §8 + Memory Kit bloque 4 (siete patrones, no infradosificar,
│   │                              fuera repertorio de fisio, inestabilidad opcional)
│   ├── 05-formato-sesion.md     §9.2, §9.2-bis, §9.3, §9.3-bis
│   ├── 06-porques.md            Memory Kit (bloques 2, 3, 4 y 9): el fallo real detrás de cada regla
│   ├── 07-upsell.md             §11 (fase 3, opcional)
│   └── perfiles/
│       ├── tercera-edad.md      §5.1
│       ├── rehabilitacion.md    §5.2
│       ├── derivacion-grupos.md §5.3 + Memory Kit bloque 9 (las 4 piezas de salida a grupos)
│       ├── rendimiento.md       §5.4 (oposiciones y atleta)
│       └── mantenimiento.md     §5.5 (subtipos A/B/C)
├── methodology.ts               ← NUEVO · carga, ensambla y versiona el sistema por perfil
├── mesocycle-schema.ts          (ampliado, §4)
├── mesocycle-prompt.ts          (briefing ampliado con el asistente, §5.2)
├── mesocycle-generator.ts       (system por perfil, validaciones post-generación)
├── mesocycle-validators.ts      ← NUEVO · siete patrones, cardio pasivo, semanas, muñeca
└── mesocycle-prompt.test.ts     (+ tests de versión y de validadores)
```

### 2.1 Por qué ficheros `.md` y no una constante TS

Los entrenadores ya mantienen ese documento en Markdown y lo seguirán haciendo. Un fichero por sección permite (a) revisar el diff de una regla sin ruido, (b) que la parte estable del sistema siga cacheándose (`cache_control`) porque se concatena siempre en el mismo orden con el mismo contenido, y (c) que el perfil sea la única pieza que cambia entre llamadas: **cinco prefijos cacheados, uno por grupo**, no uno por socio.

`methodology.ts` los lee una vez en el arranque del servidor con `fs.readFileSync` (módulo `server-only`), los concatena y expone:

```ts
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type EpProfile =
  | "TERCERA_EDAD" | "REHABILITACION" | "DERIVACION_GRUPOS"
  | "RENDIMIENTO_OPOSICIONES" | "RENDIMIENTO_ATLETA" | "MANTENIMIENTO";

const ROOT = join(process.cwd(), "src/lib/ai/methodology");
const read = (name: string) => readFileSync(join(ROOT, name), "utf8").trim();

/** Debe coincidir con la cabecera «🔖 VERSIÓN» del documento maestro. */
export const METHODOLOGY_VERSION = read("VERSION");

const SHARED = [
  "00-rol-y-principios.md",
  "01-regla-de-oro.md",
  "02-glosario.md",
  "03-reglas-cientificas.md",
  "04-reglas-programacion.md",
  "05-formato-sesion.md",
  "06-porques.md",
].map(read).join("\n\n---\n\n");

const PROFILE_FILE: Record<EpProfile, string> = {
  TERCERA_EDAD: "perfiles/tercera-edad.md",
  REHABILITACION: "perfiles/rehabilitacion.md",
  DERIVACION_GRUPOS: "perfiles/derivacion-grupos.md",
  RENDIMIENTO_OPOSICIONES: "perfiles/rendimiento.md",
  RENDIMIENTO_ATLETA: "perfiles/rendimiento.md",
  MANTENIMIENTO: "perfiles/mantenimiento.md",
};

/**
 * Sistema completo para un perfil. Es determinista: mismo perfil → mismos
 * bytes → mismo prefijo de caché. Nada del socio ni fecha alguna entra aquí.
 */
export function buildMethodologySystem(profile: EpProfile): string {
  return `${SHARED}\n\n---\n\n${read(PROFILE_FILE[profile])}\n\n---\n\n${OUTPUT_CONTRACT}`;
}
```

`OUTPUT_CONTRACT` es el bloque «Formato» actual de `MESOCYCLE_SYSTEM_METHODOLOGY` reescrito sobre el schema nuevo (§4). Se mantiene `MESOCYCLE_SYSTEM_REFINE` como sufijo del sistema de refinado, añadiendo la regla del Memory Kit: **al sustituir un ejercicio, comprobar que siguen los siete patrones**.

### 2.2 Coste y caché

El sistema pasa de ~1,2k tokens a ~9-11k tokens (la matriz entera ronda 17k; se trocea y se poda el glosario, Notion, calendario y ESTADO). Con `cache_control` en el último bloque del sistema, a partir del segundo mesociclo del mismo perfil se paga el 10 % de ese prefijo: el coste medido por generación (~0,18 $) sube a ~0,22-0,25 $ en la primera llamada del día por perfil y se queda en ~0,19 $ en las siguientes. El refinado no cambia. Se sigue comprobando con `logCacheUsage`: si `caché_leído` sale cero en la segunda llamada del mismo perfil, algo variable se ha colado en el prefijo.

---

## 3. Fase 0 · Metodología en el prompt (sin cambiar el esquema)

Es la parte que más cambia el resultado y la que menos cuesta: ~2 h. Se puede desplegar sola.

### 3.1 Trocear los documentos

Reglas al trocear (lo que se copia, lo que se reescribe, lo que se tira):

- **Se copia tal cual:** §1 (rol), §3 (7 principios), §4.1 (términos de programación), §5.1-5.5 (perfiles, incluidos «errores a evitar» y «programación prioriza»), §7.1-7.6 (científicas), §8.1-8.11 (programación), §9.2, §9.2-bis, §9.3, §9.3-bis, §11 (upsell), §13, y del Memory Kit los bloques 2, 3, 4 y 9 enteros (son el *porqué*: «un agente que sabe por qué existe una regla la aplica mejor»).
- **Se reescribe:** §2 y §2.7 (regla de oro) para un modelo que no puede preguntar en mitad de la respuesta: *«Cuando falte un dato que condiciona una decisión, NO lo rellenes en silencio: toma la opción más conservadora, márcala en `assumptions` con el texto `[SUPUESTO — confirmar] …` y añade en `pendingQuestions` una pregunta cerrada con 2-4 opciones y escape para que el entrenador la conteste antes de aprobar. Si el entrenador ya ha escrito algo en la ficha o en el asistente, eso es un dato, no un hueco: no lo conviertas en pregunta ni montes una sesión de VALORACIÓN.»* La regla §6.10 de «sin Hoja de Entrega no se programa» pasa a ser la puerta del asistente (§5.1), no una instrucción al modelo.
- **Se tira:** §0 (mapa de fases y rutas de carpetas), §4.3-4.4 (términos de servicio y científicos: no aportan al texto de salida), §6 (los 8 pasos → viven en el asistente), §9.1 y §9.5 (motores de sesión en ficheros externos y Notion), §10 (Notion), §12 (checklist → gate del asistente), §14 (ESTADO, calendario), la regla de arranque de versión (→ §3.3) y toda referencia a rutas `_SISTEMA/`, `01_PERFILES_CLIENTE/`, Drive, Cowork.
- **Se adapta el vocabulario:** «cliente» → «socio», «BBDD Entrenamientos/Notion» → «mesociclo», «Hoja de Entrega» → «ficha del socio y su valoración», «Raúl» y nombres de clientes reales del Memory Kit → se dejan como casos («el caso de la clienta de Mantenimiento de agosto») **sin nombres**: el prompt es un artefacto del repo y no debe llevar datos de personas.

### 3.2 Enchufarlo en el generador

En `mesocycle-generator.ts`, `generateMesocyclePlan(briefing)` pasa a recibir el perfil y a montar el sistema con `buildMethodologySystem(briefing.profile)`. Mientras el esquema no tenga `profile` (fase 1), se usa `MANTENIMIENTO` como perfil por defecto y se añade al briefing una línea «Perfil: no indicado — programa como Mantenimiento y pregunta el perfil en `pendingQuestions`».

```ts
const stream = client.messages.stream({
  model: MESOCYCLE_GENERATE_MODEL,
  max_tokens: MAX_TOKENS,
  thinking: { type: "adaptive" },
  system: [
    { type: "text", text: buildMethodologySystem(briefing.profile), cache_control: { type: "ephemeral" } },
  ],
  messages: [{ role: "user", content: userMessage }],
  output_config: { format: zodOutputFormat(MesocyclePlanSchema) },
});
```

### 3.3 Versión

- `Mesocycle.methodologyVersion String?` (migración de una columna, nullable para los existentes). Se rellena en `createMesocycleFromPlan` y `replaceMesocyclePlan` con `METHODOLOGY_VERSION`.
- El editor enseña «Metodología 2026-08-30-b» en la cabecera; si difiere de la vigente, un aviso: *«Este plan se generó con una versión anterior de la metodología. Refinarlo lo actualiza.»* Es el equivalente de la regla de arranque del agente.
- Test unitario en `methodology.test.ts`: la constante coincide con la primera línea `## 🔖 VERSIÓN:` del documento maestro (que se copia a `docs/agente-ep/Instrucciones_Agente_Entrenamiento_Personal_v2.md` para que el repo sea autosuficiente), y `buildMethodologySystem` devuelve los mismos bytes en dos llamadas (garantía de caché).

### 3.4 Consentimiento (corrección previa)

`getMesocycleBriefingForMember` decide la vía clínica solo con `consentAI`; `consent.ts` define `canUseClinicalDataForAI = consentAI && consentHealth` y nadie la llama. Antes de ampliar lo que se manda al modelo, se corrige: `select: { consentAI, consentHealth }` y `const clinicalAllowed = canUseClinicalDataForAI(member)`. Está reportado en `docs/QA_REGRESION_BUGS_2026-09-04.md`.

---

## 4. Fase 1 · Esquema de salida al formato de sesión de Training Zone

El árbol actual (`Phase → Day → Block → Exercise`) se conserva; se **añaden** campos para que el modelo pueda devolver exactamente las cuatro piezas de §9.2 y la maquetación de §9.2-bis, y para que el editor las pinte sin inventar nada. Todo lo nuevo en Prisma es nullable o con default, así los mesociclos existentes siguen abriéndose.

### 4.1 Zod (`mesocycle-schema.ts`)

```ts
export const MovementPattern = z.enum([
  "BISAGRA", "SENTADILLA", "EMPUJE_H", "EMPUJE_V", "TRACCION_H", "TRACCION_V",
  "MARCHA_LUNGE", "ANTIRROTACION", "ANTIEXTENSION", "ANTIFLEXION", "LOCOMOCION", "OTRO",
]);

export const MesocycleExerciseSchema = z.object({
  // §9.3-bis: nombre CON su adaptación específica, nunca de catálogo.
  name: z.string().describe('"Sentadilla en multipower con isométrico de 3 s abajo", no "sentadilla"'),
  pattern: MovementPattern.describe("Patrón dominante; sirve para comprobar los siete patrones"),
  sets: z.number().int(),
  reps: z.string(),
  load: z.string().nullable().describe('kg, %, RPE con reps en reserva, banda, "Corporal" o null'),
  tempoRest: z.string().describe('Tempo 4 dígitos y descanso en segundos: "3-1-1-0 · 90 s"'),
  cue: z.string().max(60).describe("Columna Clave: 3-6 palabras que unen señal de ejecución y criterio de parada"),
  progression: z.string().nullable().describe("UNA línea: progresión y, si aplica, regresión"),
  alternatives: z.string().nullable().describe("UNA línea: opciones abiertas para elegir en sesión"),
  watch: z.boolean().describe("true si es uno de los ejercicios donde se observa lo que hay que vigilar (👈)"),
  description: z.string().describe("Cómo se ejecuta, para que el socio pueda hacerlo sin entrenador delante"),
  rationale: z.string().describe("Por qué ESTE ejercicio para ESTE socio, cita corta si existe. Va plegado al final."),
});

export const MesocycleBlockSchema = z.object({
  kind: z.enum(["CALENTAMIENTO", "ENTRENO", "FINISHER"]),
  name: z.string(),
  durationMin: z.number().int(),
  exercises: z.array(MesocycleExerciseSchema).min(1),
});

export const MesocycleDaySchema = z.object({
  label: z.string().describe('Secuencial: "A" | "B" | "C". Programado: "S3-D2"'),
  venue: z.string(),
  focus: z.string(),
  // §9.2-bis regla 1: arriba del todo, 3-4 líneas.
  watchFor: z.array(z.string()).min(1).max(4).describe("LO ÚNICO QUE TIENES QUE VIGILAR: qué mirar, dónde se ve, qué hacer"),
  warmup: z.array(z.object({ exercise: z.string(), dose: z.string() })).min(1),
  // Rehabilitación: la reevaluación express es la PRIMERA fila del calentamiento.
  blocks: z.array(MesocycleBlockSchema).min(2),
  finisher: z.string().describe("Una línea. Es donde entra la demanda cardiovascular sin cardio pasivo"),
  record: z.string().nullable().describe("Cursiva final: qué apuntar al terminar"),
  ifWrecked: z.string().nullable().describe('"Si llega reventada": dos líneas'),
  designNotes: z.string().nullable().describe("Por qué está montada así. Se pliega; no se borra"),
});

export const MesocyclePlanSchema = z.object({
  title: z.string(),
  objective: z.string(),
  profile: z.enum([...]),                          // eco del perfil recibido
  method: z.enum(["SECUENCIAL", "PROGRAMADO"]),
  safetyCriteria: z.array(z.string()),
  weeklyLayout: z.array(z.string()).min(1),
  milestones: z.array(z.object({ week: z.number().int(), milestone: z.string() })).min(1),
  assumptions: z.array(z.string()).describe('Cada una empieza por "[SUPUESTO — confirmar]"'),
  pendingQuestions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()).min(2).max(4),
  })).describe("Preguntas cerradas que el entrenador debe contestar antes de aprobar"),
  phases: z.array(MesocyclePhaseSchema).min(1),
});
```

Notas de diseño:

- **`blocks` mínimo 2** (calentamiento + entreno) y el finisher va en su propio campo de una línea, tal y como manda §9.2: «cuatro piezas y ninguna más». El editor enseña **una sola tabla** para el bloque `ENTRENO`; si el modelo devuelve varios bloques de entreno, se concatenan en una tabla con un separador fino, no se pintan como «Bloque I / II / III».
- **`rationale` se mantiene obligatorio** (es la política del repo: «lo que separa el mesociclo de una plantilla») pero **deja de ser una columna**: va al `<details>` de diseño junto con `designNotes`. Así se respeta §9.3 («la columna Por qué se elimina») sin perder trazabilidad.
- **`pattern`** es lo que permite comprobar en código los siete patrones (§4.3) sin pedirle al modelo que se autoaudite.
- **Método secuencial:** una única `phase` con `weekFrom=1, weekTo=N` y `days` = slots `A`, `B`, `C` (o `A1/A2/B1…` si hay banco de rotación, §8.11). **Programado:** fases como hasta ahora y `label` `S[X]-D[Y]`.

### 4.2 Prisma

```prisma
model Mesocycle {
  // …
  profile            EpProfile?
  method             MesocycleMethod?
  methodologyVersion String?
  assumptions        Json?    // string[]
  pendingQuestions   Json?    // { question, options, answer? }[]
  briefSnapshot      Json?    // las respuestas del asistente que alimentaron la generación (§5.2)
}
enum EpProfile { TERCERA_EDAD REHABILITACION DERIVACION_GRUPOS RENDIMIENTO_OPOSICIONES RENDIMIENTO_ATLETA MANTENIMIENTO }
enum MesocycleMethod { SECUENCIAL PROGRAMADO }

model MesocycleDay {
  // …
  watchFor    Json?    // string[]
  finisher    String?
  record      String?
  ifWrecked   String?
  designNotes String?
  debriefs    SessionDebrief[]   // §5.4 registro de rotación
}
model MesocycleBlock { kind MesocycleBlockKind @default(ENTRENO) }
enum MesocycleBlockKind { CALENTAMIENTO ENTRENO FINISHER }

model MesocycleExercise {
  // …
  pattern      String?
  tempoRest    String?
  cue          String?
  progression  String?
  alternatives String?
  watch        Boolean @default(false)
}
model SessionDebrief { mesocycleDayId String?  mesocycleDay MesocycleDay? @relation(...) }
```

`warmup` sigue siendo `Json` (ahora `{exercise, dose}[]`); `toPlan` acepta el formato viejo (`string[]`) y lo convierte a `{exercise: s, dose: ""}` para que refinar un mesociclo antiguo no rompa.

### 4.3 Validadores post-generación (`mesocycle-validators.ts`)

Se ejecutan sobre el `parsed_output` antes de guardar, y sus resultados se guardan como **avisos del borrador** (no bloquean la generación; bloquean la aprobación los marcados como duros):

| Validador | Regla de origen | Dureza |
|---|---|---|
| Los siete patrones básicos (bisagra, sentadilla, empuje H, empuje V, tracción H, tracción V, marcha/lunge) aparecen al menos una vez en cada semana tipo (secuencial: en el conjunto de slots; programado: en cada fase). | Memory Kit bloque 4 ⚠️ (Isabel 26 ago, Pilar 28 ago: se cayó el empuje horizontal dos veces) | Aviso; **duro** en el refinado si un patrón que estaba desaparece |
| Ningún ejercicio de nombre `bici`, `cinta`, `elíptica`, `remo ergómetro` con `sets=1` y duración ≥8 min dentro de un bloque `ENTRENO`. | Principio 4 (cero cardio pasivo) | Duro |
| Fases contiguas sin huecos ni solapes y la última termina en `weeks`. | Sistema actual | Duro |
| Con screening de muñeca/codo/mano: ningún ejercicio con `pronado`, `agarre prono`, `flexiones en suelo`, `colgado` en las fases 1-2 salvo `progression` que lo autorice. | Sistema actual («mandan sobre todo lo demás») | Aviso |
| `name` de ejercicio con ≤3 palabras y sin coma ni «con» → «ejercicio pelado». | §9.3-bis (Pilar) | Aviso |
| Perfil Rehabilitación: la primera fila del calentamiento contiene «chequeo» o «dolor 0-10». | §9.2 | Aviso |
| `assumptions` no vacío o `pendingQuestions` no vacío. | Regla de oro | **Bloquea aprobar** hasta resolverlas (§5.3) |

Cada validador es una función pura `(plan, briefing) => Warning[]` con test unitario. La lista de avisos se guarda en `Mesocycle.warnings Json?` y el editor la pinta arriba del plan.

---

## 5. Fase 1 · El asistente «Antes de programar» (el protocolo de extracción)

Sustituye al formulario de tres campos de `panel.tsx` por un asistente de pasos cortos con opciones cerradas, que es exactamente §6 pero **prerrellenado con lo que la app ya sabe** y con la puerta de §12.

### 5.1 Pasos y de dónde se prerrellenan

| Paso (doc) | Pregunta en la app | Prerrelleno | Si falta |
|---|---|---|---|
| 1 · Perfil | Grupo (5 opciones + subtipo de Mantenimiento A/B/C y de Rendimiento) | `Member.trainingProfile` si ya se contestó otra vez | **Obligatorio.** Dolor activo en screening → se sugiere Rehabilitación primero |
| 1.5 · Método | Secuencial / Programado | último mesociclo del socio | Obligatorio |
| 2 · Objetivo | Opciones cerradas **por perfil** (§6.2) | `perfil.objetivoPrincipal` y `objetivoSecundario` de la valoración, `ClientGoal` | Rendimiento: **prueba + fecha + nivel actual** obligatorios (BLOQUEO §5.4) |
| 3 · Baseline | «¿Has hecho ya valoración?» | **Se salta si hay `Assessment` completada**: se muestra el resumen y se marca como cerrado (§2.7). Solo se pregunta lo que falta, por su nombre («kg de partida del hip thrust») | Sin valoración: se propone qué medir en sesión 1 según perfil, y la sesión 1 es de entrenamiento en la que además se apunta |
| 4 · Lesiones | Checklist de zonas | `HealthRecord` vigentes (vía `health-access`, solo con `canUseClinicalDataForAI`) + `screening.zonasDolor` | Para cada marcada: «¿dolor activo o solo precaución?» |
| 5 · Carga externa | A-E | `experiencia.nivelActividad` | Si C/D/E: qué y cuántas veces/semana |
| 6 · Otros centros | A-D + material | — | Material disponible allí |
| 7 · Preferencias | parte del cuerpo + material (multi) | `experiencia.ejerciciosNoTolera` como «rechaza» | — |
| 8 · Estilo | A/B/C + motivación | `perfil.motivacionReal`, `queLeHariaAbandonar` | — |
| Disponibilidad | Días y lugar (lo que ya hay) | `diasPorSemana` como sugerencia | Obligatorio (ya lo es) |
| Semanas | 4-12, **6 por defecto** (§8.7; hoy el default es 8) | — | — |

Todo se guarda en `Member.trainingProfile Json?` (lo persistente: perfil, método, carga externa, otros centros, preferencias, estilo) y en `Mesocycle.briefSnapshot` (la foto usada en esta generación). La siguiente vez el asistente sale rellenado y se confirma en un clic: **tratar al entrenador como vago** (principio 1).

**Puerta (§12):** el botón «Generar borrador» se habilita solo cuando perfil, método, objetivo, disponibilidad y —si Rendimiento— prueba/fecha/nivel están cerrados. El resto puede quedar vacío: el modelo lo marcará como supuesto.

### 5.2 Briefing (`buildMesocycleBriefing`)

Se añaden secciones al mensaje de usuario, después de las actuales, en este orden fijo (el orden también es contrato para la caché del refinado):

```
## Perfil Training Zone
- Grupo: Mantenimiento · subtipo B (pérdida de peso en privado)
- Método: Secuencial (slots A/B/C)
- Objetivo aterrizado: bajar 6 kg en 4 meses, tendencia medible con Tanita cada 3-4 semanas
- Carga externa: camina 45 min 3 días/semana
- Otros centros: no
- Preferencias: tren inferior · barra, kettlebell · rechaza: press militar
- Estilo: quiere hacer y ya · motivación: estética
## Valoración del entrenador (ya hecha — es un DATO, no un hueco)
- <notas de la valoración y del asistente, atribuidas al entrenador>
## Lo que falta (nómbralo así de preciso, nunca "falta valoración")
- kg de partida del hip thrust
```

Y la instrucción final del mensaje: *«Devuelve el plan en el formato indicado. Lo que falte y condicione una decisión va en `assumptions`/`pendingQuestions`, nunca rellenado en silencio.»*

**Filtro de texto libre.** Todo campo de texto del asistente y de la valoración que viaje al modelo pasa por `scrubIdentifiers()` (emails, teléfonos, DNI/NIE, y el nombre y apellidos del socio si aparecen literalmente). Hoy `perfil.objetivoPrincipal`, `cierre.notasEntrenador`, `screening.lesionesActuales`, `ClientGoal.label` y `HealthRecord.description` salen sin filtrar: un entrenador que escriba «María dice que…» rompe la seudonimización sin que nadie lo vea.

### 5.3 Supuestos y preguntas pendientes en el editor

- Bloque «Antes de aprobar» en la cabecera: cada `[SUPUESTO — confirmar]` con botones **Confirmar** / **Corregir** (abre el campo afectado), y cada `pendingQuestion` con sus opciones como radios + «Otra».
- Contestar una pregunta lanza un **refinado automático** con el texto `«Respuesta a "<pregunta>": <opción>. Aplica solo lo que cambie por esta respuesta.»` — reutiliza `refineMesocycleAction` sin cambios.
- `approveMesocycleAction` rechaza mientras `assumptions` o `pendingQuestions` tengan elementos sin resolver: *«Quedan 2 supuestos sin confirmar.»* Es la traducción exacta de §2.6: nunca se asume en silencio; si el entrenador quiere ir rápido, confirma en bloque con un clic, pero **lo confirma**.

### 5.4 Registro de rotación (método secuencial)

El Memory Kit lo marca obligatorio: sin él «no hay forma de saber qué slot tocó por última vez cuando han pasado semanas o cambia quién entrena». En la app ya existe el sitio donde el entrenador anota la sesión: `SessionDebrief` (feeling, RPE, nota) sobre la reserva. Se le añade `mesocycleDayId` y, en el formulario de debrief de una sesión de EP, un selector «Sesión realizada: A / B / C» que sale del mesociclo aprobado del socio. Con eso:

- El editor enseña bajo cada slot «Última vez: 2 sep · Laura · RPE 7» y arriba «**Hoy toca: B**» (el siguiente al último registrado).
- El Session Brief del entrenador del día muestra el slot que toca **con la maquetación de §9.2-bis** (lo que hay que vigilar, tabla, finisher): es el «compañero que le toque ese día».
- No se toca `Completado/RPE/Fecha/Entrenador` desde la IA: sigue siendo del entrenador, como en Notion.

### 5.5 Vista de sesión para el compañero (§9.2-bis)

Contrato de la pantalla de un día en el editor y en su impresión, en este orden y sin nada más:

1. 🔴 **LO ÚNICO QUE TIENES QUE VIGILAR** (`watchFor`, 3-4 líneas, fondo tinta).
2. Calentamiento: tabla de 2 columnas (Ejercicio · Dosis). En Rehab, la primera fila es el chequeo.
3. **Entreno: una tabla de 5 columnas** Ejercicio · Series × Reps · Carga · Tempo / Desc. · Clave. En la celda Ejercicio: nombre en negrita, `progression` y `alternatives` en **una línea en cursiva** debajo, 👈 si `watch`.
4. Finisher: una línea.
5. *Apuntar al terminar* (`record`) y *Si llega reventada* (`ifWrecked`): dos bloques de dos líneas.
6. `<details><summary>Por qué está montada así (solo si te hace falta)</summary>` con `designNotes` y los `rationale` de cada ejercicio.

Listón de aceptación: en un portátil de 13" la sesión cabe en una pantalla sin scroll salvo el `<details>`. La edición campo a campo se conserva; solo cambia lo que se ve sin pulsar.

---

## 6. Refinado

`MESOCYCLE_SYSTEM_REFINE` = `buildMethodologySystem(profile)` + el bloque actual de refinado + dos reglas nuevas:

- *«Si sustituyes o eliminas un ejercicio, comprueba que los siete patrones siguen cubiertos en la semana tipo. Si uno se cae, añade su sustituto en el mismo día y dilo en `designNotes`.»*
- *«Si el cambio contradice un `[SUPUESTO — confirmar]`, elimina ese supuesto de `assumptions`; si lo confirma, también. Nunca dejes un supuesto que ya no aplica.»*

En código, tras cada refinado corre `validatePatternCoverage(before, after)`: si un patrón que existía desaparece, el refinado **se rechaza** con el aviso y se ofrece «Refinar de nuevo pidiendo que lo mantenga». Es la única defensa real contra el fallo sistemático que el Memory Kit documenta dos veces.

### 6.1 El techo de contexto del refinado (comprobado)

`MESOCYCLE_REFINE_MODEL` es `claude-haiku-4-5`, cuyo contexto es de **200K tokens** — no 1M como el resto de la familia actual. El refinado reenvía en cada turno el historial entero, y cada turno añade el plan completo **dos veces** (el «Plan vigente» del mensaje del entrenador y la respuesta del modelo). Medido sobre el mesociclo del seed (3 fases, 4 días, 8 ejercicios): 3.828 caracteres ≈ 1.100 tokens por plan. Un plan realista de 12 semanas con 3 fases × 3 días × 3 bloques × 4 ejercicios tiene ~108 ejercicios —13 veces más— así que ronda **14-15k tokens por plan, ~30k por turno de refinado**: entre 5 y 6 refinados antes de agotar el contexto, contando el sistema ampliado de esta guía.

Con la metodología entera en el sistema el margen se estrecha, así que la fase 1 incluye una de estas dos medidas (elegir una, no las dos):

- **Compactar el historial:** guardar en `aiConversation` solo las peticiones del entrenador y el plan **vigente**, no todos los planes intermedios. El plan actual ya se manda entero en cada `buildRefineRequest`, así que los anteriores no aportan: son historia muerta que solo ocupa contexto. Es un cambio de tres líneas en `refineMesocyclePlan` y conserva intacto el historial de peticiones que pinta el editor.
- **Subir el modelo de refinado a `claude-sonnet-5`** (1M de contexto), asumiendo el coste: ~0,06 $ → ~0,12 $ por refinado.

Recomendación: la primera. El refinado solo necesita el plan vigente y qué se ha pedido antes, no cada versión intermedia.

El resto del historial no cambia; el modelo de refinado recibe el sistema completo por perfil, también cacheado.

### 6.2 Lo que hay que arreglar antes de ampliar el editor

Un bloque **no puede quedarse sin ejercicios**: `MesocycleBlockSchema` exige `min(1)`, pero `deleteMesocycleExerciseAction` borra sin comprobar si es el último y **no existe ninguna acción para añadir un ejercicio** (las únicas escrituras son actualizar y borrar). Un bloque vacío se copia al «Plan vigente» del siguiente refinado, el modelo lo reproduce, la salida deja de validar y el refinado queda roto de forma permanente para ese mesociclo. Está reportado en el informe de QA (`QA-MESO-01`) y es requisito de la fase 1c: al ampliar el editor entran `addMesocycleExerciseAction` y la comprobación del último ejercicio.

---

## 7. Plan de trabajo y estimación

| Fase | Qué | Ficheros | Estimación | Se puede desplegar sola |
|---|---|---|---|---|
| **0** | Trocear la matriz + Memory Kit en `methodology/`, `methodology.ts`, versión, test de versión y de caché, sistema por perfil (default Mantenimiento), corrección de `canUseClinicalDataForAI`, `scrubIdentifiers` | `src/lib/ai/methodology/**`, `methodology.ts`, `mesocycle-generator.ts`, `health-access.ts`, `docs/agente-ep/*` | ~2 h | Sí |
| **1a** | Schema Zod + Prisma + migración; `toPlan` retrocompatible; validadores; avisos en editor | `mesocycle-schema.ts`, `schema.prisma`, `mesocycle-queries.ts`, `mesocycle-validators.ts` (+ tests), `editor.tsx` | ~3 h | Sí (los campos nuevos son nullable) |
| **1b** | Asistente «Antes de programar» con prerrelleno y puerta §12; `Member.trainingProfile`; briefing ampliado; 6 semanas por defecto | `panel.tsx` → `brief-wizard.tsx`, `actions.ts`, `mesocycle-prompt.ts`, `health-access.ts` | ~3 h | Sí |
| **1c** | Vista de sesión §9.2-bis en editor e impresión; supuestos/preguntas con confirmación y bloqueo de aprobación | `editor.tsx`, `actions.ts`, `mesocycle-queries.ts` | ~3 h | Sí |
| **2** | Registro de rotación (`SessionDebrief.mesocycleDayId`, selector A/B/C en debrief, «hoy toca», slot en el Session Brief) | `schema.prisma`, `brief-queries.ts`, `brief/[id]/*`, `trainer/feedback/*`, API móvil `trainer/brief` | ~3 h | Sí |
| **3** (opcional) | Upsell con 5 campos y cita (§11), solo visible al entrenador, con comprobación «¿tiene nutricionista propio?»; biblioteca curada por perfil como `search_result` en el contexto; extracción conversacional con tool-use (una pregunta por turno) para quien prefiera chat al asistente | `mesocycle-schema.ts`, `methodology/07-upsell.md`, `member-data-panel.tsx` | ~4-6 h | — |

Total fases 0-2: **~14 h** de una persona, en tres o cuatro sesiones. La fase 0 sola ya cambia la calidad del borrador.

---

## 8. Criterios de aceptación

Se reproducen los casos reales que dieron origen a las reglas (Memory Kit), con datos de demo, sin nombres:

1. **Jaime (roadmap §7.5, ya definido):** 20 años, oposición Policía Nacional, doble rotura de cúbito y radio, 0 dominadas, poca movilidad de tobillo → agarre neutro/barra recta en todo lo que cargue muñeca; sin tracción vertical en gimnasio en S1-2; movilidad torácica en todos los calentamientos; el gesto de la prueba (dominadas) con progresión semanal y no bloques genéricos de dorsal; su carrera por su cuenta contabilizada como carga externa.
2. **Pilar (§9.3-bis):** perfil Mantenimiento con base → ningún ejercicio «pelado»: cada `name` lleva adaptación, cada fila tiene `progression` o `alternatives`; el validador de «ejercicio pelado» no salta.
3. **María Dolores (§2.7):** valoración inicial completada por el entrenador con notas en prosa («lumbares un poco cargadas, nada preocupante») → el plan **no** contiene una sesión ni fila «VALORACIÓN», `assumptions` no dice «falta valoración», y las notas del entrenador aparecen atribuidas en `safetyCriteria`/`designNotes`.
4. **Esther (§9.2-bis):** cualquier día cabe en una pantalla; `watchFor` arriba; el razonamiento solo dentro de `<details>`.
5. **Isabel / Pilar (siete patrones):** refinar «quita el press de banca» → el plan resultante sigue teniendo empuje horizontal (sustituido) o el refinado se rechaza con aviso.
6. **Cardio pasivo:** pedir «mete 15 min de bici al final» → el modelo lo programa como finisher/circuito atendido o lo saca fuera de la hora; el validador no encuentra cardio pasivo en `ENTRENO`.
7. **Secuencial vs programado:** el mismo socio generado con cada método produce, respectivamente, una fase con slots A/B/C y varias fases con `S[X]-D[Y]`.
8. **Regla de oro:** socio de Rendimiento sin fecha de prueba → el asistente no deja generar; socio de Mantenimiento sin material de su gimnasio de fuera → el plan trae un `pendingQuestion` con opciones cerradas y **no se puede aprobar** hasta contestarla.
9. **Consentimiento:** `consentAI=true, consentHealth=false` → el briefing sale por la vía sin datos clínicos.
10. **Seudonimización:** una nota de valoración con «Juan dice que…» y un email → el mensaje al modelo no contiene ni el nombre ni el email.
11. **Caché:** dos generaciones seguidas del mismo perfil → la segunda registra `caché_leído > 0`.
12. **Versión:** editar `methodology/VERSION` sin tocar el documento maestro rompe el test.

Los casos 1-8 son tests de integración que necesitan `ANTHROPIC_API_KEY`; se ejecutan a mano en cada cambio de metodología (coste ~2 $ la tanda). Los 9-12 son unitarios y van en CI.

---

## 9. Riesgos y decisiones abiertas

- **Tamaño del sistema.** Si el prefijo supera ~12k tokens, el refinado con Haiku empieza a costar más que generar con Sonnet en frío. Medir en fase 0 y, si hace falta, dejar en el refinado solo `04-reglas-programacion.md` + `05-formato-sesion.md` + el perfil. El techo de contexto de Haiku 4.5 (200K) es lo que obliga a la medida de §6.1.
- **Parámetros de la API ya verificados** contra la referencia vigente: `claude-sonnet-5` y `claude-haiku-4-5` son identificadores correctos y actuales; `thinking: {type: "adaptive"}` es válido en Sonnet 5 (`budget_tokens` está retirado ahí) y **no debe añadirse al refinado**, porque Haiku 4.5 no admite thinking adaptativo; `output_config.format` es la forma vigente de los structured outputs (`output_format` a secas está obsoleto). Nada de esto hay que cambiarlo: el código actual ya usa la forma correcta.
- **Citas científicas.** Sin herramienta de búsqueda el modelo puede inventar referencias. La instrucción es citar en corto solo lo muy replicado y decir «sin evidencia directa» en el resto; el `rationale` va plegado, así que el daño de una cita floja es bajo. La biblioteca curada (fase 3) es la solución de fondo.
- **Derivación a grupos** está «pendiente de definir con el equipo» en el documento; en la app se implementa con las cuatro piezas del Memory Kit bloque 9 (slot colectivo en el mes 3, criterio eliminatorio único, repertorio deliberado, número de correcciones como métrica) y se marca en el asistente como «criterios provisionales».
- **Socio en la app móvil.** El mesociclo sigue siendo solo del entrenador (decisión cerrada del roadmap). El «Registro de rotación» sí llega al móvil porque cuelga del debrief, que ya existe allí.
- **DPA con Anthropic**: sigue siendo la condición para apuntar esto a un socio real (roadmap §12). Nada de esta guía lo cambia.

---

## 10. Checklist de arranque para quien lo implemente

- [ ] Copiar `Instrucciones_Agente_Entrenamiento_Personal_v2.md` y `MEMORY_KIT.md` a `docs/agente-ep/` (son la fuente; el troceado en `src/lib/ai/methodology/` es derivado).
- [ ] Fase 0 completa y `npm run test:unit` en verde, incluido el test de versión.
- [ ] Generar un mesociclo con la clave real para los perfiles Mantenimiento y Rendimiento y comparar a ojo con una sesión hecha a mano por un entrenador (formato 5 columnas, ejercicio no pelado).
- [ ] Solo entonces migrar el esquema (fase 1a) y seguir por 1b → 1c → 2.
- [ ] Al cerrar cada fase, actualizar `docs/REGLAS_NEGOCIO_ESTADO_IMPLEMENTACION.md` (fila RB-IA-002) y este documento.
