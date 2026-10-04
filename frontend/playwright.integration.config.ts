import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

process.env.CAREEROS_DB_PATH ||= resolve("../output", `integration-${process.pid}-${Date.now()}`, "workspace.sqlite3");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "integration.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  outputDir: "test-results/integration",
  use: { baseURL: "http://127.0.0.1:3124", trace: "retain-on-failure" },
  projects: [{ name: "chromium-integration", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  webServer: [
    {
      command: "node tests/integration/start-backend.mjs",
      url: "http://127.0.0.1:8125/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { CAREEROS_DB_PATH: process.env.CAREEROS_DB_PATH, GEMINI_API_KEY: "" },
    },
    {
      command: process.env.CAREEROS_INTEGRATION_PRODUCTION ? "npm run start -- --port 3124" : "npm run dev -- --port 3124",
      url: "http://127.0.0.1:3124",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_BASE: "http://127.0.0.1:8124", NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
