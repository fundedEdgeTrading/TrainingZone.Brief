/**
 * E7-04 · publica la cobertura de la app donde se lee sin descargar nada.
 *
 * `jest --coverage` ya la imprime en el log del job, pero ahí hay que ir a
 * buscarla: se escribe también en el resumen del workflow, que es la primera
 * pantalla que se abre cuando CI termina. Una cobertura que hay que descargar
 * como artefacto para verla es una cobertura que nadie mira, y una métrica que
 * nadie mira no dirige ninguna decisión.
 *
 * No falla nunca por el contenido: los umbrales los aplica Jest (ver
 * `coverageThreshold` en jest.config.js). Esto solo informa. Si el resumen no
 * existe —porque la ejecución se cortó antes— lo dice y sale con 0, para no
 * convertir un problema de informe en un job en rojo.
 */
import { readFileSync, appendFileSync } from "node:fs";

const SUMMARY = "coverage/coverage-summary.json";
/** Las cuatro carpetas con umbral por ruta, más las pantallas. */
const GROUPS = ["src/api", "src/auth", "src/components", "src/utils", "src/app"];

function pct(part) {
  return part.total ? (100 * part.covered) / part.total : 100;
}

function main() {
  let data;
  try {
    data = JSON.parse(readFileSync(SUMMARY, "utf8"));
  } catch {
    console.log(`No hay ${SUMMARY}: este paso va después de "jest --coverage".`);
    return;
  }

  const totals = new Map(
    GROUPS.map((g) => [g, { lines: { covered: 0, total: 0 }, branches: { covered: 0, total: 0 } }])
  );
  for (const [file, entry] of Object.entries(data)) {
    if (file === "total") continue;
    const group = GROUPS.find((g) => file.includes(`/${g}/`));
    if (!group) continue;
    for (const key of ["lines", "branches"]) {
      totals.get(group)[key].covered += entry[key].covered;
      totals.get(group)[key].total += entry[key].total;
    }
  }

  const markdown = [
    "### Cobertura de la app móvil",
    "",
    "| Carpeta | Líneas | Ramas |",
    "| --- | ---: | ---: |",
    ...GROUPS.map((g) => {
      const t = totals.get(g);
      return `| \`${g}\` | ${pct(t.lines).toFixed(1)} % | ${pct(t.branches).toFixed(1)} % |`;
    }),
    `| **total** | **${pct(data.total.lines).toFixed(1)} %** | **${pct(data.total.branches).toFixed(1)} %** |`,
    "",
    "Objetivo de la historia: 60 % de líneas y ramas en `src/api`, `src/auth`, `src/utils` y",
    "`src/components`; después, 80 % en `src/api` y `src/auth`. Los umbrales vigentes son el",
    "suelo de lo ya conseguido (`coverageThreshold` en `jest.config.js`), no el objetivo.",
    "",
  ].join("\n");

  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

main();
