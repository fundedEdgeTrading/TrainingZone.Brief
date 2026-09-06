import { apiError } from "../../../../_lib/response";

/**
 * RETIRADO por E3-07 · los ocho ejes salen del flujo de sala.
 *
 * Este endpoint era el tercer escritor de `SessionDebrief` y el único que
 * DERIVABA el `feeling` de la media de ocho ejes (`feelingFor`, ya inexistente).
 * Promediar movilidad con actitud no significa nada: es un número que parece
 * riguroso y no lo es. Y rellenar solo el RPE dejaba la media a `null` y
 * marcaba al socio AMBER —"regular"— sin que nadie lo hubiera dicho.
 *
 * A dónde va cada cosa:
 *  · el color de la sesión → `trainer/brief/[id]/debrief` (🟢🟡🔴 + frase),
 *    mismo canal que la web;
 *  · la puntuación por ejes → al bloque "Ejes" de la valoración periódica,
 *    desde la ficha del socio.
 *
 * Qué pasa con el ámbito de centro (E1-01) y la máquina de estados (E2-02 ·
 * RB-RES-010) que este endpoint había ganado: no se pierden. Vivían aquí porque
 * aquí se escribía el debrief; ahora se escribe en `setSessionDebrief`, que los
 * lleva dentro para las dos superficies. Este camino desaparece entero.
 *
 * Se responde 410 en vez de borrar la ruta: una versión antigua de la app que
 * siga llamando recibe el motivo, no un 404 que parezca una caída.
 */
const GONE =
  "La puntuación por ejes ya no se registra en el debrief de sesión (E3-07). El color de la sesión se " +
  "guarda en el debrief 🟢🟡🔴 y los ejes pasan a la valoración periódica, desde la ficha del socio.";

export async function GET() {
  return apiError(GONE, 410);
}

export async function POST() {
  return apiError(GONE, 410);
}
