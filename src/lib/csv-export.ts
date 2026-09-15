/**
 * Formato español de exportación CSV, compartido por auditoría, socios y
 * cobros (E6-06): punto y coma como separador (Excel/LibreOffice en español
 * lo esperan), BOM para que los acentos no se rompan al abrir, y las celdas
 * que empiezan por `= + - @` se neutralizan para que un nombre o una nota no
 * se ejecuten como fórmula al abrir el fichero.
 */
/**
 * Una celda que es SOLO un número (`1234`, `1234.56`, `-49,00`) no puede ser
 * una fórmula, así que no se neutraliza. Sin esta excepción, las devoluciones
 * en negativo de la exportación contable (HU-ST-25) salían como `'-49,00`:
 * texto para Excel, que la gestoría no puede sumar ni cuadrar. Todo lo demás
 * —nombres, notas, conceptos, que los escriben personas— se sigue neutralizando
 * exactamente igual que antes.
 */
const NUMERIC_CELL = /^-?\d+(?:[.,]\d+)?$/;

function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = !NUMERIC_CELL.test(raw) && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
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
