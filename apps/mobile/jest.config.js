/**
 * E7-01 · Infraestructura de pruebas de la app.
 *
 * Punto de partida: 86 ficheros, ~14.900 líneas, 0 tests, 0 % de cobertura.
 *
 * Sobre las versiones: la pareja correcta la fija `npx expo install --dev`, y
 * las tres están donde ella las habría dejado. Tres de los pines son EXACTOS
 * porque son restricciones, no preferencias:
 *  - `jest-expo@57.0.2`: `react-native@0.86.0` pide `@react-native/jest-preset`
 *    en la versión exacta `0.86.0`, y a partir de `jest-expo@57.0.3` el peer
 *    sube a `^0.86.2`. `~57.0.2` resuelve al más alto del rango y no instala.
 *  - `@react-native/jest-preset@0.86.0`: la que exige react-native, sin rango.
 *  - `react-test-renderer@19.2.3`: tiene que ser exactamente la misma versión
 *    que `react`.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  moduleNameMapper: {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Los tests viven junto a lo que prueban: `src/api/client.test.ts` al lado de
  // `client.ts`. En `src/test/` solo hay andamiaje y sus propias pruebas.
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/test/**",
    "!src/**/*.d.ts",
  ],
  clearMocks: true,
  // Los 5000ms por defecto se quedan cortos en el runner de CI compartido
  // entre las nueve pistas del trimestre: ahí un test que en local tarda
  // 1-2s puede tardar el triple por contención de CPU, no por regresión.
  testTimeout: 15000,
};
