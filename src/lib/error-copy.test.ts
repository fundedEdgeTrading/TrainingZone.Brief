import assert from "node:assert/strict";
import { test } from "node:test";

import { messageForError, OFFLINE_MESSAGE, TIMEOUT_MESSAGE, UNEXPECTED_MESSAGE } from "./error-copy";

// E8-01 · escenario "mensaje de red": el texto es el mismo que ya usa
// api/client.ts en la app nativa, para que web y app suenen igual.
test("un fallo de red se traduce al mismo texto que la app nativa", () => {
  assert.equal(messageForError(new TypeError("fetch failed")), OFFLINE_MESSAGE);
  assert.equal(messageForError({ message: "Network request failed" }), OFFLINE_MESSAGE);
  assert.equal(messageForError({ message: "connect ECONNREFUSED 127.0.0.1:5432" }), OFFLINE_MESSAGE);
});

test("un timeout se traduce al texto de espera de la app nativa", () => {
  assert.equal(messageForError({ name: "AbortError", message: "" }), TIMEOUT_MESSAGE);
  assert.equal(messageForError({ name: "TimeoutError" }), TIMEOUT_MESSAGE);
  assert.equal(messageForError({ message: "Request timed out" }), TIMEOUT_MESSAGE);
});

// En producción Next borra el mensaje del error de un Server Component y solo
// deja el digest: el texto genérico es el que se ve casi siempre.
test("un error sin mensaje reconocible cae en el texto genérico", () => {
  assert.equal(messageForError(new Error("")), UNEXPECTED_MESSAGE);
  assert.equal(messageForError({ digest: "1234567890" } as { name?: string }), UNEXPECTED_MESSAGE);
  assert.equal(messageForError(undefined), UNEXPECTED_MESSAGE);
  assert.equal(messageForError(null), UNEXPECTED_MESSAGE);
});

// El timeout gana al fallo de red genérico: "aborted" acompaña a menudo al
// mensaje de red del motor, y esperar es una explicación más útil.
test("el timeout manda cuando el error trae las dos marcas", () => {
  assert.equal(messageForError({ name: "AbortError", message: "fetch failed" }), TIMEOUT_MESSAGE);
});
