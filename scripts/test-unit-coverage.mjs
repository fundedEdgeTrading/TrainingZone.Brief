/**
 * E7-05 · `npm run test:unit`, pero midiendo cobertura y publicándola.
 *
 * `npm run test:unit` es `tsx --test` sin flags: ejecuta 945 pruebas y no mide
 * nada, así que nadie sabe qué parte de la web está cubierta ni dónde merece la
 * pena escribir la siguiente.
 *
 * **Se comprobó lo que pedía la historia, en este orden.** La cobertura
 * experimental de `node:test` SÍ funciona con el cargador de tsx: el informe
 * sale con los ficheros `.ts` originales y con números de línea del fuente, no
 * del JavaScript transpilado (verificado con `src/lib/waitlist.ts`, que señala
 * las líneas exactas sin cubrir). Como funciona, **no se añade c8**: la
 * alternativa de la historia era para el caso de que el mapeo de fuentes fallase,
 * y meter una dependencia más para resolver un problema que no existe es deuda.
 *
 * Sin umbral, a propósito y como pide la historia: esto informa. Un número que
 * todavía nadie ha mirado no puede empezar rompiendo el build de los demás.
 *
 * Salida: el mismo código que el runner, para que un test en rojo siga siendo
 * un job en rojo. Solo el informe es opcional.
 */
import { spawn } from "node:child_process";
import { appendFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Los mismos ficheros que `npm run test:unit`, sin depender de `find`. */
function testFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...testFiles(path));
    else if (entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

/**
 * `--test-coverage-exclude` existe desde Node 22.5. CI corre Node 20 (ver
 * `node-version` en el workflow), donde Node RECHAZA el proceso entero con
 * "bad option" en vez de ignorar la bandera: pasarla sin comprobar dejó el job
 * en rojo aunque los tests estuvieran verdes.
 *
 * Así que se detecta el runtime en vez de darlo por hecho. Sin exclusiones el
 * informe sigue sirviendo para lo que pide la historia —ver qué módulo está sin
 * probar y decidir dónde escribir el siguiente test, que se lee fichero a
 * fichero—, pero el TOTAL queda inflado porque cuenta también los ficheros de
 * prueba, que están cubiertos por definición. Cuando pasa, el resumen lo dice
 * en vez de publicar un número que aparenta más de lo que hay.
 */
const [major, minor] = process.versions.node.split(".").map(Number);
const supportsExclude = major > 22 || (major === 22 && minor >= 5);

const args = [
  "--test",
  "--experimental-test-coverage",
  // Ni los propios tests ni sus andamios: la cobertura que interesa es la del
  // código que se envía, y un fichero de fixtures siempre sale al 100 % por
  // definición —lo ejecuta el test que lo usa— así que solo diluye el número.
  ...(supportsExclude ? ["--test-coverage-exclude=**/*.test.ts", "--test-coverage-exclude=**/e7-07-fixture.ts"] : []),
  ...testFiles("src"),
];

/**
 * Se lanza `process.execPath` con el CLI de tsx como argumento, en vez del
 * envoltorio `tsx` del PATH. El envoltorio arranca con `#!/usr/bin/env node`, o
 * sea con el PRIMER node del PATH, que no tiene por qué ser este: y como quien
 * consume la bandera de arriba es el proceso hijo, la comprobación de versión
 * estaría mirando un runtime distinto del que decide. Así son el mismo, por
 * construcción.
 */
const TSX_CLI = new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;

const child = spawn(process.execPath, [TSX_CLI, ...args], { stdio: ["inherit", "pipe", "inherit"] });

let buffered = "";
child.stdout.on("data", (chunk) => {
  const text = String(chunk);
  buffered += text;
  process.stdout.write(text);
});

child.on("close", (code) => {
  publish(buffered);
  process.exit(code ?? 1);
});

/** El bloque de cobertura que imprime node:test, al resumen del workflow. */
function publish(output) {
  const start = output.indexOf("# start of coverage report");
  const end = output.indexOf("# end of coverage report");
  if (start === -1 || end === -1) {
    console.log("\nSin informe de cobertura en la salida: la ejecución no llegó a terminarlo.");
    return;
  }

  // Las líneas del informe vienen prefijadas con "# " (son comentarios TAP).
  const report = output
    .slice(start, end)
    .split("\n")
    .slice(1)
    .map((line) => line.replace(/^# ?/, ""))
    .join("\n")
    .trimEnd();

  // Solo el total y las carpetas de primer nivel: el informe entero son cientos
  // de ficheros y en el resumen no se lee. El detalle sigue en el log del job.
  const all = report.split("\n").find((line) => line.startsWith("all files")) ?? "";

  const nota = supportsExclude
    ? "Medida con la cobertura experimental de `node:test` sobre el cargador de tsx (sin c8: el mapeo de fuentes funciona)."
    : [
        `**El total de arriba está inflado**: este runtime es Node ${process.versions.node} y`,
        "`--test-coverage-exclude` necesita 22.5, así que los ficheros de prueba cuentan dentro",
        "(y están cubiertos por definición). El detalle por fichero de abajo sí es fiable, que es",
        "lo que sirve para decidir dónde escribir el siguiente test. Con Node ≥ 22.5 el total sale limpio.",
      ].join("\n");

  const markdown = [
    "### Cobertura de la web (`npm run test:unit`)",
    "",
    "```",
    all.trim() || "sin datos",
    "```",
    "",
    nota,
    "",
    "Sin umbral: primero se mide, y cuando el número dirija alguna decisión se discute exigirlo.",
    "",
    "<details><summary>Informe completo por fichero</summary>",
    "",
    "```",
    report,
    "```",
    "",
    "</details>",
    "",
  ].join("\n");

  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
