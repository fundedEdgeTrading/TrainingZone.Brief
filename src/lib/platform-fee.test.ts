import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * HU-ST-28 · Comisión de plataforma **documentada, NO activada**.
 *
 * Esta historia no es código: es una afirmación comercial —"cero comisión sobre
 * tus cobros" (E6-05)— que tiene que ser verdad, y este fichero es la
 * comprobación. Apta usa Connect Standard con **cargos directos**
 * (`Stripe-Account: acct_…`), así que el dinero del socio nace en la cuenta del
 * gimnasio y Apta solo podría quedarse una parte pidiéndoselo a Stripe
 * explícitamente. Lo que se prueba aquí es que **no se lo pide en ningún sitio**.
 *
 * Se vigilan las dos vías, no solo la famosa:
 *
 *  - `application_fee_amount` (cobro puntual) y `application_fee_percent`
 *    (suscripción: el importe de cada factura no se conoce por adelantado, así
 *    que la comisión recurrente se expresa en porcentaje). Olvidar la segunda
 *    dejaría la afirmación falsa justo donde está el dinero recurrente.
 *  - `transfer_data` / `on_behalf_of`, que son *destination charges*: la otra
 *    forma de quedarse con parte del cobro, y además convertiría a Apta en
 *    comerciante de registro.
 *
 * El razonamiento, dónde se insertaría cada una y qué implicaciones fiscales
 * tendría, en `docs/hu/HU-ST-28-comision-de-plataforma.md`. Ese documento
 * también se comprueba aquí: borrarlo sin sustituirlo pone CI en rojo.
 */

/** Las claves con las que Apta se quedaría con parte del dinero del gimnasio. */
const COMMISSION_KEYS = [
  "application_fee_amount",
  "application_fee_percent",
  "refund_application_fee",
  "transfer_data",
  "on_behalf_of",
];

const DOC = "docs/hu/HU-ST-28-comision-de-plataforma.md";

/**
 * Fuentes de producción. Se excluyen los tests (este fichero nombra las claves
 * por obligación) y `node_modules` —la app móvil tiene el suyo—.
 */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".expo") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const PRODUCTION_SOURCES = [...sourceFiles("src"), ...(existsSync("apps") ? sourceFiles("apps") : [])];

// ---------------------------------------------------------------------------
// Escenario "por defecto": no se envía application_fee_amount
// ---------------------------------------------------------------------------

test("HU-ST-28 · ninguna creación de checkout envía comisión de plataforma", () => {
  // Las creaciones de sesión de checkout, localizadas por la llamada y no por
  // una lista escrita a mano: una puerta de venta nueva entra sola en el test.
  const callSites: { file: string; window: string }[] = [];
  for (const file of PRODUCTION_SOURCES) {
    const source = readFileSync(file, "utf8");
    const pattern = /checkout\.sessions\.create\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      // El cuerpo de la petición va entre la llamada y las opciones; se toma
      // holgado para que entre entero, comentarios incluidos.
      callSites.push({ file, window: source.slice(match.index, match.index + 3000) });
    }
  }

  // Sin esta comprobación el test pasaría en verde el día que alguien renombre
  // o mueva las creaciones: verde por no encontrar nada no es verde.
  assert.ok(
    callSites.length >= 3,
    `Se esperaban al menos las 3 creaciones de checkout conocidas (socio, prospecto, licencia) y se encontraron ${callSites.length}: ¿han cambiado de forma?`
  );

  for (const { file, window } of callSites) {
    for (const key of COMMISSION_KEYS) {
      assert.equal(
        window.includes(key),
        false,
        `${file}: una creación de checkout envía \`${key}\`. Apta no toca el dinero del gimnasio (D-9); ver ${DOC}.`
      );
    }
  }
});

test("HU-ST-28 · tampoco la envía ninguna otra creación contra Stripe", () => {
  // Suscripciones y PaymentIntents creados fuera de un checkout: la comisión
  // recurrente (`application_fee_percent`) viviría ahí.
  const offenders: string[] = [];
  for (const file of PRODUCTION_SOURCES) {
    const source = readFileSync(file, "utf8");
    for (const key of COMMISSION_KEYS) {
      if (source.includes(key)) offenders.push(`${file} → ${key}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `"Cero comisión sobre tus cobros" (E6-05) dejaría de ser cierto: ${offenders.join(", ")}`
  );
});

// ---------------------------------------------------------------------------
// "NO activada" es literal: tampoco hay bandera que la active
// ---------------------------------------------------------------------------

test("HU-ST-28 · no existe una bandera de configuración que active la comisión", () => {
  // Una bandera a `false` es una comisión activada que todavía no se ha
  // encendido: convertiría "cero comisión" en "cero comisión por ahora", que es
  // exactamente el matiz que la historia pide no tener.
  const suspicious = /(APPLICATION_FEE|PLATFORM_FEE|COMMISSION|COMISION)/i;

  const envExample = readFileSync(".env.example", "utf8")
    .split("\n")
    .filter((line) => /^\s*[A-Z0-9_]+\s*=/.test(line) && suspicious.test(line));
  assert.deepEqual(envExample, [], "hay una variable de entorno de comisión en .env.example");

  const offenders = PRODUCTION_SOURCES.filter((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].some((m) => suspicious.test(m[1]));
  });
  assert.deepEqual(offenders, [], `el código lee una variable de entorno de comisión: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Escenario "documentación" y escenario "argumento de venta"
// ---------------------------------------------------------------------------

test("HU-ST-28 · queda escrito dónde se insertaría y qué implicaciones fiscales tendría", () => {
  assert.ok(existsSync(DOC), `falta ${DOC}: la historia pide que quede escrito, no solo que no esté activado`);
  const doc = readFileSync(DOC, "utf8");

  // Dónde se insertaría: las dos vías, cada una en su sitio.
  assert.match(doc, /application_fee_amount/, "falta dónde iría la comisión del cobro puntual");
  assert.match(doc, /application_fee_percent/, "falta dónde iría la comisión de la cuota recurrente");
  assert.match(doc, /member-billing\.ts/, "falta el fichero concreto donde se insertaría");

  // Qué implicaciones fiscales tendría.
  assert.match(doc, /IVA/, "falta la implicación de IVA");
  assert.match(doc, /349|inversión del sujeto pasivo/i, "falta el tratamiento del cliente intracomunitario");
  assert.match(doc, /VERI\\?\*?FACTU/, "falta la implicación de facturación certificada");
  assert.match(doc, /refund_application_fee/, "falta qué pasa con la comisión al devolver un cobro");

  // Y que sigue diciendo que NO está activada.
  assert.match(doc, /NO activada/, "el documento tiene que seguir afirmando que no está activada");
});

test("E6-05 · «cero comisión sobre tus cobros» se puede afirmar sin matices", () => {
  // La frase vive en /planes (E6-05) y su veracidad es esta historia. Se
  // comprueban las dos mitades juntas para que nadie pueda cambiar una sin
  // enterarse de la otra.
  const planes = ["src/app/planes/hero.tsx", "src/app/planes/page.tsx"]
    .filter(existsSync)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.match(planes, /Cero comisión sobre tus cobros/, "E6-05: la frase tiene que seguir en /planes");

  // Sin asterisco ni "por ahora" pegados a la frase: el matiz que la historia
  // prohíbe sería justamente una nota al pie.
  const conMatiz = /Cero comisión sobre tus cobros\s*[*†]/;
  assert.equal(conMatiz.test(planes), false, "la afirmación no lleva letra pequeña porque no le hace falta");
});
