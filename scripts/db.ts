/**
 * Database tasks.
 *   tsx scripts/db.ts migrate   Apply drizzle/ migrations (direct connection).
 *   tsx scripts/db.ts seed      Reset the LOCAL database, migrate, load scripts/seed.sql.
 */
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Local dev DB first (see .env.development.local), then pulled Vercel env.
// Neither overrides variables already set, so CI/Vercel env always wins.
for (const file of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file: fine.
  }
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED)");

const isLocal = ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

async function run(task: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (task === "seed") {
      if (!isLocal) throw new Error("Refusing to reset and seed a non-local database.");
      await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    }
    if (task === "migrate" || task === "seed") {
      await migrate(drizzle(client), { migrationsFolder: "drizzle" });
      console.log("✓ migrations applied");
    }
    if (task === "seed") {
      await client.query(await readFile("scripts/seed.sql", "utf8"));
      console.log("✓ seed loaded");
    }
    if (!["migrate", "seed"].includes(task)) throw new Error(`Unknown task "${task}"`);
  } finally {
    await client.end();
  }
}

run(process.argv[2] ?? "migrate").catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
