/**
 * Give catalog items their real identity (Amazon ASIN, Flipkart pid, …) by
 * resolving share links, then merge items that turn out to be the same product.
 * Dry run by default.
 *
 *   npm run db:rekey              # report only
 *   npm run db:rekey -- --apply   # rekey + merge
 *
 * Targets DATABASE_URL (set it explicitly to run against production).
 */
for (const file of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file: fine.
  }
}

const apply = process.argv.includes("--apply");
const { like } = await import("drizzle-orm");
const { db } = await import("../lib/db");
const { catalogItems } = await import("../lib/db/schema");
const { productKeyFromUrl, resolveUrl } = await import("../lib/product-key");
const { rekeyItem } = await import("../lib/catalog");

console.log(`Database host: ${new URL(process.env.DATABASE_URL!).hostname} · ${apply ? "APPLY" : "dry run"}\n`);

const items = await db.select().from(catalogItems).where(like(catalogItems.key, "url:%"));
const planned = new Map<string, string[]>();

for (const item of items) {
  const resolved = await resolveUrl(item.url);
  const next = productKeyFromUrl(resolved);
  const note = next.key === item.key ? "unchanged" : `→ ${next.key}`;
  console.log(`${item.name.slice(0, 45).padEnd(45)} ${item.key.slice(0, 55)} ${note}`);
  if (next.key === item.key) continue;
  planned.set(next.key, [...(planned.get(next.key) ?? []), item.id]);
  if (apply) {
    const result = await rekeyItem(item, next);
    if (result.merged) console.log(`   merged into existing item ${result.itemId}`);
  }
}

const merges = [...planned.values()].filter((ids) => ids.length > 1).length;
console.log(`\n${planned.size} item(s) get a real key; ${merges} group(s) of duplicates ${apply ? "merged" : "would merge"}.`);
if (!apply && planned.size) console.log("Nothing changed. Re-run with --apply.");
process.exit(0);
