import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * E9-10 · `/planes` tenía DOS `h1`: el del hero y "Elige tu plan". Dos h1
 * obligan a Google a elegir cuál describe la página, y el que elegía no llevaba
 * la consulta principal — la describía sin nombrarla.
 */

const FILES = [
  "src/app/planes/page.tsx",
  "src/app/planes/hero.tsx",
  "src/app/planes/tour.tsx",
  "src/app/planes/how-it-works.tsx",
  "src/app/planes/testimonials.tsx",
  "src/app/planes/faq.tsx",
  "src/app/planes/final-cta.tsx",
  "src/app/planes/pricing.tsx",
];

function headings(level: number): string[] {
  const found: string[] = [];
  for (const file of FILES) {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const match of source.matchAll(new RegExp(`<h${level}[\\s>]`, "g"))) found.push(`${file}:${match[0]}`);
  }
  return found;
}

test("un solo h1 en toda la página, y está en el hero", () => {
  const h1s = headings(1);
  assert.equal(h1s.length, 1, `se esperaba un único h1 y hay ${h1s.length}: ${h1s.join(", ")}`);
  assert.match(h1s[0], /hero\.tsx/);
});

test("el h1 contiene la consulta principal: «software de gestión» + «gimnasio»", () => {
  const hero = readFileSync("src/app/planes/hero.tsx", "utf8");
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(hero)?.[1] ?? "";
  const text = h1.replace(/\s+/g, " ").toLowerCase();
  assert.match(text, /software de gestión/);
  assert.match(text, /gimnasio/);
});

test("el eyebrow no repite la frase del h1", () => {
  const hero = readFileSync("src/app/planes/hero.tsx", "utf8");
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(hero)?.[1]?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  const eyebrow = /<p className="text-\[11px\][^>]*>([\s\S]*?)<\/p>/.exec(hero)?.[1]?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  assert.ok(eyebrow, "no se encuentra el eyebrow del hero");
  // Repetir la consulta dos veces seguidas no refuerza: reparte la señal y hace
  // leer dos veces la misma frase antes de llegar al botón.
  assert.ok(!h1.includes(eyebrow) && !eyebrow.includes(h1), "el eyebrow repite el h1");
  assert.ok(!eyebrow.includes("software de gestión"), "el eyebrow vuelve a llevar la consulta principal");
});

test("«Elige tu plan» baja a h2 y las tarjetas de plan cuelgan de él", () => {
  assert.match(readFileSync("src/app/planes/page.tsx", "utf8"), /<h2[^>]*>\s*Elige tu plan\s*<\/h2>/);
  assert.match(readFileSync("src/app/planes/pricing.tsx", "utf8"), /<h3[^>]*>\{plan\.name\}<\/h3>/);
});

test("los dos h1 de activar/page.tsx se conservan: son ramas de return excluyentes", () => {
  const activar = readFileSync("src/app/activar/page.tsx", "utf8");
  const count = [...activar.matchAll(/<h1[\s>]/g)].length;
  // No se tocan: nunca se renderizan a la vez, así que la página siempre sirve
  // un único h1.
  assert.equal(count, 2);
});
