import "dotenv/config";

import { prisma } from "@/lib/prisma";
import {
  FLOW_SEEDS,
  FLOW_SEEDS_PRIORITARIAS,
  seedFlows,
  type FlowSeedOutcome,
  type FlowSeedReport,
} from "@/lib/flows/seeds";

/**
 * SIEMBRA LOS FLUJOS DE SALIDA (E14-35) EN LOS CENTROS DE UNA ORGANIZACIÓN.
 *
 *   npx tsx scripts/sembrar-flujos.ts <slug-de-la-organizacion> [--solo-prioritarios] [--simulacro]
 *
 * TODO LO QUE SIEMBRA NACE EN BORRADOR. Un flujo en borrador se ejecuta de
 * verdad —entra gente, la cola avanza, las tareas se abren— pero TODO envío va
 * al buzón de pruebas de la organización, nunca al socio. Encenderlo es un gesto
 * aparte, de una persona, en la pantalla del flujo. Sembrar no puede ser lo
 * mismo que empezar a escribirle a cuarenta y nueve socios.
 *
 * ES IDEMPOTENTE. Cada flujo se reconoce por `Flow.seedKey` (la clave de la
 * semilla más el centro), así que volver a ejecutarlo no duplica nada ni pisa el
 * texto que el centro haya editado por su cuenta.
 *
 * `--simulacro` no escribe: dice qué se sembraría y, sobre todo, IMPRIME LOS
 * AVISOS, que es la mitad del valor de esto. Un flujo sembrado sobre una
 * etiqueta que no existe no falla: simplemente no le entra nadie nunca, y eso es
 * lo peor que puede pasar porque parece que funciona.
 */
async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  const soloPrioritarios = args.includes("--solo-prioritarios");
  const simulacro = args.includes("--simulacro");

  if (!slug) {
    console.error("Falta el slug de la organización.\n  npx tsx scripts/sembrar-flujos.ts <slug> [--solo-prioritarios] [--simulacro]");
    process.exitCode = 1;
    return;
  }

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, centers: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
  });
  if (!org) {
    console.error(`No hay ninguna organización con el slug «${slug}».`);
    process.exitCode = 1;
    return;
  }

  const seeds = soloPrioritarios ? FLOW_SEEDS_PRIORITARIAS : FLOW_SEEDS;
  console.log(`\n${org.name} · ${org.centers.length} ${org.centers.length === 1 ? "centro" : "centros"}`);
  console.log(`${seeds.length} semillas${soloPrioritarios ? " (solo las prioritarias del corte de alcance)" : ""}`);
  if (simulacro) console.log("SIMULACRO: no se escribe nada.\n");

  for (const center of org.centers) {
    const report = await seedFlows(org.id, center.id, { seeds, dryRun: simulacro });
    imprime(report);
  }

  console.log(
    "\nTodo lo sembrado está en BORRADOR: se ejecuta, pero escribe al buzón de pruebas. Enciéndelo desde /flujos " +
      "cuando hayas leído los avisos de arriba."
  );
}

const ESTADO: Record<FlowSeedOutcome["status"], string> = {
  sembrado: "sembrado      ",
  "ya-estaba": "ya estaba     ",
  "se-sembraria": "se sembraría  ",
  invalido: "INVÁLIDO      ",
};

function imprime(report: FlowSeedReport) {
  console.log(`\n${"─".repeat(72)}`);
  console.log(report.centerName);
  console.log("─".repeat(72));

  for (const outcome of report.outcomes) {
    const detalle = outcome.status === "invalido" ? ` — ${outcome.error}` : "";
    console.log(`  ${ESTADO[outcome.status]} ${outcome.name}${detalle}`);
  }

  if (report.avisos.length === 0) return;
  console.log(`\n  MIRA ESTO ANTES DE ENCENDER (${report.avisos.length}):`);
  for (const aviso of report.avisos) console.log(`   · ${aviso}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
