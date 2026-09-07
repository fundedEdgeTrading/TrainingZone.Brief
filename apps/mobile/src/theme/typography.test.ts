/**
 * E8-10: ningún estilo de `typo` baja del suelo tipográfico de 11 px
 * (WCAG 1.4.4 exige que el texto escale al 200 % sin recortarse).
 */
import { typo, MIN_FONT_SIZE } from "@/theme/typography";

describe("suelo tipográfico (E8-10)", () => {
  it("ningún estilo de typo baja de 11 px", () => {
    for (const [name, style] of Object.entries(typo)) {
      const fontSize = (style as { fontSize?: number }).fontSize;
      if (fontSize == null) continue;
      expect(fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      if (fontSize < MIN_FONT_SIZE) throw new Error(`${name} está por debajo del suelo: ${fontSize}px`);
    }
  });
});
