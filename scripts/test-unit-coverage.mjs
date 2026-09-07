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

const args = [
  "--test",
  "--experimental-test-coverage",
  // Ni los propios tests ni sus andamios: la cobertura que interesa es la del
  // código que se envía, y un fichero de fixtures siempre sale al 100 % por
  // definición —lo ejecuta el test que lo usa— así que solo diluye el número.
  "--test-coverage-exclude=**/*.test.ts",
  "--test-coverage-exclude=**/e7-07-fixture.ts",
  ...testFiles("src"),
];

const child = spawn("tsx", args, { stdio: ["inherit", "pipe", "inherit"], shell: process.platform === "win32" });

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

  const markdown = [
    "### Cobertura de la web (`npm run test:unit`)",
    "",
    "```",
    all.trim() || "sin datos",
    "```",
    "",
    "Medida con la cobertura experimental de `node:test` sobre el cargador de tsx",
    "(sin c8: el mapeo de fuentes funciona). Sin umbral: primero se mide, y cuando",
    "el número dirija alguna decisión se discute exigirlo.",
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
