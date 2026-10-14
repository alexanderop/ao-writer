import { defineConfig, devices } from "@playwright/test";

const baseUrl = "http://localhost:5190";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: baseUrl, trace: "on-first-retry", viewport: { width: 1280, height: 800 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: { command: "pnpm dev", url: baseUrl, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
