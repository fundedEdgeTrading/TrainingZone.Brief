import test from "node:test";
import assert from "node:assert/strict";
import { coversSessionKind } from "@/lib/member-session-scope";

/**
 * E1-05 / RB-SEG-003. El criterio del selector "Socio" de la agenda y el de la
 * escritura son ahora el mismo, y es este: bono ACTIVE de la modalidad de la
 * sesión en el centro que la imparte.
 *
 * El acotado por CENTRO lo hace la consulta (`subscriptions: { where: { status:
 * "ACTIVE", centerId } }`, en `listMembersBookableInCenter` y en
 * `isMemberBookableInCenter`): lo que llega aquí ya son los bonos de ese
 * centro. Lo que se prueba es la otra mitad, la modalidad — y que un socio sin
 * bono en el centro llegue con la lista vacía y se quede fuera, que es
 * exactamente lo que le pasaba a los 34 socios del tercer centro.
 */

const EP = { plan: { type: "PERSONAL_TRAINING" } };
const GROUP = { plan: { type: "SESSION_PACK" } };

test("sin bono en ese centro, la lista llega vacía y el socio no se ofrece", () => {
  // Es el caso del socio de otro centro: la consulta filtra por `centerId`, así
  // que sus bonos no entran y no queda nada que cubra la sesión.
  assert.equal(coversSessionKind([], "EP"), false);
  assert.equal(coversSessionKind([], "GROUP"), false);
});

test("el bono tiene que ser de la modalidad de la sesión", () => {
  assert.equal(coversSessionKind([EP], "EP"), true);
  assert.equal(coversSessionKind([EP], "GROUP"), false, "un bono de EP no da plaza en un grupo reducido");
  assert.equal(coversSessionKind([GROUP], "GROUP"), true);
  assert.equal(coversSessionKind([GROUP], "EP"), false);
});

test("con varios bonos en el centro basta con que uno cubra la modalidad", () => {
  // RB-AGENDA-003: un socio puede tener bono de EP y de grupos a la vez.
  assert.equal(coversSessionKind([GROUP, EP], "EP"), true);
  assert.equal(coversSessionKind([GROUP, EP], "GROUP"), true);
});

test("un tipo de plan que no es ni EP ni grupos no da plaza en ninguna sesión", () => {
  const online = { plan: { type: "ONLINE" } };
  assert.equal(coversSessionKind([online], "EP"), false);
  assert.equal(coversSessionKind([online], "GROUP"), false);
});
