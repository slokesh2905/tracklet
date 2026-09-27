import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { OUTBOX } from "../../playwright.config";

/** Fresh, seeded local database and an empty email outbox for every run. */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://tracklet:tracklet@localhost:5433/tracklet";
  execSync("npx tsx scripts/db.ts seed", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });
  mkdirSync(dirname(OUTBOX), { recursive: true });
  rmSync(OUTBOX, { force: true });
}
