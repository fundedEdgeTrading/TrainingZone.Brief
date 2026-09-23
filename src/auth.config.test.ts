import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PROD-07 · el proveedor Credentials es el login de verdad (email y
 * contraseña de cada identidad), no un "usuario demo". El rótulo sale en las
 * pantallas por defecto de Auth.js y en sus errores; en producción no puede
 * decir "demo".
 *
 * El `id` técnico ("demo") NO se cambia aquí: forma parte de la URL de
 * callback (`/api/auth/callback/demo`) y del `signIn("demo", …)` del
 * formulario. Solo textos.
 *
 * Por código fuente: importar la configuración arrastra Prisma y Auth.js.
 */
const SOURCE = readFileSync(join("src", "auth.config.ts"), "utf8");

test("PROD-07 · el proveedor Credentials se rotula «Email y contraseña»", () => {
  const credentials = SOURCE.slice(SOURCE.indexOf("Credentials({"));
  assert.match(credentials, /name: "Email y contraseña"/);
  assert.doesNotMatch(SOURCE, /name: "Usuario demo"/);
});

test("PROD-07 · el id técnico del proveedor no cambia (URL de callback y signIn del formulario)", () => {
  assert.match(SOURCE, /id: "demo"/);
});
