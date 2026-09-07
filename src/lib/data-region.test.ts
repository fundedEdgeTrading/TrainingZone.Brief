import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  checkDataRegion,
  DECLARED_DATA_REGION,
  isLocalDatabase,
  KNOWN_DATA_REGIONS,
  resolveDataRegion,
  THIRD_PARTY_PROCESSORS,
} from "./data-region";

const REMOTE_DB = "postgresql://u:p@db.internal.example.com:5432/tz";
const LOCAL_DB = "postgresql://postgres:postgres@localhost:5432/trainingzone";

/**
 * E10-07, escenario principal: el arranque comprueba la región y FALLA si no
 * es de la UE, en vez de arrancar y callarse. Una base de datos con
 * `HealthRecord` en Oregón es una transferencia internacional sin declarar.
 */
test("una región fuera del EEE detiene el arranque", () => {
  const result = checkDataRegion({ DATA_REGION: "oregon", DATABASE_URL: REMOTE_DB, NODE_ENV: "production" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "fuera_de_la_ue");
});

test("la región documentada pasa la verificación", () => {
  const result = checkDataRegion({
    DATA_REGION: DECLARED_DATA_REGION,
    DATABASE_URL: REMOTE_DB,
    NODE_ENV: "production",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.region?.eu, true);
});

/**
 * Escenario "cambio de región": mover la base de datos a otra región de la UE
 * tampoco pasa sin actualizar la documentación, porque lo documentado y lo
 * configurado son el mismo dato en dos sitios y tienen que coincidir.
 */
test("otra región de la UE distinta de la documentada también se para", () => {
  const result = checkDataRegion({ DATA_REGION: "eu-west-1", DATABASE_URL: REMOTE_DB, NODE_ENV: "production" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "no_coincide_con_lo_documentado");
});

test("una región que no está en la lista falla por desconocida, no por estar fuera", () => {
  const result = checkDataRegion({ DATA_REGION: "marte-1", DATABASE_URL: REMOTE_DB, NODE_ENV: "production" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "desconocida");
});

test("sin declarar región y con base de datos remota no se arranca", () => {
  const result = checkDataRegion({ DATABASE_URL: REMOTE_DB, NODE_ENV: "development" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "sin_declarar");
});

test("una base de datos local en desarrollo no obliga a declarar región", () => {
  const result = checkDataRegion({ DATABASE_URL: LOCAL_DB, NODE_ENV: "development" });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.local, true);
});

test("en producción ni siquiera una base de datos local se salta la declaración", () => {
  const result = checkDataRegion({ DATABASE_URL: LOCAL_DB, NODE_ENV: "production" });
  assert.equal(result.ok, false);
});

test("isLocalDatabase no se confía de una URL rara", () => {
  assert.equal(isLocalDatabase("no-es-una-url"), false);
  assert.equal(isLocalDatabase(undefined), false);
  assert.equal(isLocalDatabase(LOCAL_DB), true);
});

/** La región documentada tiene que existir y estar en la UE (decisión D-C1). */
test("la región documentada existe y está en la UE", () => {
  const region = resolveDataRegion(DECLARED_DATA_REGION);
  assert.ok(region, "DECLARED_DATA_REGION no está en KNOWN_DATA_REGIONS");
  assert.equal(region.eu, true);
});

/** Escenario "los demás proveedores": los seis, con ubicación y mecanismo. */
test("los seis proveedores declaran ubicación y mecanismo de transferencia", () => {
  const names = THIRD_PARTY_PROCESSORS.map((p) => p.name).join(" | ");
  for (const expected of ["Anthropic", "Stripe", "Brevo", "Expo", "Microsoft", "Google"]) {
    assert.match(names, new RegExp(expected), `falta ${expected}`);
  }
  for (const p of THIRD_PARTY_PROCESSORS) {
    assert.ok(p.location.trim().length > 0, `${p.name} sin ubicación`);
    assert.ok(p.transferMechanism.trim().length > 0, `${p.name} sin mecanismo`);
  }
});

test("no hay códigos de región duplicados con veredicto distinto", () => {
  const byCode = new Map<string, boolean>();
  for (const r of KNOWN_DATA_REGIONS) {
    const seen = byCode.get(r.code);
    assert.ok(seen === undefined, `código duplicado: ${r.code}`);
    byCode.set(r.code, r.eu);
  }
});
