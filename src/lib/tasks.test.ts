import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_TASK_CAP_ENTITY,
  AUTO_TASK_RULES,
  AUTO_TASK_RULE_KEYS,
  autoTaskRuleFor,
  autoTaskWeekStart,
  groupTasksByRule,
  type AutoTaskRuleKey,
} from "@/lib/tasks";
import { NOTIFICATION_ENTITY_TYPES } from "@/lib/notification-routes";

/**
 * E14-11 · la parte del arreglo que se puede probar sin base de datos: la
 * CLAVE. El escenario completo («con pocas sesiones abierta, la de bono bajo se
 * crea») vive en `trainer-alerts.test.ts`, contra la base real, porque lo que
 * se rompía era una consulta.
 *
 * Esta comprobación es la que habría cazado el fallo el día que se escribió: no
 * hacía falta una base de datos para ver que dos reglas distintas compartían la
 * misma clave de deduplicación.
 */
test("E14-11 · dos reglas distintas nunca comparten clave de deduplicación", () => {
  const seen = new Map<string, AutoTaskRuleKey>();
  for (const key of AUTO_TASK_RULE_KEYS) {
    const entityType = AUTO_TASK_RULES[key].entityType;
    const previous = seen.get(entityType);
    assert.equal(
      previous,
      undefined,
      `las reglas «${previous}» y «${key}» comparten entityType "${entityType}": la segunda no se crearía nunca`
    );
    seen.set(entityType, key);
  }
});

test("E14-11 · las dos reglas del encargo tienen entidad propia y no «Member»", () => {
  assert.notEqual(AUTO_TASK_RULES.fewSessionsScheduled.entityType, "Member");
  assert.notEqual(AUTO_TASK_RULES.lowPackBalance.entityType, "Member");
  assert.notEqual(AUTO_TASK_RULES.fewSessionsScheduled.entityType, AUTO_TASK_RULES.lowPackBalance.entityType);
});

test("E14-11 · las entidades que introduce E14-11/12 tienen destino en la campana", () => {
  // Una entidad nueva sin fila en `notification-routes.ts` deja el aviso sin
  // enlace a la ficha del socio, y eso no se ve hasta que alguien pincha.
  //
  // Se comprueban las que entran con este cambio. Las reglas heredadas de otras
  // pistas (`ClientFeedbackPrompt`, `FeedbackFollowUp`, `SelfAssessmentPrompt`,
  // `TrainerRatingPrompt`, `PaymentDispute`, `JobFailure`) tampoco tienen
  // destino HOY, antes de este cambio: es un hueco anterior, de sus ficheros, y
  // fijarlo aquí sería inventarse a qué pantalla va cada una.
  const nuevas: AutoTaskRuleKey[] = ["fewSessionsScheduled", "lowPackBalance", "stallRisk", "noShowStreak", "weeklyCap"];
  for (const key of nuevas) {
    assert.ok(
      NOTIFICATION_ENTITY_TYPES.includes(AUTO_TASK_RULES[key].entityType as (typeof NOTIFICATION_ENTITY_TYPES)[number]),
      `la regla «${key}» usa "${AUTO_TASK_RULES[key].entityType}", que no está en NOTIFICATION_ENTITY_TYPES`
    );
  }
});

test("E14-11 · la entidad de una regla la identifica; una cualquiera, no", () => {
  assert.equal(autoTaskRuleFor("MemberLowPackBalance"), "lowPackBalance");
  assert.equal(autoTaskRuleFor("Member"), null);
  assert.equal(autoTaskRuleFor(null), null);
});

/* ------------------------------------------------------------------------- */

test("E14-12 · la semana del tope empieza el lunes", () => {
  // 2026-09-15 es martes; 2026-09-20, domingo.
  assert.deepEqual(autoTaskWeekStart(new Date(2026, 8, 15, 13, 30)), new Date(2026, 8, 14, 0, 0, 0, 0));
  assert.deepEqual(autoTaskWeekStart(new Date(2026, 8, 20, 23, 59)), new Date(2026, 8, 14, 0, 0, 0, 0));
  assert.deepEqual(autoTaskWeekStart(new Date(2026, 8, 21, 0, 1)), new Date(2026, 8, 21, 0, 0, 0, 0));
});

test("E14-12 · el aviso del tope no es una regla más: tiene entidad propia", () => {
  assert.equal(AUTO_TASK_RULES.weeklyCap.entityType, AUTO_TASK_CAP_ENTITY);
});

/* ------------------------------------------------------------------------- */

const auto = (id: string, entityType: string) => ({ id, entityType, createdByUserId: null });
const manual = (id: string) => ({ id, entityType: null, createdByUserId: "quien-la-manda" });

test("E14-13 · varias tareas de la misma regla son un grupo con su contador", () => {
  const groups = groupTasksByRule([
    auto("a", "MemberLowPackBalance"),
    auto("b", "MemberLowPackBalance"),
    auto("c", "MemberLowPackBalance"),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rule, "lowPackBalance");
  assert.equal(groups[0].label, "Bono acabándose");
  assert.equal(groups[0].tasks.length, 3);
});

test("E14-13 · resolver una suelta baja el contador, porque el contador es lo que queda", () => {
  // No hay estado de grupo que mantener: al desaparecer la tarea cerrada de la
  // consulta, el grupo se recalcula con una menos.
  const quedan = [auto("a", "MemberLowPackBalance"), auto("b", "MemberLowPackBalance")];
  assert.equal(groupTasksByRule(quedan)[0].tasks.length, 2);
  assert.equal(groupTasksByRule(quedan.slice(1))[0].tasks.length, 1);
});

test("E14-13 · lo que encarga una persona no se agrupa nunca", () => {
  // Dos encargos con el mismo texto son dos encargos, no un duplicado.
  const groups = groupTasksByRule([manual("a"), manual("b")]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.rule),
    [null, null]
  );
});

test("E14-13 · una entidad que no es de ninguna regla se queda suelta", () => {
  const groups = groupTasksByRule([auto("a", "Member"), auto("b", "Member")]);
  assert.equal(groups.length, 2);
});

test("E14-13 · el grupo ocupa el sitio de su primera tarea y no reordena la lista", () => {
  const groups = groupTasksByRule([
    auto("a", "MemberLowPackBalance"),
    manual("b"),
    auto("c", "MemberLowPackBalance"),
    auto("d", "MemberFewSessionsScheduled"),
  ]);
  assert.deepEqual(
    groups.map((g) => g.key),
    ["rule:lowPackBalance", "b", "rule:fewSessionsScheduled"]
  );
  assert.deepEqual(
    groups[0].tasks.map((t) => t.id),
    ["a", "c"]
  );
});
