import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_BRAND_LOGO, emailBrandLogo, logoUrlForTheme, resolveBrandLogo } from "./brand-logo";
import { emailLogoCellHtml } from "./emails/logo-cell";

const LIGHT = "/api/files/11111111-1111-1111-1111-111111111111";
const DARK = "/api/files/22222222-2222-2222-2222-222222222222";
const CENTER = "/api/files/33333333-3333-3333-3333-333333333333";

test("sin logo en ningún nivel: null (se pinta el de Apta)", () => {
  assert.equal(resolveBrandLogo(null, undefined, { logoUrl: null, logoDarkUrl: null }), null);
});

test("con versión para fondos oscuros subida, esa es la de oscuro", () => {
  assert.deepEqual(resolveBrandLogo({ logoUrl: LIGHT, logoDarkUrl: DARK }), {
    light: LIGHT,
    dark: DARK,
    darkOnPlate: false,
  });
});

test("sin versión oscura, en oscuro va el logo normal sobre la pastilla", () => {
  assert.deepEqual(resolveBrandLogo({ logoUrl: LIGHT, logoDarkUrl: null }), {
    light: LIGHT,
    dark: LIGHT,
    darkOnPlate: true,
  });
});

test("los assets propios por nombre de fichero siguen emparejándose, sin pastilla", () => {
  assert.deepEqual(resolveBrandLogo({ logoUrl: "/brand/tz-logo-black.png", logoDarkUrl: null }), {
    light: "/brand/tz-logo-black.png",
    dark: "/brand/tz-logo-white.png",
    darkOnPlate: false,
  });
  // `logoUrlForTheme` se conserva tal cual para quien lo usa directamente.
  assert.equal(logoUrlForTheme("/brand/tz-logo-white.png", "light"), "/brand/tz-logo-black.png");
});

test("manda el centro con su propia versión oscura; nunca se mezcla con la de la organización", () => {
  const org = { logoUrl: LIGHT, logoDarkUrl: DARK };
  // Centro con logo propio y sin versión oscura: pastilla, NO la oscura de la organización.
  assert.deepEqual(resolveBrandLogo({ logoUrl: CENTER, logoDarkUrl: null }, org), {
    light: CENTER,
    dark: CENTER,
    darkOnPlate: true,
  });
  // Centro sin logo: hereda la pareja completa de la organización.
  assert.deepEqual(resolveBrandLogo({ logoUrl: null, logoDarkUrl: null }, org), {
    light: LIGHT,
    dark: DARK,
    darkOnPlate: false,
  });
  // Una versión oscura suelta en el centro (sin logo) no cuenta.
  assert.equal(resolveBrandLogo({ logoUrl: null, logoDarkUrl: CENTER }, null), null);
});

test("el email lleva siempre una URL absoluta de la versión para fondo oscuro", () => {
  const withDark = emailBrandLogo({ logoUrl: LIGHT, logoDarkUrl: DARK });
  assert.match(withDark.url, new RegExp(`^https?://[^/]+${DARK}$`));
  assert.equal(withDark.onPlate, false);

  const plate = emailBrandLogo({ logoUrl: LIGHT, logoDarkUrl: null });
  assert.match(plate.url, new RegExp(`^https?://[^/]+${LIGHT}$`));
  assert.equal(plate.onPlate, true);

  const fallback = emailBrandLogo(null);
  assert.match(fallback.url, /\/brand\/tz-logo-white\.png$/);
  assert.equal(fallback.onPlate, false);
  assert.equal(DEFAULT_BRAND_LOGO.light, "/brand/tz-logo-black.png");
});

test("cabecera del email: el logo del gimnasio no se deforma y va en pastilla si hace falta", () => {
  const apta = emailLogoCellHtml("https://x.test/brand/tz-logo-white.png", "Apta");
  assert.match(apta, /width="155" height="26"/);

  const own = emailLogoCellHtml({ url: `https://x.test${DARK}`, onPlate: false }, "Gym");
  assert.doesNotMatch(own, /width="155"/);
  assert.match(own, /width:auto;max-width:200px/);
  assert.doesNotMatch(own, /#F4F0E8/);

  const plated = emailLogoCellHtml({ url: `https://x.test${LIGHT}`, onPlate: true }, "Gym");
  assert.match(plated, /background:#F4F0E8/);
  assert.match(plated, /<img /);

  // El nombre del gimnasio sale de la base de datos: se escapa.
  assert.match(emailLogoCellHtml({ url: "https://x.test/a.png", onPlate: false }, 'A "B" <C>'), /alt="A &quot;B&quot; &lt;C&gt;"/);
});
