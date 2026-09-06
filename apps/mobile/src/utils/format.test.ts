/**
 * E7-03 · T13: fechas, euros y helpers de ISO, incluidos cambio de hora y fin
 * de mes.
 */
import {
  addDaysToIso,
  formatDayLabel,
  formatDayMonth,
  formatEuros,
  formatMonthTitle,
  formatShortDate,
  isoOfDate,
  minutesOf,
  monthGrid,
  pluralize,
  shiftMonth,
} from "@/utils/format";

describe("formatEuros", () => {
  it("sin decimales cuando el importe es un número redondo de euros", () => {
    expect(formatEuros(4500)).toBe("45 €");
  });

  it("con decimales cuando los céntimos no son cero", () => {
    expect(formatEuros(4599)).toBe("45,99 €");
  });

  it("fuerza decimales cuando se piden explícitamente", () => {
    expect(formatEuros(4500, { decimals: true })).toBe("45,00 €");
  });
});

describe("fechas: día de calendario, no UTC", () => {
  it("una fecha YYYY-MM-DD se lee como el mismo día, no el anterior", () => {
    // Con new Date("2026-09-01") a secas, en cualquier huso al oeste de
    // Greenwich saldría "31 ago" en vez de "1 sep".
    expect(formatDayMonth("2026-09-01")).toBe("1 sept");
  });

  it("una fecha corrupta no pinta Invalid Date", () => {
    expect(formatShortDate("no-es-una-fecha")).toBe("—");
  });

  it("formatDayLabel capitaliza el día de la semana", () => {
    expect(formatDayLabel("2026-03-16")).toMatch(/^Lunes/);
  });
});

describe("addDaysToIso", () => {
  it("cruza el fin de mes", () => {
    expect(addDaysToIso("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("cruza el fin de año", () => {
    expect(addDaysToIso("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("shiftMonth / formatMonthTitle", () => {
  it("de diciembre a enero cambia también el año", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("de enero a diciembre del año anterior", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("el título del mes va en español y capitalizado", () => {
    expect(formatMonthTitle("2026-09")).toBe("Septiembre de 2026");
  });
});

describe("monthGrid", () => {
  it("cubre el mes entero en semanas de 7, lunes primero", () => {
    const weeks = monthGrid("2026-02"); // febrero 2026, 28 días, empieza en domingo
    const flat = weeks.flat();
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(flat.filter(Boolean)).toHaveLength(28);
    expect(flat.filter(Boolean).at(0)).toBe("2026-02-01");
    expect(flat.filter(Boolean).at(-1)).toBe("2026-02-28");
  });

  it("un año bisiesto lleva los 29 días de febrero", () => {
    const flat = monthGrid("2028-02").flat();
    expect(flat.filter(Boolean)).toHaveLength(29);
  });
});

describe("isoOfDate / minutesOf / pluralize", () => {
  it("isoOfDate usa el día LOCAL, no UTC", () => {
    expect(isoOfDate(new Date(2026, 8, 1))).toBe("2026-09-01");
  });

  it("minutesOf convierte HH:mm a minutos desde medianoche", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("19:30")).toBe(19 * 60 + 30);
    expect(minutesOf("23:59")).toBe(23 * 60 + 59);
  });

  it("pluralize elige singular o plural según el conteo", () => {
    expect(pluralize(1, "sesión", "sesiones")).toBe("1 sesión");
    expect(pluralize(0, "sesión", "sesiones")).toBe("0 sesiones");
    expect(pluralize(2, "sesión", "sesiones")).toBe("2 sesiones");
  });
});
