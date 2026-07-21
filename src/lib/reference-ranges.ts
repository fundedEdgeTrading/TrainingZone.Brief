import { prisma } from "@/lib/prisma";

// Fuera de un componente (no dispara react-hooks/purity): edad aproximada a partir de la fecha
// de nacimiento, usada para filtrar ReferenceRange por rango de edad.
export function ageFromBirthDate(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  return Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

// Rangos de referencia de composición corporal (docs/COMPOSICION_CORPORAL_TANITA.md §3/§8.1).
// Tabla ReferenceRange editable por dirección; si no hay fila para la métrica/org, se cae a
// estos valores por defecto (los del propio informe Tanita analizado), igual que AptitudeRule
// funciona sobre reglas configurables con un catálogo de partida.
export type RangeMetric = "bodyFatPct" | "bmi" | "visceralFatRating" | "bodyWaterPct";

const DEFAULT_RANGES: Record<RangeMetric, { min: number; max: number }> = {
  bodyFatPct: { min: 8, max: 19 },
  bmi: { min: 18.5, max: 25 },
  visceralFatRating: { min: 1, max: 9 },
  bodyWaterPct: { min: 50, max: 65 },
};

export type RangeStatus = "good" | "warning" | "critical" | "unknown";

export async function getReferenceRange(
  orgId: string,
  metric: RangeMetric,
  opts: { sex?: string | null; age?: number | null } = {}
): Promise<{ min: number | null; max: number | null }> {
  const rows = await prisma.referenceRange.findMany({ where: { orgId, metric } });
  const match = rows.find(
    (r) =>
      (!r.sex || r.sex === opts.sex) &&
      (r.ageMin == null || (opts.age != null && opts.age >= r.ageMin)) &&
      (r.ageMax == null || (opts.age != null && opts.age <= r.ageMax))
  );
  if (match) return { min: match.min, max: match.max };
  return DEFAULT_RANGES[metric] ?? { min: null, max: null };
}

// Semáforo simple: dentro de rango = good, hasta un 15% fuera = warning, más allá = critical.
export function statusForValue(value: number | null | undefined, range: { min: number | null; max: number | null }): RangeStatus {
  if (value == null || range.min == null || range.max == null) return "unknown";
  if (value >= range.min && value <= range.max) return "good";
  const span = range.max - range.min || 1;
  const margin = span * 0.15;
  if (value >= range.min - margin && value <= range.max + margin) return "warning";
  return "critical";
}

export async function listReferenceRanges(orgId: string) {
  return prisma.referenceRange.findMany({
    where: { orgId },
    include: { editedBy: { select: { name: true } } },
    orderBy: [{ metric: "asc" }],
  });
}
