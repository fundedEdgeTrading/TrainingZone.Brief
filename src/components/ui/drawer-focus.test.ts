import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E8-05 · `inert` y trampa de foco en Drawer y Sidebar. No hay entorno DOM en
 * este harness de pruebas (`node:test` sin jsdom), así que — igual que
 * E8-16 — se comprueba por código fuente que los mecanismos están en su
 * sitio: cerrado, el panel no es alcanzable con tabulador (`inert`); al
 * abrir, el foco entra; dentro, se atrapa entre el primer y el último
 * elemento enfocable; al cerrar, vuelve a quien lo abrió.
 */

const drawer = readFileSync(join("src", "components", "ui", "drawer.tsx"), "utf8");
const sidebar = readFileSync(join("src", "app", "(app)", "sidebar.tsx"), "utf8");

test("E8-05 · Drawer: el panel cerrado lleva inert", () => {
  assert.match(drawer, /inert=\{!open\}/);
});

test("E8-05 · Drawer: el foco entra al abrir y vuelve al cerrar", () => {
  assert.match(drawer, /openerRef\.current = document\.activeElement/);
  assert.match(drawer, /focusables\?\.\[0\] \?\? panelRef\.current\)\?\.focus\(\)/);
  assert.match(drawer, /opener\.focus\(\)/);
});

test("E8-05 · Drawer: Tab queda atrapado entre el primer y el último enfocable", () => {
  assert.match(drawer, /e\.shiftKey && active === first/);
  assert.match(drawer, /!e\.shiftKey && active === last/);
});

test("E8-05 · Sidebar: el cajón móvil cerrado lleva inert, pero el raíl de escritorio nunca", () => {
  assert.match(sidebar, /inert=\{mobileClosed\}/);
  assert.match(sidebar, /mobileClosed = !isDesktop && !open/);
});

test("E8-05 · Sidebar reutiliza la misma trampa de foco que Drawer (FOCUSABLE_SELECTOR compartido)", () => {
  assert.match(drawer, /export const FOCUSABLE_SELECTOR/);
  assert.match(sidebar, /import \{ FOCUSABLE_SELECTOR \} from "@\/components\/ui\/drawer"/);
});
