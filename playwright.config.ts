// Playwright-Konfiguration für die Sunify-Testbibliothek (Testfälle: e2e/TESTFAELLE.md).
// Getestet wird die veröffentlichte App (SUNIFY_URL) oder lokal http://localhost:3000.
// Jeder Test läuft in drei Ansichten: Desktop (Chrome), Android (Pixel 7) und iPhone (Safari/WebKit).

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.SUNIFY_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  use: {
    baseURL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 14"] } },
  ],
});
