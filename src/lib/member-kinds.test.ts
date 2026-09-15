import test from "node:test";
import assert from "node:assert/strict";
import type { MemberState } from "@prisma/client";

import {
  MEMBER_GROUP_LABEL,
  MEMBER_GROUP_ORDER,
  MEMBER_KIND_GROUP,
  MEMBER_KIND_LABEL,
  MEMBER_KIND_ORDER,
  MEMBER_KIND_STATES,
  kindsInGroup,
  memberKindOf,
  statesForKinds,
  type MemberKind,
} from "./member-kinds";
// El módulo de escritura los reexporta: el lado servidor sigue importando de un
// solo sitio, y esta prueba fija que esa reexportación no se caiga.
import * as lifecycle from "./member-lifecycle";

/**
 * E14-15 · Los cuatro tipos son UNA definición compartida por el filtro, la
 * columna y la agrupación. Lo que fija esta batería es que congelado y
 * suspendido se puedan LEER juntos sin dejar de ser dos por dentro: si alguien
 * vuelve a fusionarlos, la lista de morosos vuelve a incluir a quien está de
 * vacaciones (HU-ST-14) y esto se pone rojo.
 */

const ALL_STATES: MemberState[] = ["PROSPECT", "TRIAL", "ACTIVE", "DELINQUENT", "FROZEN", "CANCELLED"];

test("los cuatro tipos salen de los cuatro estados, uno a uno", () => {
  assert.equal(memberKindOf("ACTIVE"), "CLIENTE");
  assert.equal(memberKindOf("FROZEN"), "CONGELADO");
  assert.equal(memberKindOf("DELINQUENT"), "SUSPENDIDO");
  assert.equal(memberKindOf("CANCELLED"), "EXCLIENTE");
});

test("congelado y suspendido son DOS tipos, no uno", () => {
  assert.notEqual(memberKindOf("FROZEN"), memberKindOf("DELINQUENT"));
  assert.deepEqual(MEMBER_KIND_STATES.CONGELADO, ["FROZEN"]);
  assert.deepEqual(MEMBER_KIND_STATES.SUSPENDIDO, ["DELINQUENT"]);
});

test("prospecto y prueba no se pierden: caen en captación", () => {
  assert.equal(memberKindOf("PROSPECT"), "EN_CAPTACION");
  assert.equal(memberKindOf("TRIAL"), "EN_CAPTACION");
});

test("acepta la fila entera del socio, no solo el estado", () => {
  assert.equal(memberKindOf({ state: "CANCELLED" }), "EXCLIENTE");
});

test("todo estado de MemberState cae en un tipo y en uno solo", () => {
  for (const state of ALL_STATES) {
    const kind = memberKindOf(state);
    const owners = MEMBER_KIND_ORDER.filter((k) => MEMBER_KIND_STATES[k].includes(state));
    assert.deepEqual(owners, [kind], `${state} tiene ${owners.length} dueños`);
  }
});

test("los estados de los tipos cubren MemberState entero", () => {
  const covered = MEMBER_KIND_ORDER.flatMap((k) => MEMBER_KIND_STATES[k]).sort();
  assert.deepEqual(covered, [...ALL_STATES].sort());
});

test("cada tipo tiene rótulo y sitio en el orden de lectura", () => {
  const kinds = Object.keys(MEMBER_KIND_LABEL) as MemberKind[];
  assert.deepEqual([...kinds].sort(), [...MEMBER_KIND_ORDER].sort());
});

test("la agrupación de pantalla junta congelado y suspendido bajo un rótulo", () => {
  assert.equal(MEMBER_KIND_GROUP.CONGELADO, "EN_PAUSA");
  assert.equal(MEMBER_KIND_GROUP.SUSPENDIDO, "EN_PAUSA");
  assert.deepEqual(kindsInGroup("EN_PAUSA"), ["CONGELADO", "SUSPENDIDO"]);
  assert.equal(MEMBER_GROUP_LABEL.EN_PAUSA, "En pausa");
});

test("el rótulo agrupado NO borra la diferencia: sigue habiendo dos filtros", () => {
  // El flujo de impago pregunta por SUSPENDIDO y tiene que salirle solo el que
  // debe dinero, aunque la tabla los pinte juntos.
  assert.deepEqual(statesForKinds(["SUSPENDIDO"]), ["DELINQUENT"]);
  assert.deepEqual(statesForKinds(["CONGELADO"]), ["FROZEN"]);
  assert.deepEqual(statesForKinds(kindsInGroup("EN_PAUSA")), ["FROZEN", "DELINQUENT"]);
});

test("cada grupo tiene rótulo y ningún tipo queda sin grupo", () => {
  for (const kind of MEMBER_KIND_ORDER) {
    const group = MEMBER_KIND_GROUP[kind];
    assert.ok(MEMBER_GROUP_ORDER.includes(group), `${kind} apunta a un grupo que no está en el orden`);
    assert.ok(MEMBER_GROUP_LABEL[group], `${group} no tiene rótulo`);
  }
});

test("una selección vacía de tipos no filtra nada", () => {
  assert.deepEqual(statesForKinds([]), []);
});

test("member-lifecycle.ts reexporta los tipos: un solo sitio para el servidor", () => {
  assert.equal(lifecycle.memberKindOf("FROZEN"), "CONGELADO");
  assert.equal(lifecycle.MEMBER_KIND_LABEL.EXCLIENTE, "Excliente");
});
