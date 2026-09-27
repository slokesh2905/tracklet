import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a local Postgres (`npm run db:up`), reset and seeded from
 * scripts/seed.sql by the global setup. Magic-link emails are written to an
 * outbox file instead of being sent, so tests sign in through the real flow.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://tracklet:tracklet@localhost:5433/tracklet";
export const OUTBOX = resolve("tests/e2e/.auth/outbox.jsonl");

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/demo.json" }, dependencies: ["setup"] },
    { name: "iphone", use: { ...devices["iPhone 13"], storageState: "tests/e2e/.auth/demo.json" }, dependencies: ["setup"] },
    { name: "pixel", use: { ...devices["Pixel 7"], storageState: "tests/e2e/.auth/demo.json" }, dependencies: ["setup"] },
  ],
  webServer: {
    command: process.env.CI ? `npm run build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      DATABASE_URL,
      DATABASE_URL_UNPOOLED: DATABASE_URL,
      NEXT_PUBLIC_APP_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdef0123456789",
      EMAIL_OUTBOX_FILE: OUTBOX,
      CRON_SECRET: "e2e-cron-secret-0123456789",
      FIRECRAWL_API_KEY: "fc-e2e-unused",
      RESEND_API_KEY: "re_e2e_unused",
      RESEND_FROM_EMAIL: "alerts@tracklet.test",
    },
  },
});
