import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCodeValidityRule,
  assessExMemberRule,
  assessRepeatRule,
  combineVerdicts,
  daysBetween,
  MS_PER_DAY,
  rewardAmountLabel,
  validateProgramInput,
  type PriorMemberFacts,
  type SaveProgramInput,
} from "@/lib/referral-program";

/**
 * E14-33 · Las TRES reglas antifraude, con los casos sucios dentro.
 *
 * Son lógica pura a propósito: la decisión de si una recompensa se paga, se
 * bloquea o va a revisión humana no puede depender de sembrar una base de
 * datos para comprobarla. Lo que aquí se prueba es exactamente lo que decide
 * dinero.
 */

const NOW = new Date("2026-09-16T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * MS_PER_DAY);

function prior(over: Partial<PriorMemberFacts> = {}): PriorMemberFacts {
  return {
    id: "m-prior",
    state: "CANCELLED",
    cancelledAt: null,
    externalRef: null,
    externalSource: null,
    lastAccessAt: null,
    accountCreatedAt: null,
    ...over,
  };
}

/* ========================================================================= *
 * ANTIFRAUDE 1 · el excliente reciente
 * ========================================================================= */

test("quien no tiene ficha previa en la casa es un alta nueva de verdad", () => {
  assert.deepEqual(assessExMemberRule({ now: NOW, cooldownDays: 180, prior: null }), {
    decision: "ALLOW",
    reason: null,
  });
});

test("EL CASO SUCIO · excliente de cinco meses y veintinueve días, con la ventana en 180 días", () => {
  // Cinco meses y veintinueve días antes del 16-09-2026 es el 17-03-2026: 183
  // días. Y 183 NO es "menos de 180". Esto no es un fallo de la regla, es lo
  // que de verdad significa configurar la ventana en DÍAS: 180 días caen a
  // mediados de marzo, no en "hace seis meses de calendario". Queda escrito
  // aquí para que nadie lo descubra el día que tenga que explicar un pago.
  const leftOn = new Date("2026-03-17T12:00:00.000Z");
  assert.equal(daysBetween(leftOn, NOW), 183);
  assert.equal(assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ cancelledAt: leftOn }) }).decision, "ALLOW");

  // El mismo excliente, en un centro que quiso decir SEIS MESES DE CALENDARIO y
  // configuró la ventana en consecuencia: no cuenta.
  const verdict = assessExMemberRule({ now: NOW, cooldownDays: 184, prior: prior({ cancelledAt: leftOn }) });
  assert.equal(verdict.decision, "BLOCK");
  assert.match(verdict.reason ?? "", /183 días/);
});

test("el borde de la ventana: 179 días no cuenta, 180 sí", () => {
  assert.equal(
    assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ cancelledAt: daysAgo(179) }) }).decision,
    "BLOCK"
  );
  // "menos de la ventana" es estrictamente menos: el día 180 ya está fuera.
  assert.equal(
    assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ cancelledAt: daysAgo(180) }) }).decision,
    "ALLOW"
  );
});

test("la ventana es del CENTRO, no un literal de seis meses en el código", () => {
  const leftOn = daysAgo(60);
  assert.equal(assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ cancelledAt: leftOn }) }).decision, "BLOCK");
  assert.equal(assessExMemberRule({ now: NOW, cooldownDays: 30, prior: prior({ cancelledAt: leftOn }) }).decision, "ALLOW");
});

test("EL CASO SUCIO · socio IMPORTADO sin cancelledAt: revisión humana, no se deja pasar", () => {
  const verdict = assessExMemberRule({
    now: NOW,
    cooldownDays: 180,
    prior: prior({
      cancelledAt: null,
      externalRef: "mw-99887",
      externalSource: "mywellness",
      lastAccessAt: new Date("2024-02-11T00:00:00.000Z"),
      accountCreatedAt: new Date("2019-05-03T00:00:00.000Z"),
    }),
  });
  assert.equal(verdict.decision, "REVIEW", "sobre un hueco no se automatiza una decisión que reparte dinero");
  // El motivo lleva las PISTAS que necesita quien decide, pero ninguna de ellas
  // decide por su cuenta: "hace mucho que no entra" no es "se fue hace mucho".
  assert.match(verdict.reason ?? "", /mywellness/);
  assert.match(verdict.reason ?? "", /mw-99887/);
  assert.match(verdict.reason ?? "", /2024-02-11/);
  assert.match(verdict.reason ?? "", /180/);
});

test("un excliente NO importado y sin fecha de baja también va a revisión", () => {
  const verdict = assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ cancelledAt: null }) });
  assert.equal(verdict.decision, "REVIEW");
});

test("si la persona sigue siendo socia, esto no es un alta nueva de nadie", () => {
  for (const state of ["ACTIVE", "FROZEN", "DELINQUENT", "TRIAL"] as const) {
    const verdict = assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ state }) });
    assert.equal(verdict.decision, "BLOCK", `${state} debería bloquear`);
  }
});

test("el que se fue y volvió tampoco: reactivar limpia cancelledAt y lo deja ACTIVE", () => {
  // `reactivateMember` borra `cancelledAt` al volver. Sin la regla de "ya hay
  // ficha activa", ese hueco se leería como "excliente sin fecha" y acabaría en
  // revisión humana una y otra vez.
  const verdict = assessExMemberRule({ now: NOW, cooldownDays: 180, prior: prior({ state: "ACTIVE", cancelledAt: null }) });
  assert.equal(verdict.decision, "BLOCK");
});

/* ========================================================================= *
 * ANTIFRAUDE 2 · una recompensa por alta
 * ========================================================================= */

test("ni dos por el mismo referido", () => {
  assert.equal(assessRepeatRule({ rewardsForThisLead: 1, rewardsForThisPerson: 1 }).decision, "BLOCK");
});

test("EL CASO SUCIO · ni por un referido que se da de baja y vuelve", () => {
  // Al volver hay un LEAD NUEVO, con id nuevo: el `@@unique([leadId, beneficiary])`
  // no ve que detrás está la misma persona. Por eso se cuenta por PERSONA.
  const verdict = assessRepeatRule({ rewardsForThisLead: 0, rewardsForThisPerson: 1 });
  assert.equal(verdict.decision, "BLOCK");
  assert.match(verdict.reason ?? "", /persona/);
});

test("un referido nuevo de verdad no choca con nada", () => {
  assert.equal(assessRepeatRule({ rewardsForThisLead: 0, rewardsForThisPerson: 0 }).decision, "ALLOW");
});

/* ========================================================================= *
 * ANTIFRAUDE 3 · el código caduca con la baja
 * ========================================================================= */

test("un código ya caducado el día en que se usó no genera recompensa", () => {
  const verdict = assessCodeValidityRule({
    usedLink: true,
    leadCreatedAt: daysAgo(10),
    codeRevokedAt: daysAgo(40),
    referrerState: "CANCELLED",
  });
  assert.equal(verdict.decision, "BLOCK");
  assert.match(verdict.reason ?? "", /caducado/);
});

test("si el socio se fue DESPUÉS de traer al amigo, no es fraude: lo mira una persona", () => {
  const verdict = assessCodeValidityRule({
    usedLink: true,
    leadCreatedAt: daysAgo(60),
    codeRevokedAt: daysAgo(10),
    referrerState: "CANCELLED",
  });
  assert.equal(verdict.decision, "REVIEW");
});

test("un embajador vivo, con su código vivo, no levanta nada", () => {
  for (const state of ["ACTIVE", "FROZEN", "DELINQUENT"] as const) {
    assert.equal(
      assessCodeValidityRule({ usedLink: true, leadCreatedAt: daysAgo(30), codeRevokedAt: null, referrerState: state })
        .decision,
      "ALLOW"
    );
  }
});

test("un referido apuntado a mano en recepción no tiene código que caducar", () => {
  assert.equal(
    assessCodeValidityRule({
      usedLink: false,
      leadCreatedAt: daysAgo(30),
      codeRevokedAt: daysAgo(40),
      referrerState: "ACTIVE",
    }).decision,
    "ALLOW"
  );
});

/* ========================================================================= *
 * El veredicto conjunto
 * ========================================================================= */

test("gana la decisión más restrictiva, y los motivos que empatan se acumulan", () => {
  const verdict = combineVerdicts([
    { decision: "ALLOW", reason: null },
    { decision: "REVIEW", reason: "hueco A" },
    { decision: "REVIEW", reason: "hueco B" },
  ]);
  assert.equal(verdict.decision, "REVIEW");
  assert.equal(verdict.reason, "hueco A · hueco B");

  const blocked = combineVerdicts([
    { decision: "REVIEW", reason: "hueco" },
    { decision: "BLOCK", reason: "excliente reciente" },
  ]);
  assert.equal(blocked.decision, "BLOCK");
  assert.equal(blocked.reason, "excliente reciente", "un BLOCK no arrastra los motivos del REVIEW");
});

test("tres ALLOW son un ALLOW sin motivo", () => {
  assert.deepEqual(combineVerdicts([{ decision: "ALLOW", reason: null }]), { decision: "ALLOW", reason: null });
});

/* ========================================================================= *
 * La configuración por centro
 * ========================================================================= */

function program(over: Partial<SaveProgramInput> = {}): SaveProgramInput {
  return {
    active: true,
    referrerKind: "FIXED_AMOUNT",
    referrerAmountCents: 2000,
    referrerSessions: null,
    referredKind: null,
    referredAmountCents: null,
    referredSessions: null,
    exMemberCooldownDays: 180,
    ...over,
  };
}

test("importe fijo O sesiones sueltas, y el lado que falta se dice", () => {
  assert.equal(validateProgramInput(program()).ok, true);
  assert.equal(validateProgramInput(program({ referrerAmountCents: null })).ok, false);
  assert.equal(
    validateProgramInput(program({ referrerKind: "FREE_SESSIONS", referrerSessions: 2, referrerAmountCents: null })).ok,
    true
  );
  assert.equal(validateProgramInput(program({ referrerKind: "FREE_SESSIONS", referrerSessions: null })).ok, false);
});

test("a doble cara, el lado de quien entra se valida igual", () => {
  assert.equal(validateProgramInput(program({ referredKind: "FIXED_AMOUNT", referredAmountCents: 1500 })).ok, true);
  assert.equal(validateProgramInput(program({ referredKind: "FIXED_AMOUNT", referredAmountCents: null })).ok, false);
});

test("la ventana del excliente son días completos y no puede ser negativa", () => {
  assert.equal(validateProgramInput(program({ exMemberCooldownDays: 0 })).ok, true);
  assert.equal(validateProgramInput(program({ exMemberCooldownDays: -1 })).ok, false);
  assert.equal(validateProgramInput(program({ exMemberCooldownDays: 90.5 })).ok, false);
});

test("el rótulo de la recompensa dice euros o sesiones, nunca las dos", () => {
  assert.match(rewardAmountLabel({ kind: "FIXED_AMOUNT", amountCents: 2000, sessions: null }), /20/);
  assert.equal(rewardAmountLabel({ kind: "FREE_SESSIONS", amountCents: null, sessions: 1 }), "1 sesión suelta");
  assert.equal(rewardAmountLabel({ kind: "FREE_SESSIONS", amountCents: null, sessions: 3 }), "3 sesiones sueltas");
});
