import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LOGO_BOX, classifyLogo, logoHosts, logoRemotePatterns } from "@/lib/logo-image";

/**
 * E9-12 · Los logos dinámicos eran `<img>` sin dimensiones justo encima del
 * `<h1>` (CLS), y `logoUrl` es una URL arbitraria por organización: un gimnasio
 * podía subir un PNG de 3 MB y hundir el LCP de su propia página.
 */

const HOSTS = ["cdn.apta.app", "*.cloudfront.net"];

test("una ruta del propio despliegue se optimiza sin autorizar a nadie", () => {
  assert.equal(classifyLogo("/brand/mi-logo.svg", HOSTS), "local");
  assert.equal(classifyLogo("/brand/mi-logo.png", []), "local");
});

test("un host declarado se optimiza; el comodín cubre subdominios y no el dominio pelado", () => {
  assert.equal(classifyLogo("https://cdn.apta.app/logos/a.png", HOSTS), "optimizable");
  assert.equal(classifyLogo("https://d1234.cloudfront.net/a.png", HOSTS), "optimizable");
  assert.equal(classifyLogo("https://cloudfront.net/a.png", HOSTS), "foreign");
});

test("un host cualquiera NO se optimiza: el optimizador no es un proxy abierto", () => {
  assert.equal(classifyLogo("https://ejemplo-que-no-conocemos.com/a.png", HOSTS), "foreign");
  // `//evil.com/a.png` es un protocolo relativo, no una ruta local.
  assert.equal(classifyLogo("//evil.com/a.png", HOSTS), "foreign");
  assert.equal(classifyLogo("no-es-una-url", HOSTS), "foreign");
  assert.equal(classifyLogo("   ", HOSTS), "foreign");
});

test("la lista sale del entorno, y next.config usa exactamente la misma", () => {
  assert.deepEqual(logoHosts({}), []);
  assert.deepEqual(logoHosts({ NEXT_PUBLIC_LOGO_HOSTS: " cdn.apta.app , *.cloudfront.net " }), HOSTS);
  assert.deepEqual(logoRemotePatterns({ NEXT_PUBLIC_LOGO_HOSTS: "cdn.apta.app" }), [
    { protocol: "https", hostname: "cdn.apta.app" },
  ]);

  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /remotePatterns: logoRemotePatterns\(\)/);
  // Un SVG remoto es un documento que puede llevar script dentro.
  assert.match(config, /dangerouslyAllowSVG: false/);
});

test("las dos páginas públicas pasan por OrgLogo, con la caja declarada", () => {
  for (const page of [
    "src/app/hazte-socio/[orgSlug]/[centerSlug]/page.tsx",
    "src/app/lead-form/[orgSlug]/[centerSlug]/page.tsx",
  ]) {
    const source = readFileSync(page, "utf8");
    assert.match(source, /<OrgLogo /, `${page} no usa OrgLogo`);
    assert.ok(!/<img /.test(source), `${page} vuelve a pintar un <img> suelto`);
  }

  // Venga de donde venga el logo, la caja está: el CLS se arregla en las dos
  // ramas, la optimizada y la que no.
  const component = readFileSync("src/components/org-logo.tsx", "utf8");
  const withBox = [...component.matchAll(/width=\{LOGO_BOX\.width\}/g)];
  assert.equal(withBox.length, 2, "alguna rama de OrgLogo se ha quedado sin dimensiones");
  assert.deepEqual(LOGO_BOX, { width: 160, height: 36 });
});

test("lo que ya estaba bien sigue estándolo: la fuente con next/font y display swap", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /from "next\/font\/google"/);
  assert.match(layout, /display: "swap"/);
});
