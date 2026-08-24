"use client";

/**
 * "Exportar" del ranking de socios.
 *
 * Descarga lo que está en pantalla, en CSV: el listado completo vive en Socios
 * y no hay endpoint de exportación de socios al que apuntar, así que un botón
 * que navegase a otra pantalla estaría mintiendo sobre lo que hace. El CSV se
 * arma en el navegador con las mismas diez filas que se ven, sin viaje al
 * servidor y sin datos que la pantalla no enseñe ya.
 */
export type RankingRow = {
  memberName: string;
  ltvEuros: number;
  adherencePct: number;
  tenureDays: number;
  mixedScore: number;
};

const HEADERS = ["Socio", "LTV (€)", "Adherencia (%)", "Antigüedad (días)", "Score mixto"];

/** Comillas dobles y separador: campo entrecomillado, comillas internas duplicadas. */
const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export function ExportRankingButton({ rows }: { rows: RankingRow[] }) {
  const download = () => {
    const csv = [
      HEADERS.map(cell).join(";"),
      ...rows.map((r) =>
        [r.memberName, Math.round(r.ltvEuros), r.adherencePct, r.tenureDays, r.mixedScore].map(cell).join(";")
      ),
    ].join("\r\n");
    // BOM para que Excel en español abra el CSV en UTF-8 y no parta los acentos.
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ranking-socios.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-lg bg-brand-ink px-3.5 py-1.5 text-xs font-semibold text-tz-bone transition-opacity duration-150 hover:opacity-90"
    >
      Exportar
    </button>
  );
}
