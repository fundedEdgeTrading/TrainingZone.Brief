import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  centerJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  platformOffersJsonLd,
  serializeJsonLd,
  type CenterJsonLdInput,
} from "@/lib/json-ld";
import { parseOpeningHours } from "@/lib/opening-hours";

/**
 * E9-07 · `grep -rn "application/ld+json\|schema.org"` no devolvía nada.
 *
 * Lo que se comprueba aquí no es que el marcado exista, es que sea VÁLIDO:
 * marcado incompleto es peor que ausente, y un precio marcado que no es el que
 * se cobra es motivo de acción manual.
 */

function center(over: Partial<CenterJsonLdInput> = {}): CenterJsonLdInput {
  return {
    name: "TRAINING ZONE La Jota",
    url: "https://apta.app/hazte-socio/training-zone/la-jota",
    description: "Entrenamiento personal y grupos reducidos.",
    address: "Av. de Cataluña 42",
    city: "Zaragoza",
    postalCode: "50014",
    phone: "976 000 000",
    lat: 41.6685,
    lng: -0.8815,
    openingHours: null,
    offers: [],
    ...over,
  };
}

test("FAQPage: se genera desde el array FAQS, no a mano", () => {
  // El array real de la landing: si se escribiera dos veces, un día dirían
  // cosas distintas y el resultado enriquecido enseñaría lo que la página no.
  const faq = readFileSync("src/app/planes/faq.tsx", "utf8");
  assert.match(faq, /export const FAQS/);
  const page = readFileSync("src/app/planes/page.tsx", "utf8");
  assert.match(page, /faqPageJsonLd\(FAQS\)/);

  const node = faqPageJsonLd([{ q: "¿Hay permanencia?", a: "No hay permanencia obligatoria." }]);
  assert.equal(node?.["@type"], "FAQPage");
  assert.deepEqual(node?.mainEntity, [
    {
      "@type": "Question",
      name: "¿Hay permanencia?",
      acceptedAnswer: { "@type": "Answer", text: "No hay permanencia obligatoria." },
    },
  ]);
  assert.equal(faqPageJsonLd([]), null);
});

test("centro: se emite SOLO si hay dirección y coordenadas", () => {
  assert.ok(centerJsonLd(center()));
  // Marcado incompleto es peor que ausente.
  assert.equal(centerJsonLd(center({ address: null })), null);
  assert.equal(centerJsonLd(center({ lat: null })), null);
  assert.equal(centerJsonLd(center({ lng: null })), null);
});

test("centro: dirección, geo y horario en el formato que espera schema.org", () => {
  const hours = parseOpeningHours("Lunes: 07:00-22:00\nSábado: 09:00-14:00");
  assert.ok(hours.ok);
  const node = centerJsonLd(center({ openingHours: hours.value }));

  assert.equal(node?.["@type"], "SportsActivityLocation");
  assert.deepEqual(node?.address, {
    "@type": "PostalAddress",
    streetAddress: "Av. de Cataluña 42",
    addressLocality: "Zaragoza",
    postalCode: "50014",
    addressCountry: "ES",
  });
  assert.deepEqual(node?.geo, { "@type": "GeoCoordinates", latitude: 41.6685, longitude: -0.8815 });
  assert.deepEqual(node?.openingHours, ["Mo 07:00-22:00", "Sa 09:00-14:00"]);
});

test("centro: los campos que no se saben no se inventan, se omiten", () => {
  const node = centerJsonLd(center({ phone: null, city: null, postalCode: null, description: null }));
  assert.ok(node);
  assert.ok(!("telephone" in node));
  assert.ok(!("description" in node));
  assert.ok(!("openingHours" in node));
  const address = node.address as Record<string, unknown>;
  assert.ok(!("addressLocality" in address));
});

test("Offer del catálogo de plataforma: SIN price", () => {
  const node = platformOffersJsonLd([
    { name: "Avanzado", code: "avanzado" },
    { name: "Élite", code: "elite" },
  ]);
  const offers = node?.offers as Record<string, unknown>[];
  assert.equal(offers.length, 2);
  for (const offer of offers) {
    // `priceLabel` es "solo presentación" y el importe real vive en Stripe,
    // resuelto por entorno: marcarlo sería afirmar un cargo que puede no ser.
    assert.ok(!("price" in offer), "se ha marcado un precio que no es el que se cobra");
    assert.equal(offer.priceCurrency, "EUR");
  }
  assert.equal(platformOffersJsonLd([]), null);
});

test("Offer del centro: ahí el importe SÍ es el que se cobra, y va marcado", () => {
  const node = centerJsonLd(center({ offers: [{ name: "Cuota mensual", priceCents: 4900 }] }));
  const offers = node?.makesOffer as Record<string, unknown>[];
  assert.equal(offers[0].price, "49.00");
  assert.equal(offers[0].priceCurrency, "EUR");
});

test("Organization se emite en el layout raíz", () => {
  const node = organizationJsonLd();
  assert.equal(node["@type"], "Organization");
  assert.equal(node.name, "Apta");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /<JsonLd node=\{organizationJsonLd\(\)\} \/>/);
});

test("un nombre de centro con </script> no puede cerrar la etiqueta", () => {
  // Los nombres de centro los escribe el gimnasio: un `</script>` dentro del
  // JSON convertiría el resto en HTML ejecutable.
  const json = serializeJsonLd(centerJsonLd(center({ name: '</script><img src=x onerror=alert(1)>' })));
  assert.ok(!json.includes("</script>"));
  assert.ok(json.includes("\\u003c/script"));
  // Y sigue siendo JSON válido con el nombre intacto.
  assert.equal((JSON.parse(json) as { name: string }).name, '</script><img src=x onerror=alert(1)>');
});

test("todo nodo lleva su @context y su @type: es lo que valida el Rich Results Test", () => {
  const nodes = [organizationJsonLd(), faqPageJsonLd([{ q: "a", a: "b" }]), centerJsonLd(center())];
  for (const node of nodes) {
    assert.ok(node);
    assert.equal(node["@context"], "https://schema.org");
    assert.ok(typeof node["@type"] === "string" && node["@type"].length > 0);
  }
});
