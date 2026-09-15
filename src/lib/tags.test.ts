import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTOMATIC_TAG_DESCRIPTION,
  AUTOMATIC_TAG_KEYS,
  AUTOMATIC_TAG_LABEL,
  AUTOMATIC_TAG_TONE,
  MANUAL_SEED_TAGS,
  canEditTagByHand,
  isAutomaticTagKey,
  tagKeyFromLabel,
  toneOf,
} from "./tags";

test("las nueve automáticas tienen rótulo, definición en texto llano y color", () => {
  assert.equal(AUTOMATIC_TAG_KEYS.length, 9);
  for (const key of AUTOMATIC_TAG_KEYS) {
    assert.ok(AUTOMATIC_TAG_LABEL[key], `${key} sin rótulo`);
    // La definición es lo que se enseña en `/etiquetas`: una regla que nadie
    // puede leer es una regla en la que nadie confía (mismo criterio que E3-04).
    assert.ok(AUTOMATIC_TAG_DESCRIPTION[key]?.length > 20, `${key} sin definición legible`);
    assert.ok(AUTOMATIC_TAG_TONE[key], `${key} sin color`);
  }
});

test("una automática no se puede tocar a mano; una manual sí", () => {
  assert.equal(canEditTagByHand("AUTOMATIC"), false);
  assert.equal(canEditTagByHand("MANUAL"), true);
});

test("isAutomaticTagKey distingue las del sistema de las del centro", () => {
  assert.ok(isAutomaticTagKey("dos_semanas_sin_venir"));
  assert.ok(!isAutomaticTagKey("embajador"));
  assert.ok(!isAutomaticTagKey("lo_que_sea"));
});

test("la clave de una manual sale del rótulo, sin acentos ni espacios", () => {
  assert.equal(tagKeyFromLabel("Lesión activa"), "lesion_activa");
  assert.equal(tagKeyFromLabel("  Reto de verano 2026 "), "reto_de_verano_2026");
  assert.equal(tagKeyFromLabel("¡¡¡"), "");
});

test("las dos manuales de salida no chocan con ninguna automática", () => {
  for (const seed of MANUAL_SEED_TAGS) {
    assert.equal(seed.key, tagKeyFromLabel(seed.label));
    assert.ok(!isAutomaticTagKey(seed.key), `${seed.key} pisa una automática`);
  }
});

test("un color desconocido cae al neutro en vez de romper la píldora", () => {
  assert.equal(toneOf("critical"), "critical");
  assert.equal(toneOf(null), "neutral");
  assert.equal(toneOf("rojo-de-la-marca"), "neutral");
  assert.equal(toneOf(undefined, "gold"), "gold");
});
