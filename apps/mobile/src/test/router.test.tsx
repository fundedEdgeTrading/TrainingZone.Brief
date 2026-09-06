/**
 * E7-01 · `expo-router/testing-library` está disponible para la batería que
 * viene detrás (E7-03), que sí navega entre pantallas.
 *
 * No hace falta instalarlo aparte: lo publica el propio `expo-router` como
 * subruta, y `@testing-library/react-native` (>= 13.2) es su peer, que ya está.
 *
 * OJO al importarlo: registra un `afterAll` al cargarse, así que tiene que ir
 * como import de módulo. Un `require()` dentro de un `it()` revienta con
 * "Hooks cannot be defined inside tests", y el mensaje no dice por qué.
 */
import { renderRouter } from "expo-router/testing-library";

describe("expo-router/testing-library", () => {
  it("está disponible y expone renderRouter", () => {
    expect(typeof renderRouter).toBe("function");
  });
});
