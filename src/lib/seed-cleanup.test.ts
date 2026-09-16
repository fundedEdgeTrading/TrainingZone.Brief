import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * `npm run db:seed` empieza vaciando la base en UNA transacción y en un orden
 * escrito a mano. Cada modelo nuevo que otra pista añade al esquema con una FK
 * RESTRICT deja ese orden incompleto, y el fallo no aparece en CI —que arranca
 * siempre con la base recién migrada— sino en el local de quien resiembra:
 *
 *   update or delete on table "Organization" violates RESTRICT setting of
 *   foreign key constraint "MemberTagDefinition_orgId_fkey"
 *
 * Este test lee el esquema y la limpieza y comprueba las dos cosas que hacen
 * falta para que eso no vuelva a pasar: que ningún modelo se quede fuera, y que
 * cada hijo con FK bloqueante se borre ANTES que su padre.
 */

const schema = readFileSync("prisma/schema.prisma", "utf8");
const seed = readFileSync("prisma/seed.ts", "utf8");

/** El bloque `prisma.$transaction([...])` con el que arranca el seed. */
function cleanupBlock(): string {
  const start = seed.indexOf("prisma.$transaction([");
  assert.notEqual(start, -1, "el seed tiene que limpiar en una transacción");
  const end = seed.indexOf("], {", start);
  assert.notEqual(end, -1, "no se encuentra el final de la transacción de limpieza");
  return seed.slice(start, end);
}

/** Nombre de la propiedad del cliente Prisma para un modelo (`Member` → `member`). */
function clientProp(model: string): string {
  return model[0].toLowerCase() + model.slice(1);
}

type Relation = { target: string; blocking: boolean };

/** Modelos del esquema con sus relaciones salientes (las que llevan `fields:`). */
function parseModels(): Map<string, Relation[]> {
  const models = new Map<string, Relation[]>();
  const withoutComments = schema.replace(/^\s*\/\/\/?.*$/gm, "");
  const modelRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
  for (const [, name, body] of withoutComments.matchAll(modelRe)) {
    const relations: Relation[] = [];
    const relRe = /^\s*\w+\s+(\w+)(\?)?\s+@relation\(([^)]*)\)/gm;
    for (const [, target, optional, args] of body.matchAll(relRe)) {
      if (!args.includes("fields:")) continue; // el lado sin FK no borra nada
      const explicit = /onDelete:\s*(\w+)/.exec(args)?.[1];
      // Por defecto Prisma pone Restrict en la relación obligatoria y SetNull
      // en la opcional: solo la primera bloquea el borrado del padre.
      const action = explicit ?? (optional ? "SetNull" : "Restrict");
      relations.push({ target, blocking: action === "Restrict" || action === "NoAction" });
    }
    models.set(name, relations);
  }
  assert.ok(models.size > 50, "el esquema debería tener bastantes más modelos");
  return models;
}

test("la limpieza del seed borra todos los modelos del esquema", () => {
  const block = cleanupBlock();
  const faltan = [...parseModels().keys()].filter(
    (model) => !block.includes(`prisma.${clientProp(model)}.deleteMany(`)
  );
  assert.deepEqual(
    faltan,
    [],
    `modelos sin borrar en la limpieza de prisma/seed.ts: ${faltan.join(", ")}. ` +
      "Añádelos antes de sus padres o `npm run db:seed` fallará sobre una base ya sembrada."
  );
});

test("cada hijo con FK bloqueante se borra antes que su padre", () => {
  const block = cleanupBlock();
  const posicion = (model: string) => block.indexOf(`prisma.${clientProp(model)}.deleteMany(`);
  const errores: string[] = [];
  for (const [model, relations] of parseModels()) {
    for (const { target, blocking } of relations) {
      if (!blocking || target === model) continue;
      const hijo = posicion(model);
      const padre = posicion(target);
      if (hijo === -1 || padre === -1) continue; // lo cubre el test anterior
      if (hijo > padre) {
        errores.push(`${model} (hijo) se borra después de ${target} (padre)`);
      }
    }
  }
  assert.deepEqual(errores, [], `orden de borrado imposible:\n${errores.join("\n")}`);
});
