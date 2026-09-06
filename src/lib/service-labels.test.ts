import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SERVICE_LABEL, serviceLabel, serviceLabelLower } from "@/lib/service-labels";

/** Todos los ficheros de código de la web y de la app nativa. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".expo") continue;
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

test("E12-04 · fuente única: una sola definición para las ocho superficies", () => {
  const files = [...sourceFiles("src"), ...sourceFiles("apps/mobile/src")];
  // Una DEFINICIÓN es declarar la tabla; consumirla (importarla y leerla) no lo
  // es. Se buscan las dos formas con las que estaba duplicada: `SERVICE_LABEL`
  // y el `BALANCE_LABEL` de la app.
  const definition = /(?:const|let|var)\s+(?:SERVICE_LABEL|BALANCE_LABEL)\b/;
  const offenders = files.filter(
    (file) => file !== join("src", "lib", "service-labels.ts") && definition.test(readFileSync(file, "utf8"))
  );

  assert.deepEqual(
    offenders,
    [],
    `El rótulo de la modalidad se define fuera de src/lib/service-labels.ts: ${offenders.join(", ")}. ` +
      "Impórtalo de allí; ocho tablas con cuatro nombres es cómo el socio acabó creyendo que tenía dos productos."
  );
});

test("E12-04 · un único nombre por modalidad, en castellano", () => {
  assert.deepEqual(SERVICE_LABEL, {
    EP: "Entrenamiento personal",
    GROUP: "Grupos reducidos",
    ONLINE: "Online",
  });
  // Lo que recepción veía como "Personal Training" y la app como "Personal" es
  // lo mismo que el socio ve en su portal.
  assert.equal(serviceLabel("EP"), "Entrenamiento personal");
});

test("E12-04 · dentro de una frase es el mismo rótulo, no otro nombre", () => {
  assert.equal(serviceLabelLower("EP"), "entrenamiento personal");
  assert.equal(serviceLabelLower("GROUP"), "grupos reducidos");
  assert.equal(`Tu plan no incluye sesiones de ${serviceLabelLower("EP")}.`, "Tu plan no incluye sesiones de entrenamiento personal.");
});

test("E12-04 · una clave desconocida no pinta 'undefined' en pantalla", () => {
  assert.equal(serviceLabel("LO_QUE_SEA"), "LO_QUE_SEA");
});
