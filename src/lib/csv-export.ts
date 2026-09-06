/**
 * Formato español de exportación CSV, compartido por auditoría, socios y
 * cobros (E6-06): punto y coma como separador (Excel/LibreOffice en español
 * lo esperan), BOM para que los acentos no se rompan al abrir, y las celdas
 * que empiezan por `= + - @` se neutralizan para que un nombre o una nota no
 * se ejecuten como fórmula al abrir el fichero.
 */
function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[";\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}`;
}

export function csvResponseHeaders(fileName: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileName}"`,
  };
}
