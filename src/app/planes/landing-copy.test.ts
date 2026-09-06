import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E6-05 · "Cero comisión sobre tus cobros" es el mejor argumento de venta
 * contra MindBody y Glofox, y tiene que ser cierto: Apta no puede cobrar
 * `application_fee_amount` sobre el dinero del gimnasio en ningún sitio del
 * código, o el mensaje de la landing sería publicidad engañosa.
 */

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

test("E6-05 · el mensaje aparece en /planes con esas palabras", () => {
  const hero = readFileSync(join("src", "app", "planes", "hero.tsx"), "utf8");
  const page = readFileSync(join("src", "app", "planes", "page.tsx"), "utf8");
  assert.ok(
    hero.includes("Cero comisión sobre tus cobros") || page.includes("Cero comisión sobre tus cobros"),
    "el hero o la tabla comparativa de /planes tienen que decir exactamente esa frase"
  );
});

test("E6-05 · nadie cobra application_fee_amount sobre el dinero del gimnasio", () => {
  const offenders = sourceFiles("src").filter((file) => readFileSync(file, "utf8").includes("application_fee_amount"));
  assert.deepEqual(offenders, [], `Se encontró application_fee_amount en: ${offenders.join(", ")}`);
});
