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

/**
 * E9-16 · OTA. La historia pide una decisión por escrito, no la dependencia:
 * lo que se comprueba es que la decisión existe, tiene un motivo, y que
 * `expo-updates` sigue sin instalarse — instalarlo sin la política de canal
 * y rollback que PUBLISHING.md exige sería justo el riesgo que la decisión
 * señala.
 */
test("la decisión de OTA está tomada y por escrito, con el porqué", () => {
  const doc = readFileSync(join(ROOT, "PUBLISHING.md"), "utf8");
  expect(doc).toMatch(/OTA.*expo-updates.*decisión/is);
  expect(doc).toMatch(/No entra todavía/);
});

test("expo-updates no está instalado: coherente con la decisión de no entrar todavía", () => {
  const pkg = readJson("package.json") as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  expect(pkg.dependencies?.["expo-updates"]).toBeUndefined();
  expect(pkg.devDependencies?.["expo-updates"]).toBeUndefined();
});
