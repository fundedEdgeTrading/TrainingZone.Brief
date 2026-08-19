import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // El contenedor de desarrollo trae Chromium preinstalado en una ruta fija; el
  // runner de GitHub instala el suyo con `playwright install`, donde ese
  // executablePath no existe. Se fija solo fuera de CI.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.CI ? {} : { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
