import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {
  generateMemberBillingToken,
  generateMemberDunningToken,
  verifyMemberBillingToken,
  verifyMemberBillingOrDunningToken,
} from "./email-verification";

/**
 * El enlace de impago vive 72 horas y el de autoservicio 30 minutos. Lo único
 * que hace aceptable esa diferencia es que el propósito va DENTRO de la firma:
 * si un token de 72 horas valiera como token de autoservicio, alargar uno
 * habría alargado el otro por la puerta de atrás. Estos tests son esa frontera.
 */

test("el token de impago NO vale como token de autoservicio", () => {
  const dunning = generateMemberDunningToken("member-1");
  assert.deepEqual(verifyMemberBillingToken(dunning), { ok: false, error: "invalid" });
});

test("la pantalla compartida acepta los dos propósitos", () => {
  assert.deepEqual(verifyMemberBillingOrDunningToken(generateMemberBillingToken("member-1")), {
    ok: true,
    memberId: "member-1",
  });
  assert.deepEqual(verifyMemberBillingOrDunningToken(generateMemberDunningToken("member-2")), {
    ok: true,
    memberId: "member-2",
  });
});

test("un token manipulado se rechaza", () => {
  const token = generateMemberDunningToken("member-1");
  const [payload, mac] = token.split(".");
  // Mismo payload, firma de otro token: sin comprobar el HMAC, cualquiera
  // podría fabricarse el enlace de gestión de pago de otro socio.
  const otro = generateMemberDunningToken("member-2").split(".")[1];
  assert.deepEqual(verifyMemberBillingOrDunningToken(`${payload}.${otro}`), { ok: false, error: "invalid" });

  const payloadAjeno = generateMemberDunningToken("member-2").split(".")[0];
  assert.deepEqual(verifyMemberBillingOrDunningToken(`${payloadAjeno}.${mac}`), { ok: false, error: "invalid" });
});

test("basura no revienta el verificador", () => {
  for (const malo of ["", "sinpunto", "a.b", "....", "eyJhIjoxfQ.firma"]) {
    assert.equal(verifyMemberBillingOrDunningToken(malo).ok, false);
  }
});
