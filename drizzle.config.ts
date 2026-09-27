import { defineConfig } from "drizzle-kit";

// Local dev DB first (see .env.development.local), then pulled Vercel env.
// Neither overrides variables already set, so CI/Vercel env always wins.
for (const file of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file: fine.
  }
}

// Migrations need a direct (non-pooled) connection; PgBouncer's transaction
// mode breaks session-level statements. Falls back to DATABASE_URL locally.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url! },
  strict: true,
  verbose: true,
});
