import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { BRAND, absoluteUrl, publicOrigin } from "./site";

const VARS = ["NEXT_PUBLIC_SITE_URL", "NEXTAUTH_URL", "AUTH_URL", "RENDER_EXTERNAL_URL"] as const;

function only(name?: (typeof VARS)[number], value?: string) {
  for (const v of VARS) delete process.env[v];
  if (name && value !== undefined) process.env[name] = value;
}

afterEach(() => only());

// E9-03 · escenario "módulo único": los módulos que leían NEXTAUTH_URL por su
// cuenta pasan por aquí, así que el orden de precedencia es el contrato.
test("publicOrigin prefiere NEXT_PUBLIC_SITE_URL sobre el resto", () => {
  only();
  process.env.NEXTAUTH_URL = "https://auth.example.com";
  process.env.NEXT_PUBLIC_SITE_URL = "https://apta.example.com";
  assert.equal(publicOrigin(), "https://apta.example.com");
});

test("publicOrigin cae a NEXTAUTH_URL, luego a AUTH_URL, luego a RENDER_EXTERNAL_URL", () => {
  only("NEXTAUTH_URL", "https://uno.example.com");
  assert.equal(publicOrigin(), "https://uno.example.com");
  only("AUTH_URL", "https://dos.example.com");
  assert.equal(publicOrigin(), "https://dos.example.com");
  only("RENDER_EXTERNAL_URL", "https://tres.example.com");
  assert.equal(publicOrigin(), "https://tres.example.com");
});

test("publicOrigin cae al desarrollo local cuando no hay nada configurado", () => {
  only();
  assert.equal(publicOrigin(), "http://localhost:3000");
});

// Un origen con barra final duplicaba la barra en toda URL construida; era el
// motivo del `.replace(/\/$/, "")` repetido en los seis módulos.
test("publicOrigin no deja barra final", () => {
  only("NEXTAUTH_URL", "https://apta.example.com/");
  assert.equal(publicOrigin(), "https://apta.example.com");
});

// `NEXTAUTH_URL` con la ruta de la API detrás rompería todo enlace construido a
// partir de él: lo que se quiere es el origen, no la URL entera.
test("publicOrigin descarta ruta, query y hash", () => {
  only("NEXTAUTH_URL", "https://apta.example.com/api/auth?x=1#y");
  assert.equal(publicOrigin(), "https://apta.example.com");
});

// Poner el host a secas es el error de configuración más común y no revienta
// hasta que alguien abre un correo con un enlace que no navega.
test("publicOrigin normaliza un valor sin protocolo a https", () => {
  only("NEXTAUTH_URL", "apta.example.com");
  assert.equal(publicOrigin(), "https://apta.example.com");
});

test("publicOrigin ignora un valor vacío o ilegible", () => {
  only("NEXTAUTH_URL", "   ");
  assert.equal(publicOrigin(), "http://localhost:3000");
  only("NEXTAUTH_URL", "https://");
  assert.equal(publicOrigin(), "http://localhost:3000");
});

test("absoluteUrl compone sobre el origen y respeta las URLs ya absolutas", () => {
  only("NEXTAUTH_URL", "https://apta.example.com");
  assert.equal(absoluteUrl("/brand/tz-logo-black.png"), "https://apta.example.com/brand/tz-logo-black.png");
  assert.equal(absoluteUrl("planes"), "https://apta.example.com/planes");
  assert.equal(absoluteUrl("https://stripe.com/x"), "https://stripe.com/x");
});

// Escenario "coherencia de marca": el logo dice "Apta" y el title decía
// "TRAINING ZONE", así que Google indexaba dos marcas para el mismo dominio.
test("BRAND dice lo mismo que el logo y el título lleva la consulta principal", () => {
  assert.equal(BRAND.name, "Apta");
  assert.equal(BRAND.titleTemplate, "%s · Apta");
  assert.ok(BRAND.title.includes("Apta"));
  assert.ok(/software de gesti/i.test(BRAND.title));
  assert.ok(/gimnasio/i.test(BRAND.title));
  // El <title> se recorta cerca de los 60-70 caracteres en la SERP; la marca va
  // al final para que lo que sobre sea el sufijo y no la consulta.
  assert.ok(BRAND.title.indexOf("Apta") > BRAND.title.indexOf("gestión"));
});
