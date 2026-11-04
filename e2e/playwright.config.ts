import { defineConfig } from "@playwright/test";

// Pile isolée (ports 8201 / 4100 / 5273, graphe RDF temporaire) démarrée par stack-server.mjs.
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["json", { outputFile: "results.json" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5273",
    // Chrome installé sur la machine (aucun téléchargement de navigateur nécessaire)
    channel: "chrome",
    headless: true,
    viewport: { width: 1366, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "fr-FR",
  },
  webServer: {
    command: "node stack-server.mjs",
    url: "http://localhost:5273",
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
