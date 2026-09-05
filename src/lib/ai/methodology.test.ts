import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMethodologySystem, EP_PROFILES, METHODOLOGY_VERSION } from "./methodology";

/**
 * `buildMethodologySystem` es el prefijo cacheado (`cache_control`) del
 * sistema de generación: si dos llamadas para el mismo perfil no devuelven
 * exactamente los mismos bytes, el caché de Anthropic no se reutiliza y el
 * coste medido en la guía (docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md §2.2)
 * deja de cumplirse en silencio.
 */
test("buildMethodologySystem es determinista para el mismo perfil", () => {
  for (const profile of EP_PROFILES) {
    assert.equal(buildMethodologySystem(profile), buildMethodologySystem(profile));
  }
});

test("cada perfil produce un sistema no vacío", () => {
  for (const profile of EP_PROFILES) {
    assert.ok(buildMethodologySystem(profile).length > 0);
  }
});

test("los perfiles con contenido propio producen sistemas distintos entre sí", () => {
  // RENDIMIENTO_OPOSICIONES y RENDIMIENTO_ATLETA comparten a propósito el
  // mismo fichero de perfil (docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md §2):
  // se excluyen de la comparación de unicidad.
  const distinctProfiles = EP_PROFILES.filter((p) => p !== "RENDIMIENTO_ATLETA");
  const systems = distinctProfiles.map(buildMethodologySystem);
  assert.equal(new Set(systems).size, systems.length);
});

test("METHODOLOGY_VERSION tiene el formato AAAA-MM-DD-letra", () => {
  assert.match(METHODOLOGY_VERSION, /^\d{4}-\d{2}-\d{2}-[a-z]$/);
});
