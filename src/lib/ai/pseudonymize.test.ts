import test from "node:test";
import assert from "node:assert/strict";
import { scrubIdentifiers, containsIdentifiers, PSEUDONYMIZATION_NOTICE } from "@/lib/ai/pseudonymize";
import { aiGenerationGate, isAiDpaSigned, AI_DPA_BLOCKED_REASON } from "@/lib/ai/dpa";

/**
 * E3-15 · Filtro de identificadores sobre el texto libre que va a la IA
 * (RB-IA-004), y la condición D-C5: sin DPA firmado, la IA no toca a un socio
 * real.
 */

test("E3-15 · el ejemplo de la historia deja de viajar entero", () => {
  // La frase literal del hallazgo: un nombre en el sujeto y otro detrás de un
  // parentesco. La pantalla prometía que ninguno de los dos salía del centro.
  const nota = "María se queja del hombro desde que su hijo Pablo nació";
  const filtrada = scrubIdentifiers(nota);

  assert.ok(!filtrada.includes("María"), filtrada);
  assert.ok(!filtrada.includes("Pablo"), filtrada);
  assert.match(filtrada, /\[NOMBRE\] se queja del hombro desde que su hijo \[NOMBRE\] nació/);
});

test("E3-15 · DNI, teléfono y email se sustituyen por marcadores", () => {
  const texto = "Contacto: 12345678Z, 612 34 56 78, ana.perez@example.com";
  const filtrada = scrubIdentifiers(texto);

  assert.ok(!filtrada.includes("12345678Z"), filtrada);
  assert.ok(!filtrada.includes("612 34 56 78"), filtrada);
  assert.ok(!filtrada.includes("example.com"), filtrada);
  assert.ok(filtrada.includes("[DNI]") && filtrada.includes("[TELÉFONO]") && filtrada.includes("[EMAIL]"));
});

test("E3-15 · el NIE también, que es el que llevan la mitad de los socios extranjeros", () => {
  assert.equal(scrubIdentifiers("NIE X1234567L"), "NIE [DNI]");
});

test("E3-15 · el nombre del propio socio se borra aunque no sea frecuente", () => {
  const filtrada = scrubIdentifiers("Aitzol arrastra molestia lumbar desde marzo", {
    knownNames: ["Aitzol Etxeberria"],
  });
  assert.ok(!filtrada.includes("Aitzol"), filtrada);
});

test("E3-15 · lo clínico sobrevive al filtro: no vale con borrarlo todo", () => {
  const nota = "Dolor lumbar irradiado a la pierna derecha, 6/10, peor por la mañana. Toma ibuprofeno 600.";
  assert.equal(scrubIdentifiers(nota), nota, "un filtro que se come la nota clínica no sirve de nada");
});

test("E3-15 · una palabra común en minúscula no es un nombre propio", () => {
  // "rosa" y "clara" son nombres de pila Y adjetivos. La mayúscula decide.
  assert.equal(scrubIdentifiers("la piel está rosa y la vista clara"), "la piel está rosa y la vista clara");
  assert.equal(scrubIdentifiers("Rosa entrena los martes"), "[NOMBRE] entrena los martes");
});

test("E3-15 · el filtro es idempotente: los marcadores no se re-filtran", () => {
  const una = scrubIdentifiers("Llamar a Carmen al 600112233");
  assert.equal(scrubIdentifiers(una), una);
});

test("E3-15 · containsIdentifiers delata un texto que todavía lleva algo", () => {
  assert.equal(containsIdentifiers("Sentadilla con talón elevado"), false);
  assert.equal(containsIdentifiers("Escribir a Javier"), true);
});

test("E3-15 · la pantalla no promete más de lo que el filtro hace", () => {
  assert.match(PSEUDONYMIZATION_NOTICE, /automático/i);
  assert.match(PSEUDONYMIZATION_NOTICE, /no sustituye a tu criterio/i);
});

test("E3-15/D-C5 · sin DPA firmado la generación se bloquea para un socio real", () => {
  const previo = process.env.AI_DPA_SIGNED_AT;
  delete process.env.AI_DPA_SIGNED_AT;
  try {
    assert.equal(isAiDpaSigned(), false);

    const real = aiGenerationGate({ slug: "gimnasio-de-verdad" });
    assert.equal(real.allowed, false);
    assert.equal(real.allowed === false && real.reason, AI_DPA_BLOCKED_REASON, "y el motivo se explica");

    // Sobre datos de demostración sí opera: es lo que permite enseñar el producto.
    assert.equal(aiGenerationGate({ slug: "training-zone" }).allowed, true);
  } finally {
    if (previo === undefined) delete process.env.AI_DPA_SIGNED_AT;
    else process.env.AI_DPA_SIGNED_AT = previo;
  }
});

test("E3-15/D-C5 · una fecha de firma futura todavía no es una firma", () => {
  const previo = process.env.AI_DPA_SIGNED_AT;
  process.env.AI_DPA_SIGNED_AT = "2099-01-01";
  try {
    assert.equal(isAiDpaSigned(), false);
    assert.equal(aiGenerationGate({ slug: "gimnasio-de-verdad" }).allowed, false);
  } finally {
    if (previo === undefined) delete process.env.AI_DPA_SIGNED_AT;
    else process.env.AI_DPA_SIGNED_AT = previo;
  }
});

test("E3-15/D-C5 · firmado el DPA, la IA opera con normalidad", () => {
  const previo = process.env.AI_DPA_SIGNED_AT;
  process.env.AI_DPA_SIGNED_AT = "2026-01-01";
  try {
    assert.equal(isAiDpaSigned(), true);
    assert.equal(aiGenerationGate({ slug: "gimnasio-de-verdad" }).allowed, true);
  } finally {
    if (previo === undefined) delete process.env.AI_DPA_SIGNED_AT;
    else process.env.AI_DPA_SIGNED_AT = previo;
  }
});
