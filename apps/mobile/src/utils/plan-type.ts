/**
 * E5-12: espejo de `isRecurring` (src/lib/member-billing.ts) en la web. MONTHLY
 * y ONLINE son cuota recurrente; el resto son bonos puntuales que se agotan y
 * no se renuevan solos.
 */
export function isRecurringPlanType(planType: string): boolean {
  return planType === "MONTHLY" || planType === "ONLINE";
}
