import test from "node:test";
import assert from "node:assert/strict";

import {
  GENERIC_CENTER_METADATA,
  centerDescription,
  centerLeadFormMetadata,
  centerMembershipMetadata,
  centerTitle,
  leadFormPath,
  membershipPath,
  type PublicCenterSeo,
} from "@/lib/public-center-seo";

/**
 * E9-04 · Lo que se comprueba es que dos centros distintos no produzcan la
 * misma página: mismo título y mismo cuerpo es lo que hace que Google agrupe
 * cien URLs, elija una canónica y borre las noventa y nueve restantes.
 */

function center(over: Partial<PublicCenterSeo> = {}): PublicCenterSeo {
  return {
    orgName: "TRAINING ZONE",
    orgSlug: "training-zone",
    centerName: "TRAINING ZONE La Jota",
    centerSlug: "la-jota",
    city: "Zaragoza",
    neighborhood: "La Jota",
    description: null,
    publicPage: true,
    ...over,
  };
}

test("título por centro: lleva el nombre delante y la intención local detrás", () => {
  assert.equal(centerTitle(center()), "TRAINING ZONE La Jota · Gimnasio en Zaragoza");
  const otro = centerTitle(center({ centerName: "TRAINING ZONE Delicias", city: "Zaragoza" }));
  assert.notEqual(centerTitle(center()), otro);
});

test("descripción: manda el párrafo propio del centro, que es lo que evita el duplicado", () => {
  const propio = centerDescription(center({ description: "  Box de CrossFit en el barrio de La Jota.  " }));
  assert.equal(propio, "Box de CrossFit en el barrio de La Jota.");

  // Sin párrafo propio se compone uno con el sitio: al menos no es idéntico
  // entre centros, que es el fallo que se está tapando.
  const compuesta = centerDescription(center());
  assert.match(compuesta, /La Jota, Zaragoza/);
  assert.notEqual(compuesta, centerDescription(center({ centerName: "TZ Delicias", neighborhood: "Delicias" })));
});

test("descripción larga: se recorta sin partir palabra", () => {
  const larga = centerDescription(center({ description: "palabra ".repeat(80) }));
  assert.ok(larga.length <= 301, `demasiado larga: ${larga.length}`);
  assert.ok(larga.endsWith("…"));
});

test("canonical: /hazte-socio declara su propia URL", () => {
  const meta = centerMembershipMetadata(center());
  assert.equal(meta.alternates?.canonical, "/hazte-socio/training-zone/la-jota");
  assert.equal(membershipPath("training-zone", "la-jota"), "/hazte-socio/training-zone/la-jota");
  assert.equal(leadFormPath("training-zone", "la-jota"), "/lead-form/training-zone/la-jota");
});

test("openGraph: título y descripción del centro, no los genéricos de la marca", () => {
  const meta = centerMembershipMetadata(center({ description: "Entrenamiento personal junto al Ebro." }));
  assert.equal(meta.openGraph?.title, "TRAINING ZONE La Jota · Gimnasio en Zaragoza");
  assert.equal(meta.openGraph?.description, "Entrenamiento personal junto al Ebro.");
  assert.equal(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : null, "/hazte-socio/training-zone/la-jota");
});

test("lead-form: fuera del índice, pero canonizando hacia la página con precios", () => {
  const meta = centerLeadFormMetadata(center());
  assert.deepEqual(meta.robots, { index: false, follow: true });
  assert.equal(meta.alternates?.canonical, "/hazte-socio/training-zone/la-jota");
});

test("centro sin datos: se degrada al título genérico, sin romper", () => {
  const pelado = center({ city: null, neighborhood: null, description: null });
  assert.equal(centerTitle(pelado), "TRAINING ZONE La Jota · Hazte socio");
  assert.match(centerDescription(pelado), /de TRAINING ZONE/);
  assert.equal(GENERIC_CENTER_METADATA.title, "Hazte socio");
});
