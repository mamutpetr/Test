import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Production build in demo mode; DATABASE_URL must point to a migrated database.
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { APP_MODE: "demo", APP_URL: `http://localhost:${PORT}` },
  },
});
