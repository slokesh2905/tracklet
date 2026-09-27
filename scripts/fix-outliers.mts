/**
 * Find (and optionally delete) price-history rows the price guard would have
 * rejected, e.g. a "₹25" misread of a ₹5,995-MRP product. Dry run by default.
 *
 *   npm run db:fix-outliers              # report only
 *   npm run db:fix-outliers -- --apply   # delete, then rebuild low/high
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
const { asc, inArray } = await import("drizzle-orm");
const { db } = await import("../lib/db");
const { priceHistory } = await import("../lib/db/schema");
const { guardPrice } = await import("../lib/price-guard");
const { recomputeExtremes } = await import("../lib/catalog");

console.log(`Database host: ${new URL(process.env.DATABASE_URL!).hostname} · ${apply ? "APPLY" : "dry run"}\n`);

const items = await db.query.catalogItems.findMany({
  with: { priceHistory: { orderBy: asc(priceHistory.checked_at) } },
});

const toDelete: string[] = [];
const touched = new Set<string>();

for (const item of items) {
  let lastConfirmed: number | null = null;
  for (const row of item.priceHistory) {
    const decision = guardPrice({
      price: row.price,
      originalPrice: item.original_price,
      method: "jsonld",
      lastConfirmed,
      // Rows already in history were never confirmed; judge each against its neighbours.
      pending: null,
    });
    if (decision.action === "reject") {
      toDelete.push(row.id);
      touched.add(item.id);
      console.log(`✗ ${item.name.slice(0, 50)} · ${row.price} ${row.currency} at ${row.checked_at} — ${decision.reason}`);
    } else {
      lastConfirmed = row.price;
    }
  }
}

console.log(`\n${toDelete.length} implausible row(s) across ${touched.size} item(s).`);
if (apply && toDelete.length) {
  await db.delete(priceHistory).where(inArray(priceHistory.id, toDelete));
  for (const id of touched) await recomputeExtremes(id);
  console.log("Deleted and rebuilt lowest/highest prices.");
} else if (toDelete.length) {
  console.log("Nothing changed. Re-run with --apply to delete them.");
}
process.exit(0);
