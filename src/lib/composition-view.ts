import { getReferenceRange, statusForValue, ageFromBirthDate } from "@/lib/reference-ranges";

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
export async function buildCompositionView(orgId: string, birthDate: Date | null, progressEntries: ProgressEntryLike[]) {
  const age = ageFromBirthDate(birthDate);
  const latestComposition = progressEntries.find(
    (e) => e.bodyFatPct != null || e.muscleMassKg != null || e.bmi != null || e.visceralFatRating != null
  );
  const [bodyFatRange, bmiRange, visceralRange] = await Promise.all([
    getReferenceRange(orgId, "bodyFatPct", { age }),
    getReferenceRange(orgId, "bmi", { age }),
    getReferenceRange(orgId, "visceralFatRating", { age }),
  ]);

  const compositionTiles = latestComposition
    ? [
        { label: "Peso", value: latestComposition.weightKg != null ? `${latestComposition.weightKg} kg` : null },
        { label: "% graso", value: latestComposition.bodyFatPct != null ? `${latestComposition.bodyFatPct} %` : null, status: statusForValue(latestComposition.bodyFatPct, bodyFatRange) },
        { label: "IMC", value: latestComposition.bmi != null ? `${latestComposition.bmi}` : null, status: statusForValue(latestComposition.bmi, bmiRange) },
        { label: "Masa muscular", value: latestComposition.muscleMassKg != null ? `${latestComposition.muscleMassKg} kg` : null },
        { label: "Grasa visceral", value: latestComposition.visceralFatRating != null ? `${latestComposition.visceralFatRating}` : null, status: statusForValue(latestComposition.visceralFatRating, visceralRange) },
        { label: "Masa ósea", value: latestComposition.boneMassKg != null ? `${latestComposition.boneMassKg} kg` : null },
        { label: "Agua corporal", value: latestComposition.bodyWaterPct != null ? `${latestComposition.bodyWaterPct} %` : null },
        { label: "BMR", value: latestComposition.bmrKcal != null ? `${latestComposition.bmrKcal} kcal` : null },
        { label: "Edad metabólica", value: latestComposition.metabolicAge != null ? `${latestComposition.metabolicAge} años` : null },
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
    compositionTiles,
    compositionChartPoints,
    bodyFatChartPoints,
    latestComposition,
    measuredAt: latestComposition
      ? (latestComposition.measuredAt ?? latestComposition.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
      : null,
  };
}
