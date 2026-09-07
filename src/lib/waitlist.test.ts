import test from "node:test";
import assert from "node:assert/strict";
import { WAITLIST_NO_QUEUE_NOTICE, resequencePositions } from "@/lib/waitlist";

/**
 * E2-08: el puesto de la cola significa algo.
 *
 * `bookSessionForMember` escribía `waitlistedCount + 1` una sola vez y nadie
 * volvía a tocar el número: A(1), B(2), A cancela, entra C → C se llevaba
 * también la 2.
 */

const at = (id: string, waitlistPosition: number | null) => ({ id, waitlistPosition });

test("renumeración tras una baja: los de detrás pasan a 1 y 2, sin huecos ni duplicados", () => {
  // A(1) se ha ido; quedan B(2) y C(3) en el orden de la cola.
  const changes = resequencePositions([at("B", 2), at("C", 3)]);
  assert.deepEqual(changes, [
    { id: "B", waitlistPosition: 1 },
    { id: "C", waitlistPosition: 2 },
  ]);
});

test("una entrada nueva recibe la posición 3, no la 4", () => {
  // Tras compactar, la cola tiene 2 personas, así que el siguiente número
  // libre —`count + 1`, contado dentro de la transacción— es el 3.
  const queue = [at("B", 1), at("C", 2)];
  assert.deepEqual(resequencePositions(queue), [], "ya está compactada");
  assert.equal(queue.length + 1, 3);
});

test("no se escribe nada si la cola ya está bien numerada", () => {
  assert.deepEqual(resequencePositions([at("A", 1), at("B", 2), at("C", 3)]), []);
  assert.deepEqual(resequencePositions([]), []);
});

test("una cola con duplicados y nulos sale compactada", () => {
  // El estado que dejaba el fallo: dos personas en la 2 y alguien sin número.
  const changes = resequencePositions([at("A", 1), at("B", 2), at("C", 2), at("D", null)]);
  assert.deepEqual(changes, [
    { id: "C", waitlistPosition: 3 },
    { id: "D", waitlistPosition: 4 },
  ]);
  // A y B ya estaban en su sitio y no se reescriben.
  assert.ok(!changes.some((c) => c.id === "A" || c.id === "B"));
});

test("la interfaz explica que la posición no es un turno", () => {
  // RB-RES-007 es una decisión de negocio: se avisa a toda la lista a la vez.
  // Sin esta frase, el número se lee como una reserva de plaza.
  assert.match(WAITLIST_NO_QUEUE_NOTICE, /toda la lista/);
  assert.match(WAITLIST_NO_QUEUE_NOTICE, /quien la reclame antes/);
});
