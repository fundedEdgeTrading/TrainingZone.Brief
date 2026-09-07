/**
 * E8-04: la pestaña activa y la inactiva de la barra tienen que cumplir al
 * menos el 3:1 de componente de interfaz sobre el fondo de la barra
 * (`theme.sheet`) — theme.gold (2,20:1) y theme.textFaint (2,54:1) no lo
 * cumplían.
 */
import { light, dark } from "@/theme/theme";

function luminance(hex: string): number {
  const rgb = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((c) => parseInt(c, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("contraste de la barra de pestañas (E8-04)", () => {
  it("goldText (activa) cumple 3:1 sobre el fondo de la barra, en los dos temas", () => {
    expect(contrastRatio(light.goldText, light.sheet)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(dark.goldText, dark.sheet)).toBeGreaterThanOrEqual(3);
  });

  it("textMuted (inactiva) cumple 3:1 sobre el fondo de la barra, en los dos temas", () => {
    expect(contrastRatio(light.textMuted, light.sheet)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(dark.textMuted, dark.sheet)).toBeGreaterThanOrEqual(3);
  });
});
