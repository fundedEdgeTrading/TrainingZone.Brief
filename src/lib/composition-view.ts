import type { Sex } from "@prisma/client";
import {
  formatTrend,
  getReferenceRange,
  statusForValue,
  ageFromBirthDate,
  trendAgainstPrevious,
} from "@/lib/reference-ranges";

type ProgressEntryLike = {
  date: Date;
  measuredAt: Date | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  fatMassKg: number | null;
  bmi: number | null;
  visceralFatRating: number | null;
  boneMassKg: number | null;
  bodyWaterPct: number | null;
  bmrKcal: number | null;
  metabolicAge: number | null;
};

// CC1.4/CC2/CC3 (docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md): última toma con semáforo +
// serie para la gráfica de evolución. Compartido entre la ficha del socio (vista entrenador)
// y el portal del socio para no duplicar el cálculo de tiles/rangos.
export async function buildCompositionView(
  orgId: string,
  birthDate: Date | null,
  progressEntries: ProgressEntryLike[],
  sex: Sex | null = null
) {
  const age = ageFromBirthDate(birthDate);
  const compositionEntries = progressEntries.filter(
    (e) => e.bodyFatPct != null || e.muscleMassKg != null || e.bmi != null || e.visceralFatRating != null
  );
  const latestComposition = compositionEntries[0];
  // E3-09: el % graso se presenta como TENDENCIA contra la medición anterior,
  // que es lo único defendible sin normativa poblacional. `progressEntries`
  // llega ordenado de más reciente a más antiguo.
  const previousBodyFat = compositionEntries.find((e, i) => i > 0 && e.bodyFatPct != null)?.bodyFatPct ?? null;
  const bodyFatTrend = trendAgainstPrevious(latestComposition?.bodyFatPct, previousBodyFat);
  const [bodyFatRange, bmiRange, visceralRange] = await Promise.all([
    getReferenceRange(orgId, "bodyFatPct", { age, sex }),
    getReferenceRange(orgId, "bmi", { age, sex }),
    getReferenceRange(orgId, "visceralFatRating", { age, sex }),
  ]);

  const compositionTiles = latestComposition
    ? [
        { label: "Peso", value: latestComposition.weightKg != null ? `${latestComposition.weightKg} kg` : null },
        {
          label: "% graso",
          value: latestComposition.bodyFatPct != null ? `${latestComposition.bodyFatPct} %` : null,
          // "unknown" cuando no hay fila para su sexo y tramo de edad: se pinta
          // el número, sin color. Nunca rojo por defecto (E3-09).
          status: statusForValue(latestComposition.bodyFatPct, bodyFatRange),
          foot: formatTrend(bodyFatTrend),
        },
        { label: "IMC", value: latestComposition.bmi != null ? `${latestComposition.bmi}` : null, status: statusForValue(latestComposition.bmi, bmiRange) },
        { label: "Masa muscular", value: latestComposition.muscleMassKg != null ? `${latestComposition.muscleMassKg} kg` : null },
        { label: "Grasa visceral", value: latestComposition.visceralFatRating != null ? `${latestComposition.visceralFatRating}` : null, status: statusForValue(latestComposition.visceralFatRating, visceralRange) },
        { label: "Masa ósea", value: latestComposition.boneMassKg != null ? `${latestComposition.boneMassKg} kg` : null },
        { label: "Agua corporal", value: latestComposition.bodyWaterPct != null ? `${latestComposition.bodyWaterPct} %` : null },
        { label: "BMR", value: latestComposition.bmrKcal != null ? `${latestComposition.bmrKcal} kcal` : null },
        // E3-10: "Edad metabólica" NO se pinta, ni en la ficha ni en el portal.
        // En una ficha con membrete del centro, "Edad metabólica: 47" parece un
        // diagnóstico, y es marketing de un fabricante de básculas. La columna
        // sigue existiendo, se sigue importando de la báscula y sale en la
        // exportación de datos del socio: lo que se retira es presentarla como
        // métrica de seguimiento.
      ]
    : [];

  const compositionChartPoints = [...progressEntries].reverse().map((e) => ({
    label: (e.measuredAt ?? e.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
    weightKg: e.weightKg,
    muscleMassKg: e.muscleMassKg,
    fatMassKg: e.fatMassKg,
  }));

  const bodyFatChartPoints = [...progressEntries].reverse().map((e) => ({
    label: (e.measuredAt ?? e.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
    value: e.bodyFatPct,
  }));

  return {
    bodyFatTrend,
    bodyFatTrendLabel: formatTrend(bodyFatTrend),
    compositionTiles,
    compositionChartPoints,
    bodyFatChartPoints,
    latestComposition,
    measuredAt: latestComposition
      ? (latestComposition.measuredAt ?? latestComposition.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
      : null,
  };
}
