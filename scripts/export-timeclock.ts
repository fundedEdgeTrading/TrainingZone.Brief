import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { prisma } from "@/lib/prisma";
import {
  buildTimeClockCsv,
  collectTimeClockEntries,
  TIMECLOCK_RETENTION_YEARS,
} from "@/lib/timeclock-export";

/**
 * E10-21 · Exporta los fichajes ANTES de retirar el modelo.
 *
 * `npm run export:fichajes` — un CSV por organización en `./exports/fichajes/`.
 * Apagar la funcionalidad no apaga la obligación: el plazo de cuatro años del
 * art. 34.9 ET sigue corriendo aunque la pantalla desaparezca, así que este
 * fichero es lo que hay que archivar antes de tocar el esquema.
 *
 * El destino se puede cambiar con TIMECLOCK_EXPORT_DIR. No se sube al
 * repositorio: son datos personales de los trabajadores.
 */
async function main() {
  const outDir = process.env.TIMECLOCK_EXPORT_DIR || path.join(process.cwd(), "exports", "fichajes");
  await mkdir(outDir, { recursive: true });

  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true, name: true } });
  let total = 0;

  for (const org of orgs) {
    const rows = await collectTimeClockEntries(org.id);
    if (rows.length === 0) continue;

    const file = path.join(outDir, `fichajes-${org.slug}.csv`);
    await writeFile(file, buildTimeClockCsv(rows), "utf8");
    total += rows.length;
    console.info(`[E10-21] ${org.name}: ${rows.length} fichajes → ${file}`);
  }

  if (total === 0) {
    console.info("[E10-21] No hay ningún fichaje registrado: no hay nada que conservar.");
    return;
  }

  console.info(
    `[E10-21] ${total} fichajes exportados. Consérvalos ${TIMECLOCK_RETENTION_YEARS} años ` +
      "(art. 34.9 ET, RDL 8/2019) ANTES de retirar el modelo TimeClockEntry del esquema.",
  );
}

main()
  .catch((error) => {
    console.error("[E10-21] La exportación falló:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
