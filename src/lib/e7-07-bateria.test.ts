import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

/**
 * E7-07 · el índice de la batería, y el candado de los tres casos que ya
 * estaban cubiertos.
 *
 * De los diez casos de la historia, siete se escriben en esta pista
 * (`e7-07-*.test.ts`). Los otros tres —U5 ámbito de brief, U6 ámbito de
 * feedback y U10 alertas de no-show— ya tenían prueba contra Postgres real,
 * escrita por las pistas que arreglaron cada fallo: `brief-scope.test.ts`,
 * `feedback-scope.test.ts` y `no-show-alert-scope.test.ts`.
 *
 * Reescribirlos aquí no añadiría cobertura, solo una segunda copia que se
 * queda atrás. Lo que sí hace falta es que no puedan desaparecer sin que nadie
 * se entere: si alguien retira uno de esos ficheros, o deja de llamar a la
 * función que la historia nombra, la batería se queda con un agujero y ninguna
 * prueba lo dice. Este fichero es ese aviso.
 *
 * No sustituye a esos tests: comprueba que siguen ahí y sobre qué.
 */

const COVERED_ELSEWHERE = [
  {
    caso: "U5 · ámbito de brief",
    file: "src/lib/brief-scope.test.ts",
    // La historia pide exactamente esto: `getSessionBrief` devuelve null fuera
    // del ámbito de centro.
    mustCall: ["getSessionBrief", "briefScopeWhere"],
    mustAssert: "null",
  },
  {
    caso: "U6 · ámbito de feedback",
    file: "src/lib/feedback-scope.test.ts",
    mustCall: ["listMemberFeedback", "getWeeklyDebriefReport"],
    mustAssert: "null",
  },
  {
    caso: "U10 · alertas de no-show",
    file: "src/lib/no-show-alert-scope.test.ts",
    mustCall: ["notifyConsecutiveNoShows", "CONSECUTIVE_NO_SHOW_THRESHOLD"],
    mustAssert: "assert",
  },
] as const;

for (const { caso, file, mustCall, mustAssert } of COVERED_ELSEWHERE) {
  test(`${caso} · sigue cubierto en ${file}, contra la base real`, () => {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      assert.fail(`${file} ya no existe: ${caso} se ha quedado sin prueba y la batería de E7-07 tiene un hueco`);
    }

    assert.ok(
      source.includes('from "@/lib/prisma"'),
      `${file} tiene que seguir probando contra Postgres real: el fallo que cubre solo se ve en lo que queda escrito`
    );
    for (const fn of mustCall) {
      assert.ok(source.includes(fn), `${file} ya no ejercita ${fn}, que es lo que ${caso} pide`);
    }
    assert.ok(source.includes(mustAssert));
  });
}

test("los siete casos escritos en esta pista siguen presentes", () => {
  // Un índice legible: quien llegue a E7-07 dentro de seis meses no tiene que
  // deducir qué caso vive en qué fichero.
  const bateria = {
    "U1 · agenda-delete": "src/lib/e7-07-agenda-delete.test.ts",
    "U2 · máquina de estados de Booking": "src/lib/e7-07-booking-states.test.ts",
    "U3 · ventana de cancelación del socio": "src/lib/e7-07-cancel-window.test.ts",
    "U4 · zona horaria": "src/lib/e7-07-cancel-window.test.ts",
    "U7 · ocupación con series": "src/lib/e7-07-occupancy-waitlist.test.ts",
    "U8 · lista de espera": "src/lib/e7-07-occupancy-waitlist.test.ts",
    "U9 · entitlements": "src/lib/e7-07-entitlements-ia.test.ts",
  };

  for (const [caso, file] of Object.entries(bateria)) {
    const source = readFileSync(file, "utf8");
    const id = caso.split(" ·")[0];
    assert.ok(source.includes(`${id} ·`), `${file} ya no declara ningún test de ${caso}`);
  }
});
