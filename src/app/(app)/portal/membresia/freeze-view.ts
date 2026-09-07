import { prisma } from "@/lib/prisma";

/**
 * E5-06: límites de congelación que el socio tiene que ver ANTES de pedirla.
 *
 * `Center` no tiene columnas dedicadas para esto y `prisma/schema.prisma`
 * está congelado este trimestre (ver AGENTS.md): igual que
 * `CANCELLATION_WINDOW_HOURS` (`portal-queries.ts`), el límite se configura
 * por variable de entorno en vez de por centro. En cuanto se abra la ventana
 * de schema, `freezeMaxDaysPerYear`/`freezeMinNoticeDays` son el único punto
 * a cambiar por una lectura de `Center`.
 */
const DEFAULT_FREEZE_MAX_DAYS_PER_YEAR = 30;
const DEFAULT_FREEZE_MIN_NOTICE_DAYS = 3;

function envDays(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function freezeMaxDaysPerYear(): number {
  return envDays("FREEZE_MAX_DAYS_PER_YEAR", DEFAULT_FREEZE_MAX_DAYS_PER_YEAR);
}

export function freezeMinNoticeDays(): number {
  return envDays("FREEZE_MIN_NOTICE_DAYS", DEFAULT_FREEZE_MIN_NOTICE_DAYS);
}

export const FREEZE_ENTITY = "Subscription";
export const FREEZE_ACTION = "MEMBER_SUBSCRIPTION_FROZEN";
export const RESUME_ACTION = "MEMBER_SUBSCRIPTION_RESUMED";

function dayCount(startDate: Date, endDate: Date): number {
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

/** Cuántos días ha durado de verdad una congelación, para desplazar la caducidad al reanudar. */
export function frozenDaysBetween(freezeStart: Date, resumedAt: Date): number {
  return dayCount(freezeStart, resumedAt);
}

/**
 * RB-PAGO-004 (espejo de socio): reanudar desplaza la caducidad del bono
 * exactamente los días que ha durado la congelación real — quien congela 10
 * días y reanuda a los 10 días conserva sus sesiones intactas, ni un día de
 * menos ni de más.
 */
export function shiftedEndDate(endDate: Date | null, frozenDays: number): Date | null {
  if (!endDate) return null;
  return new Date(endDate.getTime() + frozenDays * 86_400_000);
}

/** Días de congelación ya consumidos este año natural, para un bono concreto. */
export async function freezeDaysUsedThisYear(subscriptionId: string): Promise<number> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const entries = await prisma.auditLog.findMany({
    where: { entityType: FREEZE_ENTITY, entityId: subscriptionId, action: FREEZE_ACTION, createdAt: { gte: yearStart } },
    select: { metadata: true },
  });
  return entries.reduce((total, e) => {
    const metadata = e.metadata as { startDate?: string; endDate?: string } | null;
    if (!metadata?.startDate || !metadata?.endDate) return total;
    return total + dayCount(new Date(metadata.startDate), new Date(metadata.endDate));
  }, 0);
}

export type FreezePolicyView = {
  maxDaysPerYear: number;
  minNoticeDays: number;
  usedDaysThisYear: number;
  remainingDays: number;
};

export async function getMemberFreezePolicyView(subscriptionId: string): Promise<FreezePolicyView> {
  const maxDaysPerYear = freezeMaxDaysPerYear();
  const usedDaysThisYear = await freezeDaysUsedThisYear(subscriptionId);
  return {
    maxDaysPerYear,
    minNoticeDays: freezeMinNoticeDays(),
    usedDaysThisYear,
    remainingDays: Math.max(0, maxDaysPerYear - usedDaysThisYear),
  };
}
