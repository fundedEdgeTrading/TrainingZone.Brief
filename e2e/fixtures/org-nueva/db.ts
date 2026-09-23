import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Conexión propia del spec de regresión, con el mismo patrón que
 * `alta-completa-gimnasio.spec.ts`: el proceso de Playwright no es el servidor
 * Next y abre su propio cliente contra `DATABASE_URL` (que `playwright.config.ts`
 * carga de `.env`). Se crea perezosamente para que importar el fichero en un
 * entorno sin base de datos —el recorrido saltado sin E2E_CLEAN_DB— no abra
 * ninguna conexión.
 */
let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Falta DATABASE_URL: el recorrido necesita una base de datos desechable.");
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return client;
}

export async function disconnectDb() {
  await client?.$disconnect();
  client = null;
}

/** Slug y usuario del seed de demo: si aparecen, esta NO es una base limpia. */
const SEED_ORG_SLUG = "training-zone";
const SEED_OWNER_EMAIL = "direccion@trainingzone.es";

/**
 * Segunda barrera contra la base de datos de demo, después de E2E_CLEAN_DB. El
 * recorrido crea organizaciones, socios y cobros de verdad; lanzado por error
 * contra la base compartida la contaminaría para el resto de sesiones.
 *
 * `requireEmpty` exige que no haya NINGUNA organización (el recorrido principal
 * parte de cero y cuenta centros y canales de la suya); el bloque de Stripe solo
 * exige que no esté el seed, para poder lanzarse sobre la misma base después
 * del principal.
 */
export async function assertCleanDatabase({ requireEmpty }: { requireEmpty: boolean }) {
  const prisma = db();
  const seedOrg = await prisma.organization.findUnique({ where: { slug: SEED_ORG_SLUG }, select: { id: true } });
  const seedUser = await prisma.identity.findUnique({ where: { email: SEED_OWNER_EMAIL }, select: { id: true } });
  if (seedOrg || seedUser) {
    throw new Error(
      "La base de datos tiene el seed de demo: este recorrido solo corre contra una base limpia " +
        "(`npx prisma migrate deploy` sobre una base vacía, SIN `db:seed`)."
    );
  }
  if (requireEmpty) {
    const orgs = await prisma.organization.count();
    if (orgs !== 0) {
      throw new Error(
        `La base de datos no está vacía (${orgs} organizaciones). Recréala antes de lanzar el recorrido: ` +
          "DROP DATABASE … / CREATE DATABASE … y `npx prisma migrate deploy`."
      );
    }
  }
}
