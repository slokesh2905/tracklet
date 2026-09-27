"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { fail, type ActionResult } from "@/lib/action-result";
import { categorizeProduct, generateDealVerdict, isAiEnabled } from "@/lib/ai";
import { aiModelId } from "@/lib/ai-provider";
import { createItem, findItemByKey, rekeyItem } from "@/lib/catalog";
import { MANUAL_COMPARE_MIN_MS, runComparison } from "@/lib/comparison-runner";
import { toStoreOffers } from "@/lib/data";
import { db } from "@/lib/db";
import { catalogItems, itemInsights, priceHistory, products, type CatalogItemRow } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { buildEvidence, gateVerdict } from "@/lib/evidence";
import { computeInsights } from "@/lib/insights";
import { consumeAiQuota, ownsCollection } from "@/lib/ownership";
import { processReading, type PipelineItem } from "@/lib/pipeline";
import { createDbPipelineStore, loadPipelineItem } from "@/lib/pipeline-store";
import { guardPrice } from "@/lib/price-guard";
import { productKeyFromUrl, resolveUrl } from "@/lib/product-key";
import { makeScraper } from "@/lib/reader";
import { getUser } from "@/lib/session";
import { alertRulesSchema, firstIssue, productUrlSchema, uuidSchema } from "@/lib/validation";

/** A catalog item checked this recently is attached as-is: no fetch, no credits. */
const FRESH_MS = 6 * 60 * 60 * 1000;
/** "Check now" re-reads an item at most this often (shared by everyone tracking it). */
const MANUAL_CHECK_MIN_MS = 60 * 60 * 1000;

function revalidateApp() {
  revalidatePath("/dashboard");
  revalidatePath("/collections");
}

/** Scopes a tracking row to its owner; every write below goes through this. */
const owned = (productId: string, userId: string) => and(eq(products.id, productId), eq(products.user_id, userId));

const isFresh = (item: Pick<CatalogItemRow, "last_checked_at">, ms: number) =>
  Boolean(item.last_checked_at) && Date.now() - new Date(item.last_checked_at!).getTime() < ms;

const toPipelineItem = (i: CatalogItemRow): PipelineItem => ({
  id: i.id,
  url: i.url,
  name: i.name,
  current_price: i.current_price,
  original_price: i.original_price,
  currency: i.currency,
  image_url: i.image_url,
  in_stock: i.in_stock,
  lowest_price: i.lowest_price,
  pending_price: i.pending_price,
  fail_count: i.fail_count,
});

/** Background work after a new catalog item appears: category + cross-store prices. */
function enrichInBackground(item: CatalogItemRow) {
  after(async () => {
    if (!item.category && isAiEnabled()) {
      try {
        const category = await categorizeProduct(item.name);
        await db.update(catalogItems).set({ category }).where(eq(catalogItems.id, item.id));
      } catch (err) {
        console.error("Categorize failed:", err);
      }
    }
    await runComparison(item);
  });
}

export async function addProduct(
  rawUrl: string,
  collectionId?: string | null
): Promise<ActionResult<{ productId: string; updated: boolean }>> {
  const parsed = productUrlSchema.safeParse(rawUrl);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const user = await getUser();
  if (!user) return fail("Please sign in first");
  if (collectionId && !(await ownsCollection(user.id, collectionId))) return fail("Collection not found");

  // Share links (dl.flipkart.com/s/…, amzn.in/…) resolve to the product they point at.
  const resolved = await resolveUrl(parsed.data);
  let item = await findItemByKey(productKeyFromUrl(resolved).key);
  let created = false;

  if (!item || !isFresh(item, FRESH_MS)) {
    let scraped;
    try {
      scraped = await makeScraper().scrape(resolved);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Couldn't read that page");
    }
    // The page itself may reveal a more precise identity (final URL after redirects, SKU).
    const key = productKeyFromUrl(scraped.finalUrl ?? resolved, scraped.sku);
    item ??= await findItemByKey(key.key);

    if (!item) {
      const first = guardPrice({
        price: scraped.price,
        originalPrice: scraped.originalPrice,
        method: scraped.method ?? "jsonld",
        lastConfirmed: null,
        pending: null,
      });
      if (first.action === "reject") {
        return fail("We couldn't read a reliable price from that page. Please try again later.");
      }
      item = await createItem(key, scraped);
      created = true;
    } else {
      if (item.key !== key.key && item.key.startsWith("url:")) await rekeyItem(item, key);
      await processReading(toPipelineItem(item), scraped, createDbPipelineStore());
      item = (await findItemByKey(key.key)) ?? item;
    }
  }

  const [tracking] = await db
    .insert(products)
    .values({ user_id: user.id, catalog_item_id: item.id, ...(collectionId ? { collection_id: collectionId } : {}) })
    .onConflictDoNothing({ target: [products.user_id, products.catalog_item_id] })
    .returning({ id: products.id });

  let productId = tracking?.id;
  const alreadyTracking = !productId;
  if (alreadyTracking) {
    const existing = await db.query.products.findFirst({
      columns: { id: true },
      where: and(eq(products.user_id, user.id), eq(products.catalog_item_id, item.id)),
    });
    productId = existing!.id;
    if (collectionId) await db.update(products).set({ collection_id: collectionId }).where(eq(products.id, productId));
  }

  if (created || !item.compared_at) enrichInBackground(item);

  revalidateApp();
  return {
    ok: true,
    productId: productId!,
    updated: alreadyTracking,
    message: alreadyTracking ? "You're already tracking this product" : `Now tracking ${item.name.slice(0, 60)}`,
  };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  // Removes only this user's tracking; the shared catalog item and its history stay
  // (untracked items are skipped by the daily check, so they cost nothing).
  const deleted = await db.delete(products).where(owned(productId, user.id)).returning({ id: products.id });
  if (deleted.length === 0) return fail("Product not found");
  revalidateApp();
  return { ok: true, message: "Stopped tracking" };
}

async function ownedItem(productId: string, userId: string) {
  const row = await db.query.products.findFirst({
    columns: { id: true },
    where: owned(productId, userId),
    with: { item: true },
  });
  return row?.item ?? null;
}

export async function refreshProduct(productId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const item = await ownedItem(productId, user.id);
  if (!item) return fail("Product not found");
  if (isFresh(item, MANUAL_CHECK_MIN_MS)) return { ok: true, message: "Price is up to date (checked within the last hour)" };

  let scraped;
  try {
    scraped = await makeScraper().scrape(item.url);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't read that page");
  }
  const pipelineItem = (await loadPipelineItem(item.id)) ?? toPipelineItem(item);
  const { outcome } = await processReading(pipelineItem, scraped, createDbPipelineStore());

  revalidateApp();
  revalidatePath(`/products/${productId}`);
  if (outcome === "held") return { ok: true, message: "The price changed a lot. We'll confirm it on the next check." };
  if (outcome === "rejected") return fail("We couldn't read a reliable price right now");
  return { ok: true, message: outcome === "changed" ? "Price updated" : "Price is up to date" };
}

export async function updateAlertRules(input: {
  productId: string;
  targetPrice: string | number | null;
  alertPct: string | number | null;
}): Promise<ActionResult> {
  const parsed = alertRulesSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const updated = await db
    .update(products)
    .set({ target_price: parsed.data.targetPrice, alert_pct: parsed.data.alertPct })
    .where(owned(parsed.data.productId, user.id))
    .returning({ id: products.id });
  if (updated.length === 0) return fail("Product not found");

  revalidateApp();
  revalidatePath(`/products/${parsed.data.productId}`);
  return { ok: true, message: "Alert rules saved" };
}

export async function setProductPublic(productId: string, isPublic: boolean): Promise<ActionResult<{ slug: string }>> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const [row] = await db
    .update(products)
    .set({ is_public: isPublic })
    .where(owned(productId, user.id))
    .returning({ slug: products.share_slug });
  if (!row) return fail("Couldn't update sharing");

  revalidatePath(`/products/${productId}`);
  // Public pages are cached; making one private must take effect immediately.
  revalidatePath(`/p/${row.slug}`);
  return { ok: true, slug: row.slug };
}

export async function moveToCollection(productId: string, collectionId: string | null): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");
  if (collectionId && !(await ownsCollection(user.id, collectionId))) return fail("Collection not found");

  const updated = await db
    .update(products)
    .set({ collection_id: collectionId })
    .where(owned(productId, user.id))
    .returning({ id: products.id });
  if (updated.length === 0) return fail("Couldn't move that product");

  revalidateApp();
  return { ok: true, message: collectionId ? "Added to collection" : "Removed from collection" };
}

export async function resumeChecks(productId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const item = await ownedItem(productId, user.id);
  if (!item) return fail("Product not found");
  await db.update(catalogItems).set({ paused: false, fail_count: 0, last_error: null }).where(eq(catalogItems.id, item.id));

  revalidateApp();
  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Daily checks resumed" };
}

export async function compareStores(productId: string): Promise<ActionResult<{ offers: number }>> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const item = await ownedItem(productId, user.id);
  if (!item) return fail("Product not found");

  const result = await runComparison(item, { minAgeMs: MANUAL_COMPARE_MIN_MS });
  revalidatePath(`/products/${productId}`);
  revalidateApp();

  if (result.status === "done") {
    return {
      ok: true,
      offers: result.offers,
      message: result.offers ? `Found ${result.offers} other store${result.offers === 1 ? "" : "s"}` : "No other stores sell this exact item",
    };
  }
  if (result.reason === "recent") return { ok: true, offers: 0, message: "Compared within the last day" };
  if (result.reason === "budget") return fail("Comparisons are paused until next month to stay within the free plan");
  return fail("Store comparison isn't available right now");
}

export async function generateVerdict(productId: string): Promise<ActionResult> {
  if (!isAiEnabled()) return fail("AI insights aren't configured on this deployment");
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const row = await db.query.products.findFirst({
    columns: { id: true },
    where: owned(productId, user.id),
    with: {
      item: {
        with: {
          priceHistory: { columns: { price: true, checked_at: true }, orderBy: asc(priceHistory.checked_at) },
          offers: true,
          trackers: { columns: { id: true } },
        },
      },
    },
  });
  if (!row) return fail("Product not found");
  const { item } = row;

  const insights = computeInsights(item.priceHistory, item.current_price);
  const evidence = buildEvidence({
    currentPrice: item.current_price,
    currency: item.currency,
    originalPrice: item.original_price,
    inStock: item.in_stock,
    firstSeen: item.priceHistory[0]?.checked_at ?? item.created_at,
    shoppers: item.trackers.length,
    insights,
    offers: toStoreOffers(item.offers),
  });
  const gate = gateVerdict(evidence);
  if (gate.kind === "insufficient") return fail("Not enough price data yet. Try comparing stores instead.");

  if (!(await consumeAiQuota(user.id, serverEnv("AI_DAILY_LIMIT")))) {
    return fail("Daily AI limit reached. Try again tomorrow.");
  }

  try {
    const verdict = await generateDealVerdict({ name: item.name, evidence, gate });
    const values = {
      verdict: verdict.verdict,
      confidence: Math.round(verdict.confidence * 100) / 100,
      summary: verdict.summary,
      reasons: verdict.reasons,
      evidence: {
        coverage: evidence.coverage,
        discountPct: evidence.discountPct,
        bestOffer: evidence.bestOffer,
        daysTracked: insights.daysTracked,
        dataPoints: insights.dataPoints,
        shoppers: evidence.shoppers,
      },
      price_at_generation: item.current_price,
      model: aiModelId(),
      generated_at: new Date().toISOString(),
    };
    await db
      .insert(itemInsights)
      .values({ catalog_item_id: item.id, ...values })
      .onConflictDoUpdate({ target: itemInsights.catalog_item_id, set: values });
  } catch (error) {
    console.error("Verdict failed:", error);
    return fail("Couldn't generate a verdict right now");
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
