import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { count, eq, sql } from "drizzle-orm";
import { isAiEnabled, judgeSameProduct } from "@/lib/ai";
import { COMPARE_DOMAINS, findOffers } from "@/lib/compare";
import { canAffordComparison } from "@/lib/credit-budget";
import { db } from "@/lib/db";
import { catalogItems, storeOffers, type CatalogItemRow } from "@/lib/db/schema";
import { getFirecrawlCredits } from "@/lib/firecrawl-credits";
import { makeScraper } from "@/lib/reader";

/** Shared across users: one comparison per product per week is plenty. */
export const COMPARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A user may ask for a fresh comparison at most this often per product. */
export const MANUAL_COMPARE_MIN_MS = 24 * 60 * 60 * 1000;

export type CompareResult =
  | { status: "done"; offers: number }
  | { status: "skipped"; reason: "recent" | "budget" | "unavailable" };

async function activeItemCount() {
  const [row] = await db
    .select({ n: count() })
    .from(catalogItems)
    .where(sql`not ${catalogItems.paused} and exists (select 1 from products p where p.catalog_item_id = ${catalogItems.id})`);
  return row?.n ?? 0;
}

/**
 * Find this product on other stores and cache the offers, if the free credit
 * budget allows. Never throws; failures just mean no comparison this time.
 */
export async function runComparison(
  item: Pick<CatalogItemRow, "id" | "key" | "retailer" | "name" | "currency" | "compared_at">,
  { minAgeMs = COMPARE_TTL_MS } = {}
): Promise<CompareResult> {
  if (item.compared_at && Date.now() - new Date(item.compared_at).getTime() < minAgeMs) {
    return { status: "skipped", reason: "recent" };
  }

  const key = process.env.FIRECRAWL_API_KEY;
  const credits = await getFirecrawlCredits();
  if (!key || !credits) return { status: "skipped", reason: "unavailable" };
  if (!canAffordComparison({ ...credits, activeItems: await activeItemCount() })) {
    return { status: "skipped", reason: "budget" };
  }

  try {
    const firecrawl = new Firecrawl({ apiKey: key });
    const offers = await findOffers(item, {
      search: async (query) => {
        const res = await firecrawl.search(query, {
          limit: 5,
          includeDomains: COMPARE_DOMAINS,
          country: "IN",
          sources: ["web"],
        });
        return (res.web ?? []).flatMap((r) =>
          "url" in r && typeof r.url === "string" ? [{ url: r.url, title: r.title ?? "" }] : []
        );
      },
      scraper: makeScraper(),
      judge: isAiEnabled() ? judgeSameProduct : null,
    });

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.delete(storeOffers).where(eq(storeOffers.catalog_item_id, item.id));
      if (offers.length) {
        await tx.insert(storeOffers).values(
          offers.map((o) => ({
            catalog_item_id: item.id,
            retailer: o.retailer,
            url: o.url,
            name: o.name,
            price: o.price,
            currency: o.currency,
            in_stock: o.inStock,
            match: o.match,
            checked_at: now,
          }))
        );
      }
      await tx.update(catalogItems).set({ compared_at: now }).where(eq(catalogItems.id, item.id));
    });
    return { status: "done", offers: offers.length };
  } catch (error) {
    console.error("Comparison failed:", error);
    return { status: "skipped", reason: "unavailable" };
  }
}
