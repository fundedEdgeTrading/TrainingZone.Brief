import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  AMBASSADOR_STATES,
  buildReferralCode,
  canBeAmbassador,
  isWellFormedReferralCode,
  REFERRAL_LEAD_CHANNEL,
  REFERRAL_STATE_LABEL,
  REFERRAL_STATES,
  referralLinkPath,
  referralLinkUrl,
  referralStateOf,
} from "@/lib/referral-program";
// `randomCodeSuffix` usa `node:crypto` y por eso se queda del lado servidor.
import { randomCodeSuffix } from "@/lib/referrals";

/**
 * R1 · El enlace y la DERIVACIÓN del estado. Todo esto es lógica pura y se
 * prueba sin base de datos, que es justamente lo que permite que el estado del
 * referido no tenga columna: si hiciera falta sembrar para comprobarlo, sería
 * porque se está guardando en algún sitio.
 */

/* ------------------------------------------------------------------------- *
 * E14-31 · invitado → valoración hecha → alta, en una sola función
 * ------------------------------------------------------------------------- */

test("un lead recién entrado por el enlace es un invitado", () => {
  assert.equal(referralStateOf({ status: "SIN_CONTACTAR", convertedMemberId: null }), "INVITADO");
  assert.equal(referralStateOf({ status: "SEGUIMIENTO", convertedMemberId: null }), "INVITADO");
});

test("un lead con fecha de valoración YA es «valoración hecha»: no hace falta otra columna", () => {
  assert.equal(referralStateOf({ status: "CON_FECHA_VALORACION", convertedMemberId: null }), "VALORACION_HECHA");
});

test("«alta» exige las dos cosas: lead CERRADO y su socio creado", () => {
  assert.equal(referralStateOf({ status: "CERRADO", convertedMemberId: "m1" }), "ALTA");
});

test("el alta EN CURSO no es un alta: el socio existe pero el cobro puede caerse", () => {
  // `initiateLeadConversion` escribe `convertedMemberId` y deja el lead en
  // SEGUIMIENTO; `confirmLeadClosureForMember` lo cierra al cobrar, y
  // `revertLeadClosureForFailedPayment` existe porque eso se cae a veces.
  // Liberar aquí la recompensa sería pagar por un alta que no llegó a serlo.
  assert.equal(referralStateOf({ status: "SEGUIMIENTO", convertedMemberId: "m1" }), "VALORACION_HECHA");
});

test("un lead no cerrado es un desenlace, no un invitado que sigue vivo", () => {
  assert.equal(referralStateOf({ status: "NO_CERRADO", convertedMemberId: null }), "DESCARTADO");
});

test("un CERRADO sin socio no es un alta: no hay a quién dar de alta", () => {
  assert.equal(referralStateOf({ status: "CERRADO", convertedMemberId: null }), "VALORACION_HECHA");
});

test("los cuatro estados tienen rótulo y están en el orden del embudo", () => {
  assert.equal(REFERRAL_STATES.length, 4);
  for (const state of REFERRAL_STATES) {
    assert.ok(REFERRAL_STATE_LABEL[state], `${state} sin rótulo`);
  }
  assert.deepEqual(REFERRAL_STATES.slice(0, 3), ["INVITADO", "VALORACION_HECHA", "ALTA"]);
});

/* ------------------------------------------------------------------------- *
 * E14-30 · el código y su enlace
 * ------------------------------------------------------------------------- */

test("el código lleva el nombre de quien invita, normalizado con la regla de coupon-code", () => {
  assert.equal(buildReferralCode("Ana", "K7M3P"), "ANA-K7M3P");
  // Sin acentos y sin espacios: la misma regla que ya decide qué es un código
  // válido en esta casa.
  assert.equal(buildReferralCode("Iría", "K7M3P"), "IRIA-K7M3P");
  assert.equal(buildReferralCode("José Luis", "K7M3P"), "JOSELUIS-K7M3P");
});

test("un nombre que no deja letras utilizables no rompe el código: se queda el sufijo", () => {
  assert.equal(buildReferralCode("...", "K7M3P"), "K7M3P");
  assert.equal(buildReferralCode("", "K7M3P"), "K7M3P");
});

test("el nombre se recorta a diez letras: el código se dicta por teléfono", () => {
  assert.equal(buildReferralCode("Maximiliano", "K7M3P"), "MAXIMILIAN-K7M3P");
});

test("el sufijo no usa caracteres que se confundan al teclearlos", () => {
  assert.equal(randomCodeSuffix(() => 0).length, 5);
  // Recorrido completo del alfabeto: ninguno de los ambiguos aparece.
  let alphabet = "";
  for (let i = 0; i < 30; i++) alphabet += randomCodeSuffix(() => i)[0];
  for (const forbidden of ["0", "O", "1", "I", "L", "U"]) {
    assert.ok(!alphabet.includes(forbidden), `el alfabeto no debería incluir «${forbidden}»`);
  }
});

test("lo que /r/[code] acepta como código", () => {
  assert.ok(isWellFormedReferralCode("ANA-K7M3P"));
  assert.ok(isWellFormedReferralCode("ana-k7m3p"), "se normaliza antes de comprobar");
  assert.ok(!isWellFormedReferralCode("AB"), "demasiado corto");
  assert.ok(!isWellFormedReferralCode("ANA/../etc/passwd"));
  assert.ok(!isWellFormedReferralCode("A".repeat(41)), "demasiado largo");
});

test("hay UN enlace, y es el mismo para la web y para la app", () => {
  assert.equal(referralLinkPath("ANA-K7M3P"), "/r/ANA-K7M3P");
  assert.equal(referralLinkUrl("https://trainingzone.es", "ANA-K7M3P"), "https://trainingzone.es/r/ANA-K7M3P");
  // Una barra de más en el origen no duplica la barra del enlace.
  assert.equal(referralLinkUrl("https://trainingzone.es/", "ANA-K7M3P"), "https://trainingzone.es/r/ANA-K7M3P");
});

test("el canal es texto y es «Referido»: no hace falta tabla ni enum (RB-LEAD-004)", () => {
  assert.equal(REFERRAL_LEAD_CHANNEL, "Referido");
});

/* ------------------------------------------------------------------------- *
 * Antifraude 3 · quién puede invitar
 * ------------------------------------------------------------------------- */

test("un excliente no invita a nadie; un congelado y un moroso sí", () => {
  assert.equal(canBeAmbassador("CANCELLED"), false);
  assert.equal(canBeAmbassador("PROSPECT"), false);
  assert.equal(canBeAmbassador("ACTIVE"), true);
  // Estar de vacaciones o tener un recibo devuelto no es motivo para quitarle
  // el enlace a nadie.
  assert.equal(canBeAmbassador("FROZEN"), true);
  assert.equal(canBeAmbassador("DELINQUENT"), true);
  assert.ok(!AMBASSADOR_STATES.includes("CANCELLED"));
});
