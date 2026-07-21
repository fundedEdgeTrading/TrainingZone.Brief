// Parser del texto que exporta la app My Tanita al compartir una medición
// (báscula TANITA Segmental Body Analyzer). No hay export a CSV en la app
// móvil, solo este texto plano con formato "* Etiqueta: valor" + sublíneas
// "- Segmento: valor" para el desglose por tronco/brazos/piernas — ver
// docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md (CC5, vía "pegar texto").
//
// Ejemplo de entrada real:
//   * Peso: 68,55 kg
//   * Grasa corporal: 14,9 %
//        - Tronco: 18,9 %
//        - Brazo izquierdo: 13,2 %
//   * Masa muscular: 55,40 kg
//        - Tronco: 29,85 kg
//   * Calidad muscular: 64 MQ
//   * Masa ósea: 2,9 kg
//   * Grasa visceral: 3,0
//   * TMB: 1702 kcal
//   * Edad metabólica: 18 años
//   * Agua corporal: 64,0 %

export type ParsedTanitaEntry = {
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  muscleQuality: number | null;
  boneMassKg: number | null;
  visceralFatRating: number | null;
  bmrKcal: number | null;
  metabolicAge: number | null;
  bodyWaterPct: number | null;
  fatMassKg: number | null; // derivado: weightKg * bodyFatPct/100
  fatFreeMassKg: number | null; // derivado: weightKg - fatMassKg
  segmental: { fatPct: Record<string, number>; muscleKg: Record<string, number>; muscleQuality: Record<string, number> } | null;
};

export type TanitaParseResult = { ok: true; data: ParsedTanitaEntry } | { ok: false; error: string };

const SEGMENT_LABEL: Record<string, string> = {
  "tronco": "trunk",
  "brazo izquierdo": "armLeft",
  "brazo derecho": "armRight",
  "pierna izquierda": "legLeft",
  "pierna derecha": "legRight",
};

const NUM = /(-?\d+(?:[.,]\d+)?)/;

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseTanitaText(raw: string): TanitaParseResult {
  const lines = raw
    .replace(/ /g, " ")
    .normalize("NFC")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { ok: false, error: "Pega el texto que comparte la app My Tanita tras la medición." };
  }

  const data: ParsedTanitaEntry = {
    weightKg: null,
    bmi: null,
    bodyFatPct: null,
    muscleMassKg: null,
    muscleQuality: null,
    boneMassKg: null,
    visceralFatRating: null,
    bmrKcal: null,
    metabolicAge: null,
    bodyWaterPct: null,
    fatMassKg: null,
    fatFreeMassKg: null,
    segmental: null,
  };

  const fatPct: Record<string, number> = {};
  const muscleKg: Record<string, number> = {};
  const muscleQualitySeg: Record<string, number> = {};
  let section: "fat" | "muscle" | "quality" | null = null;

  for (const line of lines) {
    const isSub = line.startsWith("-");
    const isTop = line.startsWith("*");
    if (!isSub && !isTop) continue; // línea de presentación ("Acabo de realizar...")

    const content = line.replace(/^[*-]\s*/, "");
    const colonIdx = content.indexOf(":");
    if (colonIdx === -1) continue;

    const key = content.slice(0, colonIdx).trim().toLowerCase();
    const value = content.slice(colonIdx + 1).trim();
    const n = num(value.match(NUM)?.[1]);

    if (isSub) {
      const segKey = SEGMENT_LABEL[key];
      if (!segKey || n == null) continue;
      if (section === "fat") fatPct[segKey] = n;
      else if (section === "muscle") muscleKg[segKey] = n;
      else if (section === "quality") muscleQualitySeg[segKey] = n;
      continue;
    }

    if (key === "peso") {
      data.weightKg = n;
      section = null;
    } else if (key === "imc") {
      data.bmi = n;
      section = null;
    } else if (key === "grasa corporal") {
      data.bodyFatPct = n;
      section = "fat";
    } else if (key === "masa muscular") {
      data.muscleMassKg = n;
      section = "muscle";
    } else if (key === "calidad muscular") {
      data.muscleQuality = n;
      section = "quality";
    } else if (key.includes("masa") && (key.includes("ósea") || key.includes("osea"))) {
      data.boneMassKg = n;
      section = null;
    } else if (key === "grasa visceral") {
      data.visceralFatRating = n != null ? Math.round(n) : null;
      section = null;
    } else if (key === "tmb") {
      data.bmrKcal = n != null ? Math.round(n) : null;
      section = null;
    } else if (key.includes("edad") && key.includes("metab")) {
      data.metabolicAge = n != null ? Math.round(n) : null;
      section = null;
    } else if (key === "agua corporal") {
      data.bodyWaterPct = n;
      section = null;
    } else {
      section = null; // etiqueta no reconocida (p.ej. "Tipo de cuerpo"): se ignora, no rompe el parseo
    }
  }

  if (data.weightKg == null && data.bodyFatPct == null && data.muscleMassKg == null) {
    return { ok: false, error: "No se ha reconocido ningún dato Tanita en el texto pegado. Comprueba que es el texto completo compartido por la app." };
  }

  if (data.weightKg != null && data.bodyFatPct != null) {
    data.fatMassKg = Math.round(data.weightKg * (data.bodyFatPct / 100) * 100) / 100;
    data.fatFreeMassKg = Math.round((data.weightKg - data.fatMassKg) * 100) / 100;
  }

  if (Object.keys(fatPct).length || Object.keys(muscleKg).length || Object.keys(muscleQualitySeg).length) {
    data.segmental = { fatPct, muscleKg, muscleQuality: muscleQualitySeg };
  }

  return { ok: true, data };
}
