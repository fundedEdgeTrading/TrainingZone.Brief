import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ASSESSMENT_CONFIG,
  STANDARD_MILESTONES,
  dueDateForMilestone,
  isQuestionEnabled,
  lenientConfig,
  milestoneKeyForMonths,
  milestoneLabelOf,
  resolveMilestones,
  slugifyQuestionKey,
  type AssessmentConfig,
  type CustomQuestionDef,
} from "./config";
import { assessmentSchemaFor } from "./schemas";

/**
 * Lo que se prueba aquí es que la configuración por organización no cambie nada
 * para quien no la toque, y que quien la toque obtenga exactamente lo que pidió.
 * Es el riesgo real de esta entrega: la escalera de hitos y el cuestionario eran
 * constantes del código, y ahora dependen de filas de base de datos que la
 * inmensa mayoría de organizaciones no va a tener.
 */

/** Revisión estándar completa: cada test rompe solo lo que quiere probar. */
const REVISION_COMPLETA = {
  pesoKg: 72.4,
  dolorActual: 2,
  calidadSueno: 4,
  estres: 3,
  energia: 4,
  diasPorSemana: "3",
  seguimiento: {
    adherenciaPercibida: 4,
    progresoPercibido: 3,
    queHaMejorado: "Duermo mejor",
    obstaculos: "",
    objetivoProximoPeriodo: "Bajar el tiempo del circuito",
  },
  marcas: [],
  cierre: { notasEntrenador: "" },
};

function configWith(patch: Partial<AssessmentConfig>): AssessmentConfig {
  return { ...DEFAULT_ASSESSMENT_CONFIG, ...patch };
}

/** El cuestionario sin una respuesta: lo que llega cuando la pregunta no se hace. */
function sin(source: object, ...keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
}

// ---------- Sin configuración: exactamente lo de siempre ----------

test("una organización sin configuración conserva la escalera de F3", () => {
  const milestones = resolveMilestones([]);
  assert.deepEqual(
    milestones.map((m) => [m.key, m.months]),
    [
      ["INITIAL", 0],
      ["M1", 1],
      ["M3", 3],
      ["M6", 6],
      ["M9", 9],
      ["Y1", 12],
    ]
  );
  assert.ok(milestones.every((m) => m.standard));
  assert.deepEqual(milestones, STANDARD_MILESTONES);
});

test("sin configuración el cuestionario sigue pidiendo todas sus preguntas", () => {
  const schema = assessmentSchemaFor("M3", DEFAULT_ASSESSMENT_CONFIG);
  assert.ok(schema.safeParse(REVISION_COMPLETA).success, "la revisión completa debería valer");

  assert.equal(
    schema.safeParse(sin(REVISION_COMPLETA, "calidadSueno")).success,
    false,
    "una pregunta que el centro no ha quitado sigue siendo obligatoria"
  );
});

test("las preguntas que sostienen otro módulo no se pueden apagar", () => {
  // Aunque alguien escriba la fila a mano, `pesoKg` (la serie de peso) y el
  // PAR-Q se siguen preguntando: el catálogo manda sobre la base de datos.
  const config = configWith({ disabledQuestions: ["pesoKg", "cierre.consentimientoParq"] });
  assert.equal(isQuestionEnabled(config, "pesoKg"), true);
  assert.equal(isQuestionEnabled(config, "cierre.consentimientoParq"), true);

  assert.equal(assessmentSchemaFor("M3", config).safeParse(sin(REVISION_COMPLETA, "pesoKg")).success, false);
});

// ---------- Hitos ----------

test("un centro puede añadir un hito por encima del aniversario", () => {
  const milestones = resolveMilestones([
    { key: milestoneKeyForMonths(18), label: "Revisión · 18 meses", months: 18 },
  ]);

  assert.equal(milestones.length, STANDARD_MILESTONES.length + 1);
  const ultimo = milestones.at(-1)!;
  assert.equal(ultimo.key, "M18");
  assert.equal(ultimo.months, 18);
  assert.equal(ultimo.standard, false);
  // Se guarda como CUSTOM porque los hitos del centro no son valores del enum.
  assert.equal(ultimo.kind, "CUSTOM");
  // Los estándar siguen estando y en su orden: esta historia solo añade.
  assert.deepEqual(
    milestones.slice(0, STANDARD_MILESTONES.length),
    STANDARD_MILESTONES
  );

  // Y vence donde toca: 18 meses desde el alta, con el recorte de fin de mes.
  assert.deepEqual(dueDateForMilestone(new Date(2026, 0, 31), ultimo), new Date(2027, 6, 31));
  assert.deepEqual(dueDateForMilestone(new Date(2026, 7, 31), ultimo), new Date(2028, 1, 29));
});

test("un hito nuevo se ordena por su vencimiento, no por cuándo se creó", () => {
  const milestones = resolveMilestones([
    { key: "M18", label: "Revisión · 18 meses", months: 18 },
    { key: "M2", label: "Revisión · 2 meses", months: 2 },
  ]);
  assert.deepEqual(
    milestones.map((m) => m.key),
    ["INITIAL", "M1", "M2", "M3", "M6", "M9", "Y1", "M18"]
  );
});

test("una fila con la clave de un hito estándar cambia sus meses y su nombre", () => {
  const milestones = resolveMilestones([{ key: "M9", label: "Revisión de temporada", months: 10 }]);
  const m9 = milestones.find((m) => m.key === "M9")!;
  assert.equal(m9.months, 10);
  assert.equal(m9.label, "Revisión de temporada");
  assert.equal(m9.standard, true, "sigue siendo el hito estándar, solo que movido");
  // Y sigue cayendo antes del aniversario, que no se ha tocado.
  assert.deepEqual(
    milestones.map((m) => m.key),
    ["INITIAL", "M1", "M3", "M6", "M9", "Y1"]
  );
});

test("la valoración guardada se enseña con el nombre del hito del centro", () => {
  const milestones = resolveMilestones([{ key: "M18", label: "Revisión de los 18", months: 18 }]);
  assert.equal(milestoneLabelOf({ kind: "CUSTOM", milestoneKey: "M18" }, milestones), "Revisión de los 18");
  // Los estándar no llevan `milestoneKey`: los nombra su `kind`.
  assert.equal(milestoneLabelOf({ kind: "M6", milestoneKey: null }, milestones), "Revisión · 6 meses");
});

// ---------- Preguntas desactivadas ----------

test("una pregunta desactivada deja de pedirse al guardar", () => {
  const config = configWith({
    disabledQuestions: ["calidadSueno", "estres", "seguimiento.progresoPercibido"],
  });
  const schema = assessmentSchemaFor("M3", config);

  const seguimiento = sin(REVISION_COMPLETA.seguimiento, "progresoPercibido");
  const respondido = { ...sin(REVISION_COMPLETA, "calidadSueno", "estres"), seguimiento };

  const parsed = schema.safeParse(respondido);
  assert.ok(parsed.success, parsed.error?.issues[0]?.message);
  assert.equal(parsed.data.calidadSueno, undefined);
  assert.equal(parsed.data.estres, undefined);
  // Lo que el centro sigue preguntando no se ha movido.
  assert.equal(parsed.data.energia, 4);

  // Y lo apagado deja de reclamarse, pero lo que sigue activo no:
  assert.equal(schema.safeParse(sin(respondido, "energia")).success, false);
});

// ---------- Preguntas propias del centro ----------

const PREGUNTA_PROPIA: CustomQuestionDef = {
  key: "cafes_al_dia",
  label: "¿Cuántos cafés al día?",
  type: "NUMBER",
  scope: "ALL",
  required: false,
  active: true,
};

test("la clave de una pregunta propia sale de su enunciado y aguanta acentos", () => {
  assert.equal(slugifyQuestionKey("¿Cuántos cafés al día?"), "cuantos_cafes_al_dia");
  assert.equal(slugifyQuestionKey("   "), "pregunta");
});

test("una pregunta propia se contesta y se guarda con su tipo", () => {
  const config = configWith({ customQuestions: [PREGUNTA_PROPIA] });
  const schema = assessmentSchemaFor("M3", config);

  const parsed = schema.safeParse({ ...REVISION_COMPLETA, custom: { cafes_al_dia: 3 } });
  assert.ok(parsed.success, parsed.error?.issues[0]?.message);
  // Lo que se guarda en `Assessment.answers` es exactamente esto.
  assert.deepEqual(parsed.data.custom, { cafes_al_dia: 3 });

  // El tipo con el que el centro creó la pregunta es el que se valida.
  assert.equal(schema.safeParse({ ...REVISION_COMPLETA, custom: { cafes_al_dia: "tres" } }).success, false);

  // Y al releer la valoración desde la ficha, la respuesta sigue ahí.
  const releida = assessmentSchemaFor("M3", lenientConfig(config)).safeParse(parsed.data);
  assert.ok(releida.success);
  assert.equal(releida.data.custom?.cafes_al_dia, 3);
});

test("una pregunta propia obligatoria bloquea el guardado hasta que se contesta", () => {
  const config = configWith({ customQuestions: [{ ...PREGUNTA_PROPIA, required: true }] });
  const schema = assessmentSchemaFor("M3", config);

  const vacio = schema.safeParse({ ...REVISION_COMPLETA, custom: {} });
  assert.equal(vacio.success, false);
  assert.match(vacio.error!.issues[0].message, /cafés al día/);
  assert.ok(schema.safeParse({ ...REVISION_COMPLETA, custom: { cafes_al_dia: 2 } }).success);
});

test("una pregunta propia solo se hace donde el centro dijo", () => {
  const config = configWith({
    customQuestions: [{ ...PREGUNTA_PROPIA, scope: "INITIAL", required: true }],
  });
  // En una revisión no se pregunta, así que tampoco se reclama.
  assert.ok(assessmentSchemaFor("M3", config).safeParse(REVISION_COMPLETA).success);
});

test("retirar una pregunta propia no borra lo que ya se contestó", () => {
  const config = configWith({ customQuestions: [{ ...PREGUNTA_PROPIA, active: false }] });
  const parsed = assessmentSchemaFor("M3", lenientConfig(config)).safeParse({
    ...REVISION_COMPLETA,
    custom: { cafes_al_dia: 3 },
  });
  assert.ok(parsed.success);
  assert.equal(parsed.data.custom?.cafes_al_dia, 3);
});
