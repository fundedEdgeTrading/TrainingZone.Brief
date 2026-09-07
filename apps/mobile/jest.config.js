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
  // E7-04 · qué se mide.
  //
  // `src/theme` queda fuera porque es catálogo de constantes —paleta,
  // tipografía, curvas de animación—: medir la cobertura de una tabla de
  // colores infla el número sin proteger nada, y un porcentaje que sube porque
  // alguien tocó el tema es exactamente el tipo de métrica que se deja de
  // mirar. La excepción es `use-count-up.ts`: vive ahí por cercanía pero es un
  // hook con lógica, y esa sí se mide.
  //
  // Los `_layout.tsx` son declarativos (árbol de navegación y proveedores):
  // ejecutarlos en un test mide que expo-router monta, no que la app hace algo.
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/test/**",
    "!src/**/*.d.ts",
    "!src/theme/**",
    "src/theme/use-count-up.ts",
    "!src/**/_layout.tsx",
  ],
  // El resumen legible va al log del job; `json-summary` es el que lee el paso
  // que lo publica en el resumen del workflow, y `lcov` el que se sube como
  // artefacto para poder abrirlo fichero a fichero.
  coverageReporters: ["text", "text-summary", "json-summary", "lcov"],
  /**
   * E7-04 · el umbral, en su primera etapa.
   *
   * La historia pide medir ANTES de exigir, "para no poner un umbral que se
   * acabe bajando el primer día". Medido hoy, con la batería base ya escrita:
   * api 32,9 % de líneas, auth 53,3 %, components 53,6 %, utils 67,2 %. El
   * objetivo de la historia para esta etapa —60 % de líneas y ramas en esos
   * cuatro— todavía no se cumple, así que ponerlo hoy dejaría el job en rojo
   * por deuda ajena a quien empuje el siguiente cambio.
   *
   * Lo que sí se fija es un SUELO en lo ya conseguido, redondeado a la baja:
   * no obliga a nadie a subir, pero impide que baje sin que nadie se entere,
   * que es la otra forma de que un umbral acabe siendo decorativo. Al llegar a
   * 60 se sube aquí; después, 80 en api y auth y 60 en el resto (las dos
   * etapas siguientes de la historia).
   */
  coverageThreshold: {
    // Ojo con la semántica de Jest: `global` NO es el total del proyecto, es lo
    // que queda FUERA de los grupos por ruta de abajo — aquí, las pantallas de
    // `src/app` y `notification-routes.ts`. El total sale del resumen que el
    // job publica; esto es su suelo por partes.
    global: { lines: 15, branches: 15, statements: 14, functions: 13 },
    "./src/api/": { lines: 32, branches: 45 },
    "./src/auth/": { lines: 53, branches: 46 },
    "./src/components/": { lines: 53, branches: 45 },
    "./src/utils/": { lines: 67, branches: 50 },
  },
  clearMocks: true,
  // Los 5000ms por defecto se quedan cortos en el runner de CI compartido
  // entre las nueve pistas del trimestre: ahí un test que en local tarda
  // 1-2s puede tardar el triple por contención de CPU, no por regresión.
  testTimeout: 15000,
};
