import test from "node:test";
import assert from "node:assert/strict";
import { parseImportPriceCents, parseMembersCsv } from "./member-import";

/**
 * La importación de socios que ya pagan es la operación con más dinero en juego
 * del producto: un importe mal leído no da error, cobra una cifra equivocada
 * todos los meses hasta que alguien se queja. De ahí que el foco esté en el
 * parseo de importes y en la idempotencia de las cabeceras, no en el CSV feliz.
 */

test("parseImportPriceCents entiende el formato español y el anglosajón", () => {
  assert.equal(parseImportPriceCents("45"), 4500);
  assert.equal(parseImportPriceCents("45,00 €"), 4500);
  assert.equal(parseImportPriceCents("45.00"), 4500);
  assert.equal(parseImportPriceCents("  39,90  "), 3990);
  assert.equal(parseImportPriceCents("€ 39,90"), 3990);
});

test("parseImportPriceCents no confunde el separador de millares con el decimal", () => {
  // El caso que cobra mil veces de más: en «1.234,56» el punto es de millar.
  assert.equal(parseImportPriceCents("1.234,56"), 123456);
  assert.equal(parseImportPriceCents("1,234.56"), 123456);
  assert.equal(parseImportPriceCents("1234.56"), 123456);
  assert.equal(parseImportPriceCents("1234,56"), 123456);
});

test("parseImportPriceCents rechaza lo que no es un importe", () => {
  assert.equal(parseImportPriceCents(null), null);
  assert.equal(parseImportPriceCents(""), null);
  assert.equal(parseImportPriceCents("gratis"), null);
  assert.equal(parseImportPriceCents("-10"), null, "un precio negativo no es un descuento, es un error");
});

test("una fila con plan trae su cuota", () => {
  const csv = [
    "Nombre;Apellidos;Email;Plan;Cuota;Fecha de alta de la cuota",
    "Marta;García;marta@example.com;Mensual Ilimitado;45,00 €;01/03/2024",
  ].join("\n");

  const { rows, fatalError } = parseMembersCsv(csv);
  assert.equal(fatalError, null);
  assert.equal(rows.length, 1);

  const sub = rows[0].subscription;
  assert.ok(sub, "la columna Plan debe producir una suscripción");
  assert.equal(sub.planName, "Mensual Ilimitado");
  assert.equal(sub.priceCents, 4500);
  assert.equal(sub.startDate?.getFullYear(), 2024);
  assert.equal(rows[0].errors.length, 0);
});

test("sin columna de plan la importación sigue siendo la de antes", () => {
  const csv = ["Nombre;Apellidos;Email", "Marta;García;marta@example.com"].join("\n");
  const { rows } = parseMembersCsv(csv);
  assert.equal(rows[0].subscription, null);
  assert.equal(rows[0].errors.length, 0);
});

test("un plan sin importe hereda el precio de tarifa", () => {
  // priceCents null es la señal para que el server action use plan.priceCents;
  // no es un error, es el caso normal de quien paga la tarifa vigente.
  const csv = ["Nombre;Apellidos;Email;Plan", "Marta;García;marta@example.com;Mensual"].join("\n");
  const { rows } = parseMembersCsv(csv);
  assert.equal(rows[0].subscription?.priceCents, null);
  assert.equal(rows[0].errors.length, 0);
});

test("un importe ilegible no se traga en silencio", () => {
  const csv = ["Nombre;Apellidos;Email;Plan;Cuota", "Marta;García;marta@example.com;Mensual;a convenir"].join("\n");
  const { rows } = parseMembersCsv(csv);
  assert.equal(rows[0].errors.length, 1);
  assert.match(rows[0].errors[0], /Importe de cuota no válido/);
});

test("las cabeceras de cuota se reconocen con acentos y mayúsculas", () => {
  const csv = ["Nombre;Apellidos;Email;TARIFA;Importe cuota", "Marta;García;marta@example.com;Mensual;30"].join("\n");
  const { rows } = parseMembersCsv(csv);
  assert.equal(rows[0].subscription?.planName, "Mensual");
  assert.equal(rows[0].subscription?.priceCents, 3000);
});

test("las sesiones restantes de un bono deben ser un entero", () => {
  const csv = [
    "Nombre;Apellidos;Email;Plan;Sesiones restantes",
    "Marta;García;marta@example.com;Bono 10;7",
    "Nuria;Peña;nuria@example.com;Bono 10;tres",
  ].join("\n");
  const { rows } = parseMembersCsv(csv);
  assert.equal(rows[0].subscription?.sessionsRemaining, 7);
  assert.equal(rows[1].errors.length, 1);
  assert.match(rows[1].errors[0], /Sesiones restantes no válidas/);
});
