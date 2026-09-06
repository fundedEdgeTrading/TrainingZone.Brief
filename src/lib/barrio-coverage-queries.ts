import { prisma } from "@/lib/prisma";
import { emptyCoverage, type Coverage, type MapCoverage } from "@/lib/barrio-coverage";

/**
 * E11-05 · Cuánta gente NO está en el mapa.
 *
 * Vive en su propio módulo y no dentro de `dashboard-queries.ts` a propósito:
 * esa es una consulta de otra pista, y esto no necesita nada de ella — se
 * cuentan fichas, no se agregan barrios.
 *
 * `centerIds` es el ámbito de centro de quien mira (`center-scope.ts`), el mismo
 * que la agregación del mapa. Si el pie contara la organización entera mientras
 * el plano cuenta un solo centro, la frase mentiría en la dirección más
 * peligrosa: diría que falta gente que en realidad no debería salir.
 */
export async function getMapCoverage(orgId: string, opts: { centerIds?: string[] } = {}): Promise<MapCoverage> {
  const [areas, memberGroups, leadGroups] = await Promise.all([
    prisma.postalCodeArea.findMany({ select: { code: true } }),
    prisma.member.groupBy({
      by: ["postalCode"],
      where: { orgId, ...(opts.centerIds ? { primaryCenterId: { in: opts.centerIds } } : {}) },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["postalCode"],
      where: { orgId, ...(opts.centerIds ? { centerId: { in: opts.centerIds } } : {}) },
      _count: { _all: true },
    }),
  ]);

  const covered = new Set(areas.map((a) => a.code));
  return {
    members: tally(memberGroups, covered),
    leads: tally(leadGroups, covered),
  };
}

/** Reparte los recuentos por código postal en las tres cestas. */
function tally(
  groups: { postalCode: string | null; _count: { _all: number } }[],
  covered: Set<string>
): Coverage {
  const coverage = emptyCoverage();
  for (const group of groups) {
    const count = group._count._all;
    coverage.total += count;
    // Una cadena vacía es lo mismo que un nulo: el dato no está. Distinguirlos
    // solo serviría para partir en dos la misma tarea de recepción.
    const code = group.postalCode?.trim();
    if (!code) coverage.noPostalCode += count;
    else if (covered.has(code)) coverage.represented += count;
    else coverage.outsideCoverage += count;
  }
  return coverage;
}
