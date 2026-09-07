import { prisma } from "@/lib/prisma";
import type { InjuryZone } from "@prisma/client";
import { centerScopeFor, type ScopedUser } from "@/lib/center-scope";
import { OPEN_HEALTH_STATUSES } from "@/lib/health-status";
import { ruleMatchesRecord, type ZonedRule } from "@/lib/injury-zones";

/**
 * "Esta regla afecta hoy a N socios" (E3-04).
 *
 * Para qué sirve: si una regla sale con 0 socios en una zona donde SÍ hay
 * lesiones registradas, la regla está mal escrita — y hasta ahora eso no se veía
 * de ninguna manera. Con el emparejamiento por texto libre, media pantalla de
 * reglas podía estar sin aplicarse y la lista se veía perfectamente sana.
 */

export type RuleImpact = {
  /** Socios del ámbito con una condición vigente que casa con la regla. */
  affectedMembers: number;
  /**
   * `true` cuando la regla no afecta a nadie PERO hay lesiones registradas en su
   * zona. Es la firma de una regla mal escrita (lado equivocado, zona que no
   * corresponde), distinta de una regla que simplemente no tiene casos hoy.
   */
  orphan: boolean;
};

/**
 * Recuento agregado: DOS consultas en total, no una por regla. Con una consulta
 * por regla, una organización con cuarenta reglas abría cuarenta veces la tabla
 * de salud cada vez que alguien mira la pantalla.
 */
export async function countMembersAffectedByRules(user: ScopedUser): Promise<Map<string, RuleImpact>> {
  const scope = await centerScopeFor(user);

  const [rules, records] = await Promise.all([
    prisma.aptitudeRule.findMany({
      where: { orgId: user.orgId },
      select: { id: true, zoneCode: true, side: true },
    }),
    prisma.healthRecord.findMany({
      where: {
        status: { in: OPEN_HEALTH_STATUSES },
        // El recuento respeta el ámbito de centro de quien mira: dirección de
        // centro no cuenta socios de otro centro ni siquiera de forma agregada.
        member:
          scope === null
            ? { orgId: user.orgId }
            : { orgId: user.orgId, primaryCenterId: { in: scope } },
      },
      select: { memberId: true, zoneCode: true, side: true },
    }),
  ]);

  /** Cuántos socios distintos tienen algo declarado en cada zona del catálogo. */
  const membersByZone = new Map<InjuryZone, Set<string>>();
  for (const record of records) {
    if (!record.zoneCode || !record.memberId) continue;
    const set = membersByZone.get(record.zoneCode) ?? new Set<string>();
    set.add(record.memberId);
    membersByZone.set(record.zoneCode, set);
  }

  const impact = new Map<string, RuleImpact>();
  for (const rule of rules) {
    const affected = new Set<string>();
    for (const record of records) {
      if (!record.memberId) continue;
      if (ruleMatchesRecord(rule as ZonedRule, record)) affected.add(record.memberId);
    }
    const zoneHasCases = rule.zoneCode ? (membersByZone.get(rule.zoneCode)?.size ?? 0) > 0 : false;
    impact.set(rule.id, { affectedMembers: affected.size, orphan: affected.size === 0 && zoneHasCases });
  }

  return impact;
}
