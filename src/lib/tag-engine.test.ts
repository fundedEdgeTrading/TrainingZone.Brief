import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  ABSENCE_DAYS,
  FIRST_DAYS,
  diffAutomaticTags,
  evaluateAutomaticTags,
  type TagRuleFacts,
} from "./tag-engine";
import { AUTOMATIC_TAG_KEYS, type AutomaticTagKey } from "./tags";

/**
 * Las nueve reglas son decisiones PURAS sobre un socio y una fecha, así que se
 * prueban sin base de datos. Y se prueban SIEMPRE EN LOS DOS SENTIDOS: nueve
 * reglas son dieciocho comportamientos, y el que se olvida siempre es el
 * segundo — la etiqueta que no se cae cuando el socio vuelve es la que hace que
 * un flujo escriba a quien ya está entrenando.
 */

const NOW = new Date("2026-09-15T09:00:00.000Z");
const DAY = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

/** Socio de control: cliente, de grupos, que vino ayer y no cumple este mes. */
function facts(overrides: Partial<TagRuleFacts> = {}): TagRuleFacts {
  return {
    memberId: "m1",
    state: "ACTIVE",
    joinedAt: daysAgo(400),
    birthDate: new Date(Date.UTC(1990, 2, 4)), // marzo
    todayInCenter: new Date(2026, 8, 15), // 15 de septiembre, medianoche del centro
    serviceKinds: ["GROUP"],
    lowPackBalance: false,
    lastAttendanceAt: daysAgo(1),
    ...overrides,
  };
}

function tagsOf(overrides: Partial<TagRuleFacts> = {}): Set<AutomaticTagKey> {
  return new Set(evaluateAutomaticTags(facts(overrides), NOW));
}

// ---------------------------------------------------------------------------
// 1 y 2 · Grupo reducido / Entrenamiento personal — salen del plan contratado
// ---------------------------------------------------------------------------

test("grupo reducido: se pone con plan de grupo y se quita al quedarse sin plan", () => {
  assert.ok(tagsOf({ serviceKinds: ["GROUP"] }).has("grupo_reducido"));
  assert.ok(!tagsOf({ serviceKinds: [] }).has("grupo_reducido"));
});

test("entrenamiento personal: se pone con plan de EP y se quita al pasarse a grupos", () => {
  assert.ok(tagsOf({ serviceKinds: ["EP"] }).has("entrenamiento_personal"));
  assert.ok(!tagsOf({ serviceKinds: ["GROUP"] }).has("entrenamiento_personal"));
});

test("las dos modalidades conviven: un socio tiene varias etiquetas", () => {
  const tags = tagsOf({ serviceKinds: ["EP", "GROUP"] });
  assert.ok(tags.has("entrenamiento_personal"));
  assert.ok(tags.has("grupo_reducido"));
});

test("un excliente no arrastra la etiqueta de su modalidad", () => {
  assert.ok(!tagsOf({ state: "CANCELLED", serviceKinds: ["EP"] }).has("entrenamiento_personal"));
});

// ---------------------------------------------------------------------------
// 3 · Primeros 30 días — `joinedAt`
// ---------------------------------------------------------------------------

test("primeros 30 días: entra el recién llegado y se cae solo al día 30", () => {
  assert.ok(tagsOf({ joinedAt: daysAgo(3) }).has("primeros_30_dias"));
  assert.ok(tagsOf({ joinedAt: daysAgo(FIRST_DAYS - 1) }).has("primeros_30_dias"));
  assert.ok(!tagsOf({ joinedAt: daysAgo(FIRST_DAYS) }).has("primeros_30_dias"));
});

test("primeros 30 días: la prueba cuenta; el que ya se fue, no", () => {
  assert.ok(tagsOf({ state: "TRIAL", joinedAt: daysAgo(5) }).has("primeros_30_dias"));
  assert.ok(!tagsOf({ state: "CANCELLED", joinedAt: daysAgo(5) }).has("primeros_30_dias"));
});

// ---------------------------------------------------------------------------
// 4 · Bono por acabarse — misma condición que runLowPackBalanceRule
// ---------------------------------------------------------------------------

test("bono por acabarse: se pone con el saldo bajo y se quita al renovar", () => {
  assert.ok(tagsOf({ lowPackBalance: true }).has("bono_por_acabarse"));
  assert.ok(!tagsOf({ lowPackBalance: false }).has("bono_por_acabarse"));
});

test("bono por acabarse: solo mientras el socio está de alta", () => {
  assert.ok(!tagsOf({ state: "CANCELLED", lowPackBalance: true }).has("bono_por_acabarse"));
});

// ---------------------------------------------------------------------------
// 5 · 2 semanas sin venir — la única con cálculo propio
// ---------------------------------------------------------------------------

test("2 semanas sin venir: se pone a los 14 días y SE QUITA el día que vuelve", () => {
  assert.ok(tagsOf({ lastAttendanceAt: daysAgo(ABSENCE_DAYS) }).has("dos_semanas_sin_venir"));
  assert.ok(tagsOf({ lastAttendanceAt: daysAgo(40) }).has("dos_semanas_sin_venir"));
  // El socio volvió: la etiqueta desaparece sola, o el flujo de ausencia le
  // escribe preguntándole por qué no viene a alguien que entrenó ayer.
  assert.ok(!tagsOf({ lastAttendanceAt: daysAgo(1) }).has("dos_semanas_sin_venir"));
  assert.ok(!tagsOf({ lastAttendanceAt: daysAgo(ABSENCE_DAYS - 1) }).has("dos_semanas_sin_venir"));
});

test("2 semanas sin venir: quien no ha venido nunca se cuenta desde el alta", () => {
  assert.ok(tagsOf({ lastAttendanceAt: null, joinedAt: daysAgo(60) }).has("dos_semanas_sin_venir"));
  // Recién dado de alta y todavía sin pisar la sala: no es una ausencia.
  assert.ok(!tagsOf({ lastAttendanceAt: null, joinedAt: daysAgo(3) }).has("dos_semanas_sin_venir"));
});

test("2 semanas sin venir: congelado e impago quedan fuera, tienen su etiqueta", () => {
  const ausente = { lastAttendanceAt: daysAgo(30) };
  assert.ok(!tagsOf({ ...ausente, state: "FROZEN" }).has("dos_semanas_sin_venir"));
  assert.ok(!tagsOf({ ...ausente, state: "DELINQUENT" }).has("dos_semanas_sin_venir"));
  assert.ok(!tagsOf({ ...ausente, state: "CANCELLED" }).has("dos_semanas_sin_venir"));
});

// ---------------------------------------------------------------------------
// 6, 7 y 8 · Impago, Congelado, Excliente — son `Member.state`
// ---------------------------------------------------------------------------

test("impago: se pone en DELINQUENT y se quita al recuperar el cobro", () => {
  assert.ok(tagsOf({ state: "DELINQUENT" }).has("impago"));
  assert.ok(!tagsOf({ state: "ACTIVE" }).has("impago"));
});

test("congelado: se pone en FROZEN y se quita al volver", () => {
  assert.ok(tagsOf({ state: "FROZEN" }).has("congelado"));
  assert.ok(!tagsOf({ state: "ACTIVE" }).has("congelado"));
});

test("excliente: se pone en CANCELLED y se quita si vuelve a darse de alta", () => {
  assert.ok(tagsOf({ state: "CANCELLED" }).has("excliente"));
  assert.ok(!tagsOf({ state: "ACTIVE" }).has("excliente"));
});

test("impago y congelado son estados distintos y no se pisan (HU-ST-14)", () => {
  assert.ok(!tagsOf({ state: "FROZEN" }).has("impago"));
  assert.ok(!tagsOf({ state: "DELINQUENT" }).has("congelado"));
});

// ---------------------------------------------------------------------------
// 9 · Cumple este mes — `birthDate`, en el calendario del centro
// ---------------------------------------------------------------------------

test("cumple este mes: entra en su mes y se cae al mes siguiente", () => {
  const septiembre = new Date(Date.UTC(1988, 8, 30));
  assert.ok(tagsOf({ birthDate: septiembre }).has("cumple_este_mes"));
  assert.ok(!tagsOf({ birthDate: new Date(Date.UTC(1988, 9, 1)) }).has("cumple_este_mes"));
  assert.ok(!tagsOf({ birthDate: null }).has("cumple_este_mes"));
});

test("cumple este mes: manda el mes del CENTRO, no el del servidor", () => {
  // Medianoche del 1 de octubre en el centro (el servidor, en UTC, todavía
  // está a 30 de septiembre): quien cumple en octubre ya entra.
  const enOctubre = tagsOf({
    birthDate: new Date(Date.UTC(1988, 9, 2)),
    todayInCenter: new Date(2026, 9, 1),
  });
  assert.ok(enOctubre.has("cumple_este_mes"));
});

test("cumple este mes: a un excliente no se le felicita", () => {
  const septiembre = new Date(Date.UTC(1988, 8, 30));
  assert.ok(!tagsOf({ birthDate: septiembre, state: "CANCELLED" }).has("cumple_este_mes"));
  // Al congelado sí: es de los pocos motivos decentes para escribirle.
  assert.ok(tagsOf({ birthDate: septiembre, state: "FROZEN" }).has("cumple_este_mes"));
});

// ---------------------------------------------------------------------------
// Idempotencia y forma del catálogo
// ---------------------------------------------------------------------------

test("dos pasadas seguidas no mueven nada: el motor es idempotente", () => {
  const f = facts({ state: "DELINQUENT", lowPackBalance: true, serviceKinds: ["EP"] });
  const desired = evaluateAutomaticTags(f, NOW);

  const primera = diffAutomaticTags([], desired);
  assert.deepEqual(primera.remove, []);
  assert.ok(primera.add.length > 0, "la primera pasada tiene que poner algo");

  // Aplicada la primera, la segunda no tiene nada que hacer.
  const segunda = diffAutomaticTags(primera.add, evaluateAutomaticTags(f, NOW));
  assert.deepEqual(segunda, { add: [], remove: [] });
});

test("el cambio de estado del socio quita la vieja y pone la nueva en la misma pasada", () => {
  const antes = evaluateAutomaticTags(facts({ state: "DELINQUENT" }), NOW);
  assert.ok(antes.includes("impago"));

  // Paga: deja de ser impago y vuelve a ser cliente.
  const ahora = evaluateAutomaticTags(facts({ state: "ACTIVE" }), NOW);
  const { add, remove } = diffAutomaticTags(antes, ahora);
  assert.deepEqual(remove, ["impago"]);
  assert.deepEqual(add, []);
});

test("una etiqueta que no es de las nueve no la toca el motor", () => {
  // «Embajador» es manual: ni se pone ni se quita aquí.
  const { add, remove } = diffAutomaticTags(["embajador", "impago"], ["impago"]);
  assert.deepEqual(add, []);
  assert.deepEqual(remove, []);
});

test("las nueve claves tienen regla, y ninguna regla sobra", () => {
  const conRegla = new Set(
    evaluateAutomaticTags(
      facts({
        state: "ACTIVE",
        serviceKinds: ["EP", "GROUP"],
        lowPackBalance: true,
        // Se dio de alta hace 20 días, vino el primer día y no ha vuelto.
        joinedAt: daysAgo(20),
        lastAttendanceAt: daysAgo(20),
        birthDate: new Date(Date.UTC(1988, 8, 9)),
      }),
      NOW
    )
  );
  // Un socio no puede caer a la vez en las nueve —impago, congelado y excliente
  // son estados excluyentes— pero sí en las seis que no dependen del estado.
  for (const key of ["grupo_reducido", "entrenamiento_personal", "primeros_30_dias", "bono_por_acabarse", "dos_semanas_sin_venir", "cumple_este_mes"] as const) {
    assert.ok(conRegla.has(key), `falta la regla de ${key}`);
  }
  for (const key of conRegla) {
    assert.ok((AUTOMATIC_TAG_KEYS as readonly string[]).includes(key), `${key} no está en el catálogo`);
  }
});
