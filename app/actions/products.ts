"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, count, eq, min, ne } from "drizzle-orm";
import { fail, type ActionResult } from "@/lib/action-result";
import { categorizeProduct, generateDealVerdict, isAiEnabled } from "@/lib/ai";
import { aiModelId } from "@/lib/ai-provider";
import { backfillFromArchive } from "@/lib/archive";
import { createItem, findItemByKey, rekeyItem } from "@/lib/catalog";
import { MANUAL_COMPARE_MIN_MS, runComparison } from "@/lib/comparison-runner";
import { toStoreOffers } from "@/lib/data";
import { db } from "@/lib/db";
import { catalogItems, itemInsights, priceHistory, products, type CatalogItemRow } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { buildEvidence, gateVerdict } from "@/lib/evidence";
import { computeInsights, firstSeenAt, HISTORY_COLUMNS } from "@/lib/insights";
import { consumeAddQuota, consumeAiQuota, ownsCollection } from "@/lib/ownership";
import { processReading, type PipelineItem } from "@/lib/pipeline";
import { createDbPipelineStore, loadPipelineItem } from "@/lib/pipeline-store";
import { guardPrice } from "@/lib/price-guard";
import { productKeyFromUrl, resolveUrl } from "@/lib/product-key";
import { makeScraper } from "@/lib/reader";
import { getUser } from "@/lib/session";
import { alertRulesSchema, firstIssue, newAlertRulesSchema, productUrlSchema, uuidSchema } from "@/lib/validation";

/** A catalog item read this recently is attached as-is: no fetch, no credits. */
const FRESH_MS = 6 * 60 * 60 * 1000;
/** A preview re-reads a known item whose last reading is older than this, so it never shows a stale price. */
const PREVIEW_FRESH_MS = 24 * 60 * 60 * 1000;
/** "Check now" re-reads an item at most this often (shared by everyone tracking it). */
const MANUAL_CHECK_MIN_MS = 60 * 60 * 1000;

function revalidateApp() {
  revalidatePath("/home");
  revalidatePath("/dashboard");
  revalidatePath("/collections");
}

/** Scopes a tracking row to its owner; every write below goes through this. */
const owned = (productId: string, userId: string) => and(eq(products.id, productId), eq(products.user_id, userId));

const within = (at: string | null, ms: number) => Boolean(at) && Date.now() - new Date(at!).getTime() < ms;
/** Checked (attempted) recently: for rate limits. */
const isFresh = (item: Pick<CatalogItemRow, "last_checked_at">, ms: number) => within(item.last_checked_at, ms);
/** Read successfully recently: the stored price can be trusted as current. */
const isReadRecently = (item: Pick<CatalogItemRow, "last_read_at">, ms: number) => within(item.last_read_at, ms);

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
  last_read_at: i.last_read_at,
});

/** Background work after a new catalog item appears: category, older prices from the archive, cross-store prices. */
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
    if (!item.archived_at) await backfillFromArchive(item.id);
    await runComparison(item);
  });
}

type ReadResult = { ok: true; item: CatalogItemRow; created: boolean } | { ok: false; error: string };

/**
 * Fetch the page behind `resolved` and store the reading: a new catalog item, or a fresh reading
 * for `existing`. This is the only place a page is fetched on behalf of a user adding a product,
 * so it is also where the daily read limit applies.
 */
async function readAndStore(userId: string, resolved: string, existing: CatalogItemRow | null): Promise<ReadResult> {
  if (!(await consumeAddQuota(userId, serverEnv("ADD_DAILY_LIMIT")))) {
    return { ok: false, error: "You've reached today's limit for adding products. Try again tomorrow." };
  }

  let scraped;
  try {
    scraped = await makeScraper().scrape(resolved);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't read that page" };
  }
  // The page itself may reveal a more precise identity (final URL after redirects, SKU).
  const key = productKeyFromUrl(scraped.finalUrl ?? resolved, scraped.sku);
  const item = existing ?? (await findItemByKey(key.key));

  if (!item) {
    const first = guardPrice({
      price: scraped.price,
      originalPrice: scraped.originalPrice,
      method: scraped.method ?? "jsonld",
      lastConfirmed: null,
      pending: null,
    });
    if (first.action === "reject") {
      return { ok: false, error: "We couldn't read a reliable price from that page. Please try again later." };
    }
    return { ok: true, item: await createItem(key, scraped), created: true };
  }

  if (item.key !== key.key && item.key.startsWith("url:")) await rekeyItem(item, key);
  await processReading(toPipelineItem(item), scraped, createDbPipelineStore());
  return { ok: true, item: (await findItemByKey(key.key)) ?? item, created: false };
}

/** What the add flow shows before anything is tracked. */
export type ProductPreview = {
  name: string;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  inStock: boolean;
  /** Set when the user already tracks this product. */
  trackedProductId: string | null;
  /** Other people already tracking it: they share its price history. */
  otherShoppers: number;
  /** The first price we recorded for it, if any. */
  historySince: string | null;
};

/**
 * Read a product so the user can confirm it (and set an alert) before tracking it. A known product
 * read in the last day is returned as stored, costing nothing; an older one (nobody has tracked it
 * lately) is re-read first. An unknown one is read once and added to the shared catalog. Either way
 * adding it afterwards finds it fresh, so the price is never re-read and never taken from the client.
 */
export async function previewProduct(rawUrl: string): Promise<ActionResult<{ preview: ProductPreview }>> {
  const parsed = productUrlSchema.safeParse(rawUrl);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const resolved = await resolveUrl(parsed.data);
  let item = await findItemByKey(productKeyFromUrl(resolved).key);
  if (!item || !isReadRecently(item, PREVIEW_FRESH_MS)) {
    const read = await readAndStore(user.id, resolved, item);
    if (read.ok) item = read.item;
    // A stale known item can still be shown (with its last price) if the re-read fails.
    else if (!item) return fail(read.error);
  }

  const [tracking, [others], [first]] = await Promise.all([
    db.query.products.findFirst({
      columns: { id: true },
      where: and(eq(products.user_id, user.id), eq(products.catalog_item_id, item.id)),
    }),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.catalog_item_id, item.id), ne(products.user_id, user.id))),
    db.select({ at: min(priceHistory.checked_at) }).from(priceHistory).where(eq(priceHistory.catalog_item_id, item.id)),
  ]);
  return {
    ok: true,
    preview: {
      name: item.name,
      imageUrl: item.image_url,
      price: item.current_price,
      originalPrice: item.original_price,
      currency: item.currency,
      inStock: item.in_stock,
      trackedProductId: tracking?.id ?? null,
      otherShoppers: others?.n ?? 0,
      historySince: first?.at ?? null,
    },
  };
}

type AddOptions = {
  collectionId?: string | null;
  /** Alert rules to start with; empty means "alert on every drop". */
  targetPrice?: string | number | null;
  alertPct?: string | number | null;
};

export async function addProduct(
  rawUrl: string,
  { collectionId, targetPrice, alertPct }: AddOptions = {}
): Promise<ActionResult<{ productId: string; updated: boolean }>> {
  const parsed = productUrlSchema.safeParse(rawUrl);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const rules = newAlertRulesSchema.safeParse({ targetPrice, alertPct });
  if (!rules.success) return fail(firstIssue(rules.error));

  const user = await getUser();
  if (!user) return fail("Please sign in first");
  if (collectionId && !(await ownsCollection(user.id, collectionId))) return fail("Collection not found");

  // Share links (dl.flipkart.com/s/…, amzn.in/…) resolve to the product they point at.
  const resolved = await resolveUrl(parsed.data);
  let item = await findItemByKey(productKeyFromUrl(resolved).key);
  let created = false;

  if (!item || !isReadRecently(item, FRESH_MS)) {
    const read = await readAndStore(user.id, resolved, item);
    if (!read.ok) return fail(read.error);
    ({ item, created } = read);
  }

  const hasRules = rules.data.targetPrice !== null || rules.data.alertPct !== null;
  const ruleValues = { target_price: rules.data.targetPrice, alert_pct: rules.data.alertPct };
  const [tracking] = await db
    .insert(products)
    .values({
      user_id: user.id,
      catalog_item_id: item.id,
      ...(collectionId ? { collection_id: collectionId } : {}),
      ...ruleValues,
    })
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
    // Re-adding with a choice made is an update; re-adding bare leaves what was set alone.
    const changes = { ...(collectionId ? { collection_id: collectionId } : {}), ...(hasRules ? ruleValues : {}) };
    if (Object.keys(changes).length > 0) await db.update(products).set(changes).where(eq(products.id, productId));
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

/** Read an item's page now and run the reading through the usual price pipeline. */
async function checkItem(item: CatalogItemRow) {
  let scraped;
  try {
    scraped = await makeScraper().scrape(item.url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't read that page" };
  }
  const pipelineItem = (await loadPipelineItem(item.id)) ?? toPipelineItem(item);
  return processReading(pipelineItem, scraped, createDbPipelineStore());
}

/** Pages read at once by "Check now" for everything; enough to be quick, gentle on the stores. */
const CHECK_ALL_CONCURRENCY = 3;

/**
 * Home's "Check now": re-reads every tracked product not checked in the last hour (the same
 * rule as a single product's Check now), skipping paused ones, which have their own Resume.
 */
export async function refreshAllProducts(): Promise<ActionResult<{ checked: number; changed: number; failed: number }>> {
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const rows = await db.query.products.findMany({
    columns: { id: true },
    where: eq(products.user_id, user.id),
    with: { item: true },
  });
  const due = rows.map((r) => r.item).filter((item) => !item.paused && !isFresh(item, MANUAL_CHECK_MIN_MS));
  if (due.length === 0) return { ok: true, checked: 0, changed: 0, failed: 0, message: "Prices are up to date (checked within the last hour)" };

  let changed = 0;
  let failed = 0;
  const queue = [...due];
  await Promise.all(
    Array.from({ length: Math.min(CHECK_ALL_CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const read = await checkItem(item);
        if ("error" in read || read.outcome === "rejected") failed++;
        else if (read.outcome === "changed") changed++;
      }
    })
  );

  revalidateApp();
  const message =
    changed > 0
      ? `${changed} price${changed === 1 ? "" : "s"} changed`
      : failed === due.length
        ? "We couldn't read the stores right now"
        : "No new changes since the last check";
  return { ok: true, checked: due.length, changed, failed, message };
}

export async function refreshProduct(productId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const item = await ownedItem(productId, user.id);
  if (!item) return fail("Product not found");
  if (isFresh(item, MANUAL_CHECK_MIN_MS)) return { ok: true, message: "Price is up to date (checked within the last hour)" };

  const read = await checkItem(item);
  if ("error" in read) return fail(read.error);
  const { outcome } = read;

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
  revalidatePath(`/products/${productId}`);
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
          priceHistory: { columns: HISTORY_COLUMNS, orderBy: asc(priceHistory.checked_at) },
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
    firstSeen: firstSeenAt(item.priceHistory, item.created_at),
    shoppers: item.trackers.length,
    insights,
    history: item.priceHistory,
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
  revalidatePath("/home");
  revalidatePath("/dashboard");
  return { ok: true };
}
