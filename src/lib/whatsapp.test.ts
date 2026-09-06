import test from "node:test";
import assert from "node:assert/strict";
import { buildWhatsappLink, spanishWhatsappDigits } from "@/lib/whatsapp";

/**
 * E12-17 · wa.me con mensaje pre-escrito, solo España (D-P3): un móvil
 * español de 9 dígitos se antepone con 34; sin teléfono, no hay enlace.
 */

test("E12-17 · un móvil español de 9 dígitos se antepone con el prefijo del país", () => {
  assert.equal(spanishWhatsappDigits("612345678"), "34612345678");
  assert.equal(spanishWhatsappDigits("612 34 56 78"), "34612345678");
  assert.equal(spanishWhatsappDigits("+34 612 345 678"), "34612345678");
});

test("E12-17 · sin teléfono, no hay enlace", () => {
  assert.equal(spanishWhatsappDigits(null), null);
  assert.equal(spanishWhatsappDigits(""), null);
  const link = buildWhatsappLink(null, "Hola");
  assert.equal(link.ok, false);
});

test("E12-17 · el enlace lleva el mensaje pre-redactado codificado", () => {
  const link = buildWhatsappLink("612345678", "Hola Ana, ¿todo bien?");
  assert.equal(link.ok, true);
  if (!link.ok) return;
  assert.equal(link.url, "https://wa.me/34612345678?text=Hola%20Ana%2C%20%C2%BFtodo%20bien%3F");
});
