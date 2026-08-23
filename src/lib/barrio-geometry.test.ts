import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm, nearestOf, tessellate } from "./barrio-geometry";

// La teselación es lo que sustituye al mapa de calor difuminado: si dos barrios
// comparten superficie, o si el polígono de un barrio no contiene su propio
// punto, el mapa colorea a un vecino y dirección lee mal dónde actuar. Es un
// fallo silencioso —el mapa se pinta igual de bonito—, así que se comprueba
// aquí y no a ojo.

/** ¿Está el punto dentro del anillo? (cruce de rayos sobre pares [lat, lng]). */
function contains(ring: [number, number][], lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const straddles = latI > lat !== latJ > lat;
    if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

test("haversineKm: un grado de latitud son ~111 km, y un punto consigo mismo, cero", () => {
  const zaragoza = { lat: 41.65, lng: -0.88 };
  assert.equal(Math.round(haversineKm(zaragoza, zaragoza) * 1000), 0);
  assert.ok(Math.abs(haversineKm({ lat: 41, lng: 0 }, { lat: 42, lng: 0 }) - 111.19) < 0.1);
});

test("haversineKm: Zaragoza–Santander, la distancia que separa a los dos centros de la demo", () => {
  const km = haversineKm({ lat: 41.6561, lng: -0.8773 }, { lat: 43.4623, lng: -3.8099 });
  assert.ok(km > 300 && km < 330, `esperaba ~313 km, salió ${km}`);
});

test("nearestOf: gana el más cercano, y sin candidatos no hay centro", () => {
  const centers = [
    { name: "La Jota", lat: 41.6685, lng: -0.8815 },
    { name: "Puerta del Carmen", lat: 41.647, lng: -0.888 },
  ];
  const nearest = nearestOf({ lat: 41.668, lng: -0.883 }, centers);
  assert.equal(nearest?.center.name, "La Jota");
  assert.equal(nearestOf({ lat: 41.6, lng: -0.9 }, []), null);
});

test("tessellate: un polígono por barrio, y cada uno contiene su propio punto", () => {
  const points = [
    { lat: 41.6561, lng: -0.8773 },
    { lat: 41.649, lng: -0.909 },
    { lat: 41.668, lng: -0.885 },
    { lat: 41.625, lng: -0.879 },
    { lat: 41.639, lng: -0.935 },
  ];
  const rings = tessellate(points);

  assert.equal(rings.length, points.length);
  rings.forEach((ring, i) => {
    assert.ok(ring.length >= 3, `el barrio ${i} salió sin polígono`);
    assert.ok(contains(ring, points[i].lat, points[i].lng), `el barrio ${i} no contiene su punto`);
  });
});

test("tessellate: ningún barrio se queda con el punto de otro", () => {
  const points = [
    { lat: 41.66, lng: -0.9 },
    { lat: 41.66, lng: -0.86 },
    { lat: 41.63, lng: -0.9 },
    { lat: 41.63, lng: -0.86 },
  ];
  const rings = tessellate(points);

  rings.forEach((ring, i) => {
    points.forEach((p, j) => {
      if (i === j) return;
      assert.ok(!contains(ring, p.lat, p.lng), `el barrio ${i} se comió el punto del ${j}`);
    });
  });
});

test("tessellate: casos degenerados (ninguno, uno, dos barrios) siguen dando geometría", () => {
  assert.deepEqual(tessellate([]), []);

  const single = tessellate([{ lat: 43.4623, lng: -3.8099 }]);
  assert.equal(single.length, 1);
  assert.ok(contains(single[0], 43.4623, -3.8099));

  // Dos puntos no tienen casco convexo: sin el marco de recorte de reserva, el
  // recorte se quedaba sin polígono de partida y ambos salían vacíos.
  const pair = tessellate([
    { lat: 43.4623, lng: -3.8099 },
    { lat: 43.4742, lng: -3.7809 },
  ]);
  assert.equal(pair.length, 2);
  assert.ok(contains(pair[0], 43.4623, -3.8099));
  assert.ok(contains(pair[1], 43.4742, -3.7809));
  assert.ok(!contains(pair[0], 43.4742, -3.7809));
});
