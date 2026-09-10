/**
 * Candado: en `src/app/` solo hay rutas.
 *
 * `src/app/` es la raíz de expo-router, y su `require.context`
 * (`node_modules/expo-router/_ctx.ios.js`) mete en el bundle de la app TODO
 * fichero `.ts`/`.tsx` que cuelgue de ahí, sin excluir tests ni ayudantes.
 * Un `*.test.tsx` colocado dentro no falla en CI —jest lo ejecuta igual—:
 * falla al ARRANCAR LA APP, con un "Unable to resolve module
 * @testing-library/react-native" en pantalla roja, porque Metro intenta
 * empaquetar la dependencia de desarrollo que importa el test.
 *
 * Las pruebas de pantalla viven en `src/test/app/`, con la misma estructura de
 * rutas, e importan la pantalla por alias (`@/app/(tabs)/agenda`).
 *
 * Sobre los `jest.requireActual` y el `declare`: el tsconfig de la app declara
 * `types: ["jest"]` a propósito —el código de la app no corre en Node y no
 * debe ver sus globales—, así que este fichero se trae `fs` y `path` por la
 * puerta de jest en vez de con un `import` que `tsc` no sabría resolver.
 */
declare const __dirname: string;

type Dirent = { name: string; isDirectory: () => boolean };
const { readdirSync } = jest.requireActual("fs") as {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Dirent[];
};
const { join } = jest.requireActual("path") as {
  join: (...parts: string[]) => string;
};

const APP_ROOT = join(__dirname, "..", "app");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("src/app/ es la raíz de expo-router", () => {
  it("no contiene ficheros de prueba: se empaquetarían dentro de la app", () => {
    const offenders = walk(APP_ROOT)
      .filter((file) => /\.(test|spec)\.[jt]sx?$/.test(file))
      .map((file) => file.slice(APP_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
