import { prisma } from "@/lib/prisma";
import { canAddCenter, centerLimitFor } from "@/lib/entitlements";

export type CenterInput = {
  name: string;
  slug: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  logoUrl: string | null;
};

/**
 * QA-ALTA-18 · RB-PLAN-002 sin carrera. `canAddCenter` contaba y el alta
 * insertaba después, en dos pasos sueltos: dos altas a la vez (doble clic, dos
 * pestañas) leían las dos "te queda uno" y se quedaban las dos. El número de
 * centros es lo que se paga, así que eso es regalar un tramo del plan.
 *
 * La fila de la organización se bloquea (`FOR UPDATE`, el mismo patrón que
 * `ClassSession` en las reservas) y se cuenta e inserta dentro de esa misma
 * transacción: la segunda alta espera a que la primera confirme y ya la cuenta.
 * Se prefiere al aislamiento serializable porque no obliga a reintentar.
 *
 * El mensaje de rechazo sigue saliendo de `canAddCenter`, que es quien sabe
 * explicar la salida concreta (cambiar de plan o precio a medida).
 */
export async function createCenterWithinLimit(
  orgId: string,
  input: CenterInput
): Promise<{ ok: true; centerId: string } | { ok: false; error: string }> {
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { platformPlan: true, platformStatus: true },
    });
    if (!org) return null;
    const limit = centerLimitFor(org);
    if (limit !== null && (await tx.center.count({ where: { orgId } })) >= limit) return null;
    return tx.center.create({ data: { orgId, ...input }, select: { id: true } });
  });
  if (created) return { ok: true, centerId: created.id };

  const allowed = await canAddCenter(orgId);
  return { ok: false, error: allowed.ok ? "Has llegado al límite de centros de tu plan." : allowed.error };
}
