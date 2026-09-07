import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  formatZoneMigrationReport,
  migrateInjuryZones,
  totalUnmapped,
  type ZoneMigrationReport,
} from "../src/lib/injury-zone-migration";

/**
 * Migración de datos de E3-02: las zonas de lesión de texto libre pasan al
 * catálogo cerrado (`InjuryZone` + `Laterality`).
 *
 *   npm run db:migrate-injury-zones -- --dry-run   (solo informa)
 *   npm run db:migrate-injury-zones                (escribe)
 *
 * No es una migración de ESQUEMA (esa ya la dejó la sesión de costuras): es de
 * DATOS, y por eso vive aquí y no en `prisma/migrations/`. Es idempotente y se
 * puede repetir mientras se completa el mapeo declarado.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reports: ZoneMigrationReport[] = await migrateInjuryZones({ dryRun });

  for (const report of reports) console.log(formatZoneMigrationReport(report));

  const pending = reports.reduce((sum, r) => sum + totalUnmapped(r), 0);
  console.log(
    pending === 0
      ? "\nTodas las filas quedaron normalizadas."
      : `\n${pending} fila(s) SIN MAPEAR, marcadas para revisión manual. Ninguna se ha descartado.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
