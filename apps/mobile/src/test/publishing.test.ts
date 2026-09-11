import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E9-16 · Identificadores de tienda.
 *
 * `ios.bundleIdentifier` y `android.package` son inmutables tras la primera
 * publicación, y hoy están sin decidir (se preguntó explícitamente y la
 * respuesta fue "no se sabe" para los dos). Este test no comprueba que
 * existan — comprobaría un valor inventado si lo hiciera — sino que:
 *
 *  1. `eas.json` existe con un perfil de producción, que es la parte que SÍ
 *     se puede construir sin conocer el identificador.
 *  2. El bloqueo queda documentado por escrito en vez de resuelto con un
 *     valor de relleno, para que quien retome esto no tenga que
 *     redescubrirlo leyendo `app.json`.
 */

const ROOT = join(__dirname, "../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

test("eas.json declara un perfil de build de producción", () => {
  const eas = readJson("eas.json") as {
    build?: Record<string, unknown>;
    submit?: Record<string, unknown>;
  };
  expect(eas.build).toHaveProperty("production");
  expect(eas.submit).toHaveProperty("production");
});

test("app.json no lleva un bundleIdentifier ni un package inventados", () => {
  const app = readJson("app.json") as {
    expo: { ios?: { bundleIdentifier?: string }; android?: { package?: string } };
  };
  // Si algún día esto falla porque alguien rellenó los identificadores reales,
  // es la señal correcta de que PUBLISHING.md §1 puede darse por resuelto y
  // este test (no el valor) es el que hay que actualizar.
  expect(app.expo.ios?.bundleIdentifier).toBeUndefined();
  expect(app.expo.android?.package).toBeUndefined();
});

test("PUBLISHING.md documenta el bloqueo y cómo resolverlo", () => {
  const doc = readFileSync(join(ROOT, "PUBLISHING.md"), "utf8");
  expect(doc).toMatch(/bundleIdentifier/);
  expect(doc).toMatch(/android\.package/);
  expect(doc).toMatch(/no se sabe/);
});
