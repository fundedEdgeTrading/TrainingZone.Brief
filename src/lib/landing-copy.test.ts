import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * E9-13 · Reseñas inventadas con nombre y cargo.
 *
 * Es la única historia de la épica que no es de posicionamiento: publicar
 * testimonios atribuidos a personas y empresas que no existen incumple la Ley
 * 3/1991 tras la Directiva Ómnibus. El test la vigila desde el fichero porque
 * la tentación de "poner unos ejemplos mientras llegan los reales" vuelve sola.
 */

const SOURCE = readFileSync("src/app/planes/testimonials.tsx", "utf8");
// Los comentarios explican qué había antes y por qué se quitó: se miran solo
// las instrucciones y el texto que se pinta.
const TESTIMONIALS = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no quedan nombres, cargos ni empresas inventadas", () => {
  for (const invented of ["Marta Osuna", "Iñaki Etxeberria", "Laura Prado", "Vértice Studio", "Pulso Fitness", "Box Cardal"]) {
    assert.ok(!TESTIMONIALS.includes(invented), `sigue habiendo una atribución inventada: ${invented}`);
  }
  // `figcaption` es lo que atribuye una cita a alguien. Sin atribución no hace
  // falta, y su vuelta sería la señal de que alguien ha reintroducido nombres.
  assert.ok(!TESTIMONIALS.includes("figcaption"), "una cita atribuida ha vuelto a la landing");
});

test("el rótulo de que no son testimonios va ENCIMA de las citas, no debajo", () => {
  const disclaimer = TESTIMONIALS.indexOf("No son testimonios de clientes");
  const cards = TESTIMONIALS.indexOf("SCENARIOS.map");
  assert.ok(disclaimer !== -1, "falta el rótulo inequívoco");
  assert.ok(
    disclaimer < cards,
    "el descargo tiene que preceder a las citas: leído después, llega cuando ya se han tomado por reales"
  );
});
