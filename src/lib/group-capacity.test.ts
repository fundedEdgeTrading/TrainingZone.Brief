import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_GROUP_CAPACITY,
  centerCapacityCeiling,
  checkCenterDefaultCapacity,
  checkSessionCapacity,
} from "@/lib/group-capacity";

/**
 * E2-13: el tope global de aforo se respeta en las dos superficies.
 *
 * El fallo: `aforo/actions.ts` solo validaba `>= 1`, así que fijar 500 como
 * aforo por defecto convertía 500 en el techo del centro; y el `PATCH
 * /capacity` móvil usaba un 30 fijo, ignorando el del centro, y aceptaba
 * cualquier `sessionId` —franjas de entrenamiento personal incluidas—.
 */

test("el aforo por defecto del centro no puede saltarse el tope global", () => {
  const rejected = checkCenterDefaultCapacity(500);
  assert.equal(rejected.ok, false);
  assert.ok(!rejected.ok && rejected.error.includes(String(MAX_GROUP_CAPACITY)));

  assert.deepEqual(checkCenterDefaultCapacity(12), { ok: true, value: 12 });
  assert.deepEqual(checkCenterDefaultCapacity(MAX_GROUP_CAPACITY), { ok: true, value: MAX_GROUP_CAPACITY });
});

test("vacío significa no fijar ninguno, y un valor absurdo se rechaza", () => {
  assert.deepEqual(checkCenterDefaultCapacity(""), { ok: true, value: null });
  assert.deepEqual(checkCenterDefaultCapacity("   "), { ok: true, value: null });
  assert.deepEqual(checkCenterDefaultCapacity(null), { ok: true, value: null });

  assert.equal(checkCenterDefaultCapacity(0).ok, false);
  assert.equal(checkCenterDefaultCapacity(-3).ok, false);
  assert.equal(checkCenterDefaultCapacity("muchos").ok, false);
});

test("el techo de un centro con un valor absurdo ya guardado se clampa al global", () => {
  // Es lo que arregla los centros que fijaron 500 antes del cambio: el número
  // sigue en la tabla, pero deja de ser el techo.
  assert.equal(centerCapacityCeiling(500), MAX_GROUP_CAPACITY);
  assert.equal(centerCapacityCeiling(8), 8);
  assert.equal(centerCapacityCeiling(null), MAX_GROUP_CAPACITY, "sin valor propio manda el global");
  assert.equal(centerCapacityCeiling(0), MAX_GROUP_CAPACITY);
});

test("el aforo de una sesión se mide contra el tope del centro, no contra un 30 fijo", () => {
  const inACenterOf10 = (capacity: number) =>
    checkSessionCapacity({ capacity, ceiling: centerCapacityCeiling(10), currentCapacity: 10, occupied: 0 });

  assert.deepEqual(inACenterOf10(10), { ok: true, value: 10 });
  const tooMany = inACenterOf10(25);
  assert.equal(tooMany.ok, false, "25 cabía en el 30 fijo del móvil, pero no en este centro");
  assert.ok(!tooMany.ok && tooMany.error.includes("10"));
});

test("una sesión creada con más de 30 antes del arreglo se sigue pudiendo editar", () => {
  const legacy = { ceiling: MAX_GROUP_CAPACITY, currentCapacity: 500, occupied: 0 };

  // No queda bloqueada por su propio valor: se puede bajar…
  assert.deepEqual(checkSessionCapacity({ ...legacy, capacity: 20 }), { ok: true, value: 20 });
  // …e incluso dejarla como está mientras se corrige otra cosa.
  assert.deepEqual(checkSessionCapacity({ ...legacy, capacity: 500 }), { ok: true, value: 500 });
  // Lo que no se puede es subirla todavía más.
  assert.equal(checkSessionCapacity({ ...legacy, capacity: 501 }).ok, false);
});

test("no se baja el aforo por debajo de la ocupación real", () => {
  const result = checkSessionCapacity({ capacity: 3, ceiling: 12, currentCapacity: 12, occupied: 7 });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /7 plazas ocupadas/.test(result.error));

  // Justo en la ocupación sí: cerrar las plazas libres es legítimo.
  assert.deepEqual(checkSessionCapacity({ capacity: 7, ceiling: 12, currentCapacity: 12, occupied: 7 }), {
    ok: true,
    value: 7,
  });
});
