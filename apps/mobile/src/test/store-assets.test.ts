import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E9-16 · Guion de capturas.
 *
 * No hay simulador en esta sesión, así que no hay capturas reales que
 * probar — lo único que se puede comprobar automáticamente es que el guion
 * y las carpetas que lo reciben existen y no se desincronizan del mínimo que
 * pide la historia (6 a 8 por plataforma).
 */

const STORE_DIR = join(__dirname, "../../assets/store");

test("el README del guion de capturas existe y documenta el rango 6-8", () => {
  const readme = readFileSync(join(STORE_DIR, "README.md"), "utf8");
  expect(readme).toMatch(/6 a 8/);
  expect(readme).toMatch(/Este paso es manual y queda pendiente/);
});

test("el guion trae exactamente 6 pantallas hoy, dentro del rango 6-8", () => {
  const readme = readFileSync(join(STORE_DIR, "README.md"), "utf8");
  const rows = readme.split("\n").filter((line) => /^\|\s*\d+\s*\|/.test(line));
  expect(rows.length).toBeGreaterThanOrEqual(6);
  expect(rows.length).toBeLessThanOrEqual(8);
});

test("las carpetas de tamaño obligatorio existen, listas para recibir capturas", () => {
  const required = [
    "ios/6.9-iphone-1320x2868",
    "ios/5.5-iphone-1242x2208",
    "android/phone-1080x1920",
    "android/feature-graphic-1024x500",
  ];
  for (const dir of required) {
    expect(existsSync(join(STORE_DIR, dir))).toBe(true);
  }
});
