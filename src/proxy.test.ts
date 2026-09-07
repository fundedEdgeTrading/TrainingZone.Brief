import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isPublicPath } from "@/lib/public-paths";

/**
 * E9-01 · Lo que se comprueba aquí es el MATCHER real de `src/proxy.ts`, no una
 * copia: se lee del fichero y se compila. Una ruta que el matcher excluye no
 * ejecuta el proxy, y por tanto no puede acabar en `NextResponse.redirect`.
 *
 * No se importa `src/proxy.ts` a propósito: arrastra `next/server` y
 * `next-auth/jwt`, que no arrancan fuera del runtime de Next. El fichero es la
 * fuente de verdad de todos modos.
 */

/** El literal del matcher, tal y como se despliega. */
function proxyMatcher(): RegExp {
  const source = readFileSync("src/proxy.ts", "utf8");
  const found = source.match(/matcher:\s*\[\s*("(?:[^"\\]|\\.)*")\s*,?\s*\]/);
  assert.ok(found, "src/proxy.ts debe declarar un único matcher de una sola entrada");
  return new RegExp(`^${JSON.parse(found[1]) as string}$`);
}

/** `true` cuando la petición ejecuta el proxy (y por tanto puede rebotar a /login). */
function runsProxy(pathname: string): boolean {
  return proxyMatcher().test(pathname);
}

test("robots.txt: se sirve sin pasar por el proxy, así que responde 200 y no 307", () => {
  assert.equal(runsProxy("/robots.txt"), false);
});

test("sitemap.xml: igual que robots.txt, sin sesión y sin redirección", () => {
  assert.equal(runsProxy("/sitemap.xml"), false);
});

test("well-known: App Links y Universal Links no se rebotan, ni con extensión ni sin ella", () => {
  assert.equal(runsProxy("/.well-known/apple-app-site-association"), false);
  assert.equal(runsProxy("/.well-known/assetlinks.json"), false);
});

test("el resto sigue protegido: el proxy se ejecuta en cualquier ruta privada", () => {
  for (const path of ["/dashboard", "/members", "/portal/agenda", "/mapa-barrios", "/organization"]) {
    assert.equal(runsProxy(path), true, `${path} debería seguir pasando por el proxy`);
  }
});

test("y si alguien reescribe el matcher, la lista de rutas públicas sigue dejándolas pasar", () => {
  assert.equal(isPublicPath("/robots.txt"), true);
  assert.equal(isPublicPath("/sitemap.xml"), true);
  assert.equal(isPublicPath("/.well-known/assetlinks.json"), true);
  assert.equal(isPublicPath("/dashboard"), false);
});
