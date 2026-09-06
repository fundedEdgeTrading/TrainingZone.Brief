import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * E3-08 · Se retira el feedback mensual de nueve deslizadores.
 *
 * Con 30 socios de EP eran 270 deslizadores y 30 textos al mes, con nota
 * obligatoria. El primer martes que se intentara usar, el entrenador los dejaba
 * todos en 7, escribía "va bien" y enviaba — y a las dos semanas dirección
 * estaría decidiendo sobre "Nutrición: 7" que nadie ha medido. Además dos de
 * esas dimensiones ("Bienestar físico: ¿libre de dolores?" y "Nutrición") son
 * juicios sobre salud y alimentación que al entrenador no le corresponde
 * puntuar.
 */

test("E3-08 · el formulario deja de estar accesible", () => {
  assert.equal(
    existsSync("src/app/(app)/trainer/feedback/[memberId]/page.tsx"),
    false,
    "/trainer/feedback/[memberId] ya no existe como ruta"
  );
});

test("E3-08 · no aparece en ningún menú ni panel", () => {
  const panel = readFileSync("src/app/(app)/trainer/pending-panel.tsx", "utf8");
  assert.ok(!panel.includes("/trainer/feedback/"), "el panel del entrenador ya no enlaza al formulario");
  assert.ok(!/key: "feedback"/.test(panel), "y la pestaña 'Feedback' desaparece");
});

test("E3-08 · nadie puede escribir un TrainerDebrief nuevo", () => {
  const capture = readFileSync("src/lib/feedback-capture.ts", "utf8");
  assert.ok(!/export async function submitTrainerDebrief\b/.test(capture), "el escritor se retira");
  assert.ok(
    !/prisma\.trainerDebrief\.create/.test(capture),
    "y no queda ningún punto de creación: lo que desaparece es la captura"
  );
});

test("E3-08 · el ciclo mensual deja de reclamárselo al entrenador", () => {
  const capture = readFileSync("src/lib/feedback-capture.ts", "utf8");
  const cycle = capture.slice(capture.indexOf("export async function runFeedbackCycleRule"));
  assert.ok(
    !cycle.includes("TRAINER_DEBRIEF_ENTITY"),
    "al socio se le sigue preguntando —eso lo contesta quien lo vive— pero al entrenador no"
  );
});

test("E3-08 · los datos ya escritos se conservan y se siguen leyendo", () => {
  const queries = readFileSync("src/lib/feedback-queries.ts", "utf8");
  assert.match(queries, /trainerDebriefs/, "el panel de dirección sigue leyendo lo registrado");

  // Y la divergencia entrenador ↔ socio se sigue pudiendo contrastar con lo que
  // ya existía, que es lo que la historia pide conservar.
  const brief = readFileSync("src/lib/brief-queries.ts", "utf8");
  assert.match(brief, /export async function getWeeklyClientFeedback/);
});
