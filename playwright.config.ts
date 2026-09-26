import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the local Supabase stack (`npx supabase start`) seeded by
 * supabase/seed.sql. Keys are read from `supabase status` so nothing is hard-coded.
 */
function localSupabaseEnv(): Record<string, string> {
  try {
    const status = JSON.parse(
      execSync(`${process.env.SUPABASE_BIN ?? "npx supabase"} status -o json`, { stdio: ["ignore", "pipe", "ignore"] }).toString()
    ) as Record<string, string>;
    return {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: (status.PUBLISHABLE_KEY ?? status.ANON_KEY)!,
      SUPABASE_SERVICE_ROLE_KEY: (status.SECRET_KEY ?? status.SERVICE_ROLE_KEY)!,
      MAILPIT_URL: (status.MAILPIT_URL ?? status.INBUCKET_URL)!,
    };
  } catch {
    throw new Error("Local Supabase isn't running. Start it with `npx supabase start`.");
  }
}

const supabase = localSupabaseEnv();
Object.assign(process.env, supabase);

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
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
      ...supabase,
      NEXT_PUBLIC_APP_URL: baseURL,
      CRON_SECRET: "e2e-cron-secret-0123456789",
      FIRECRAWL_API_KEY: "fc-e2e-unused",
      RESEND_API_KEY: "re_e2e_unused",
      RESEND_FROM_EMAIL: "alerts@tracklet.test",
    },
  },
});
