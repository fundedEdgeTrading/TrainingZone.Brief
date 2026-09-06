import type { PlanType } from "@prisma/client";

/**
 * F5 · MONTHLY y ONLINE son cuota recurrente (se cobran cada mes mientras el
 * socio no cause baja). SESSION_PACK, DROP_IN, DUO y PERSONAL_TRAINING son bonos
 * puntuales: se agotan y el socio compra otro, nunca se renuevan solos.
 *
 * Vive en su propio módulo —y no dentro de `member-billing.ts`, que es de donde
 * se sigue reexportando— porque lo necesitan sitios que `member-billing.ts` a su
 * vez importa (el checkout de demostración de HU-ST-11), y tenerlo allí cerraba
 * un ciclo de importación entre los dos.
 */
export function isRecurring(planType: PlanType): boolean {
  return planType === "MONTHLY" || planType === "ONLINE";
}
