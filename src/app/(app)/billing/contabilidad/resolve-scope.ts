import { prisma } from "@/lib/prisma";
import { centerScopeFor, type ScopedUser } from "@/lib/center-scope";
import { centerIsInScope } from "@/lib/guard";

/**
 * Ámbito de centro de la pantalla de contabilidad, resuelto en UN solo sitio
 * porque lo usan las dos superficies que sacan datos de aquí: el render y las
 * acciones de descarga. Si cada una lo resolviera por su cuenta, la de descarga
 * acabaría exportando lo que la pantalla no enseña — que es exactamente la fuga
 * que un CSV no puede permitirse.
 *
 * `centerIds === undefined` es "sin frontera" (dirección de organización), igual
 * que en el resto de Cobros. Un `?centerId=` escrito a mano NUNCA amplía: se
 * cruza contra los centros de la organización Y contra el ámbito real de quien
 * mira, y si no pasa las dos, se ignora.
 */
export type AccountingScope = {
  /** Centros que esta persona puede elegir en el selector. */
  centers: { id: string; name: string }[];
  /** El centro elegido, ya validado. `null` = sin filtrar dentro del ámbito. */
  centerId: string | null;
  /** Lo que se pasa a las consultas. `undefined` = toda la organización. */
  centerIds: string[] | undefined;
  scopeLabel: string;
  orgWide: boolean;
};

export async function resolveAccountingScope(
  user: ScopedUser,
  requestedCenterId?: string | null
): Promise<AccountingScope> {
  const scope = await centerScopeFor(user);

  const centers = await prisma.center.findMany({
    where: { orgId: user.orgId, ...(scope !== null ? { id: { in: scope } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let centerId: string | null = null;
  if (requestedCenterId) {
    // Dos comprobaciones, no una: `isCenterInScope` deja pasar cualquier centro
    // cuando el ámbito es "toda la organización", así que la pertenencia a la
    // organización se comprueba aparte. Sin eso, un `?centerId=` de OTRA
    // organización pasaría el filtro.
    const enLaOrganizacion = centers.some((c) => c.id === requestedCenterId);
    if (enLaOrganizacion && (await centerIsInScope(user, requestedCenterId))) {
      centerId = requestedCenterId;
    }
  }

  const centerIds = centerId ? [centerId] : (scope ?? undefined);
  const orgWide = centerIds === undefined;
  const elegido = centers.find((c) => c.id === centerId);

  return {
    centers,
    centerId,
    centerIds,
    orgWide,
    scopeLabel: elegido
      ? elegido.name
      : orgWide
        ? "Toda la organización"
        : centers.map((c) => c.name).join(", ") || "Sin centros asignados",
  };
}
