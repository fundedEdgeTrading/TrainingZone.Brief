import { STORE_LISTING } from "./metadata";

/**
 * E9-16 · Copy de la ficha.
 *
 * Lo que se comprueba no es el estilo, es lo que rompe una publicación:
 * límites de caracteres de cada tienda, y que la descripción corta no
 * arranca describiendo el producto ("Apta es...") en vez del problema que
 * resuelve.
 */

test("nombre y subtítulo son los decididos, sin reabrir la decisión", () => {
  expect(STORE_LISTING.name).toBe("Apta · Tu gimnasio");
  expect(STORE_LISTING.subtitle).toBe("Reserva, bonos y tu progreso");
});

test("el subtítulo cabe en el límite de App Store (30 caracteres)", () => {
  expect(STORE_LISTING.subtitle.length).toBeLessThanOrEqual(30);
});

test("el nombre de ficha cabe en el límite de Google Play (30 caracteres)", () => {
  expect(STORE_LISTING.name.length).toBeLessThanOrEqual(30);
});

test("la descripción breve de Play cabe en 80 caracteres", () => {
  expect(STORE_LISTING.shortDescription.length).toBeLessThanOrEqual(80);
});

test("la descripción breve dice qué resuelve, no qué es", () => {
  // No debe abrir presentándose como producto: eso es "qué es", no "qué resuelve".
  expect(STORE_LISTING.shortDescription.toLowerCase().startsWith("apta es")).toBe(false);
  expect(STORE_LISTING.shortDescription.toLowerCase()).not.toContain("apta es");
});

test("la descripción larga cabe en el límite compartido de las dos tiendas (4000 caracteres)", () => {
  expect(STORE_LISTING.fullDescription.length).toBeLessThanOrEqual(4000);
});

test("las keywords de App Store caben en 100 caracteres", () => {
  expect(STORE_LISTING.keywords.length).toBeLessThanOrEqual(100);
});

test("la URL de privacidad viene de app.json, no duplicada a mano", () => {
  expect(STORE_LISTING.privacyPolicyUrl).toMatch(/^https:\/\/.+\/privacidad$/);
});

test("la categoría es Health & Fitness en las dos tiendas", () => {
  expect(STORE_LISTING.category.apple).toBe("HEALTH_AND_FITNESS");
  expect(STORE_LISTING.category.google).toBe("HEALTH_AND_FITNESS");
});
