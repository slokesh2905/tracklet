import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  alerts,
  catalogItems,
  itemInsights,
  priceHistory,
  products,
  storeOffers,
  type CatalogItemRow,
  type PriceSource,
} from "@/lib/db/schema";
import type { ProductKey } from "@/lib/product-key";
import type { ScrapedProduct } from "@/lib/scraper";

export async function findItemByKey(key: string) {
  return (await db.query.catalogItems.findFirst({ where: eq(catalogItems.key, key) })) ?? null;
}

/** Create a catalog item from its first (already guarded) reading, with a first history row. */
export async function createItem(key: ProductKey, scraped: ScrapedProduct, source: PriceSource = "add") {
  const now = new Date().toISOString();
  const [item] = await db
    .insert(catalogItems)
    .values({
      key: key.key,
      retailer: key.retailer,
      url: key.canonicalUrl,
      name: scraped.name,
      image_url: scraped.imageUrl,
      current_price: scraped.price,
      original_price: scraped.originalPrice,
      currency: scraped.currency,
      in_stock: scraped.inStock,
      last_checked_at: now,
    })
    // Two users adding the same new product at once: the second just attaches.
    .onConflictDoUpdate({ target: catalogItems.key, set: { last_checked_at: now } })
    .returning();
  await db.insert(priceHistory).values({
    catalog_item_id: item!.id,
    price: scraped.price,
    currency: scraped.currency,
    in_stock: scraped.inStock,
    source,
  });
  return item!;
}

/** Rebuild the denormalised low/high from history (after cleanups and merges). */
export async function recomputeExtremes(itemId: string) {
  await db.execute(sql`
    update catalog_items c set
      lowest_price = (select min(price) from price_history where catalog_item_id = ${itemId}),
      highest_price = (select max(price) from price_history where catalog_item_id = ${itemId})
    where c.id = ${itemId}`);
}

type TrackerRef = { id: string; user_id: string };

/**
 * When two catalog items turn out to be one product, decide what happens to the
 * trackers of the duplicate: users only tracking the duplicate are moved over;
 * a user tracking both keeps their existing tracker (their alerts are moved to it).
 */
export function planTrackerMerge(from: TrackerRef[], into: TrackerRef[]) {
  const keepByUser = new Map(into.map((t) => [t.user_id, t.id]));
  const move: string[] = [];
  const collapse: Array<{ drop: string; keep: string }> = [];
  for (const t of from) {
    const keep = keepByUser.get(t.user_id);
    if (keep) collapse.push({ drop: t.id, keep });
    else {
      move.push(t.id);
      keepByUser.set(t.user_id, t.id);
    }
  }
  return { move, collapse };
}

/** Fold catalog item `fromId` into `intoId` (same real product), in one transaction. */
export async function mergeItems(fromId: string, intoId: string) {
  if (fromId === intoId) return;
  await db.transaction(async (tx) => {
    const [from, into] = await Promise.all([
      tx.select({ id: products.id, user_id: products.user_id }).from(products).where(eq(products.catalog_item_id, fromId)),
      tx.select({ id: products.id, user_id: products.user_id }).from(products).where(eq(products.catalog_item_id, intoId)),
    ]);
    const plan = planTrackerMerge(from, into);

    if (plan.move.length) {
      await tx.update(products).set({ catalog_item_id: intoId }).where(inArray(products.id, plan.move));
    }
    for (const { drop, keep } of plan.collapse) {
      await tx.update(alerts).set({ product_id: keep }).where(eq(alerts.product_id, drop));
      await tx.delete(products).where(eq(products.id, drop));
    }

    await tx.update(priceHistory).set({ catalog_item_id: intoId }).where(eq(priceHistory.catalog_item_id, fromId));
    // Offers for URLs the surviving item doesn't have yet move over; the rest go with the duplicate.
    await tx.execute(sql`
      update store_offers set catalog_item_id = ${intoId}
      where catalog_item_id = ${fromId}
        and url not in (select url from store_offers where catalog_item_id = ${intoId})`);
    await tx.delete(itemInsights).where(eq(itemInsights.catalog_item_id, fromId));
    await tx.delete(storeOffers).where(eq(storeOffers.catalog_item_id, fromId));
    await tx.delete(catalogItems).where(eq(catalogItems.id, fromId));
  });
  await recomputeExtremes(intoId);
}

/** Point an item at a better key (and canonical URL), merging if that key already exists. */
export async function rekeyItem(item: Pick<CatalogItemRow, "id" | "key">, next: ProductKey) {
  if (item.key === next.key) return { merged: false, itemId: item.id };
  const existing = await findItemByKey(next.key);
  if (existing) {
    await mergeItems(item.id, existing.id);
    return { merged: true, itemId: existing.id };
  }
  await db
    .update(catalogItems)
    .set({ key: next.key, retailer: next.retailer, url: next.canonicalUrl })
    .where(and(eq(catalogItems.id, item.id), eq(catalogItems.key, item.key)));
  return { merged: false, itemId: item.id };
}
