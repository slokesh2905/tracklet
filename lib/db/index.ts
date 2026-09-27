import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * One pool per function instance. On Vercel Fluid compute, instances serve many
 * requests, so pooled connections are reused; attachDatabasePool closes idle
 * clients before the instance is suspended. DATABASE_URL is Neon's pooled
 * (PgBouncer) endpoint.
 */
function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing environment variable DATABASE_URL");

  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  attachDatabasePool(pool);
  return drizzle(pool, { schema });
}

// Reused across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Db };

function getDb() {
  return (globalForDb.db ??= createDb());
}

/**
 * Created on first use rather than at import, so `next build` (which imports
 * every route while collecting page data) never needs database credentials.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
