// Config propia: sin esto, ESLint (flat config) sube hasta encontrar
// eslint.config.mjs en la raíz del monorepo (el del portal web Next.js) y
// falla porque ese proyecto no tiene sus dependencias instaladas aquí.
const expoConfig = require("eslint-config-expo/flat");
const { defineConfig, globalIgnores } = require("eslint/config");

module.exports = defineConfig([
  expoConfig,
  globalIgnores(["node_modules/**", ".expo/**", "dist/**"]),
]);
