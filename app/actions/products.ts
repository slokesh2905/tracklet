"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { fail, type ActionResult } from "@/lib/action-result";
import {
  categorizeProduct,
  extractProductFromMarkdown,
  generateDealVerdict,
  isAiEnabled,
} from "@/lib/ai";
import { db } from "@/lib/db";
import { priceHistory, productInsights, products } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { computeInsights } from "@/lib/insights";
import { aiModelId } from "@/lib/ai-provider";
import { consumeAiQuota, ownsCollection } from "@/lib/ownership";
import { createFirecrawlScraper, ScrapeError, type ScrapedProduct } from "@/lib/scraper";
import { getUser } from "@/lib/session";
import { alertRulesSchema, firstIssue, productUrlSchema, uuidSchema } from "@/lib/validation";

/** A scrape of the same URL by anyone within this window is reused instead of re-fetched. */
const FRESH_SCRAPE_MS = 6 * 60 * 60 * 1000;

function revalidateApp() {
  revalidatePath("/dashboard");
  revalidatePath("/collections");
}

/** Scopes a product query to its owner; every write below goes through this. */
const owned = (productId: string, userId: string) =>
  and(eq(products.id, productId), eq(products.user_id, userId));

async function scrapeWithFallback(url: string): Promise<ScrapedProduct> {
  const scraper = createFirecrawlScraper(serverEnv("FIRECRAWL_API_KEY"));
  try {
    return await scraper.scrape(url);
  } catch (error) {
    if (error instanceof ScrapeError && error.markdown && isAiEnabled()) {
      const product = await extractProductFromMarkdown(url, error.markdown).catch(() => null);
      if (product) return product;
    }
    throw error;
  }
}

/** Reuse a recent scrape of this exact URL (any user) to save a paid scrape call. Only price data is read. */
async function findFreshScrape(url: string): Promise<ScrapedProduct | null> {
  const row = await db.query.products.findFirst({
    columns: { name: true, current_price: true, currency: true, image_url: true, in_stock: true, original_price: true },
    where: and(
      eq(products.url, url),
      gte(products.last_checked_at, new Date(Date.now() - FRESH_SCRAPE_MS).toISOString())
    ),
    orderBy: desc(products.last_checked_at),
  });
  if (!row) return null;
  return {
    name: row.name,
    price: row.current_price,
    currency: row.currency,
    imageUrl: row.image_url,
    inStock: row.in_stock,
    originalPrice: row.original_price,
  };
}

export async function addProduct(
  rawUrl: string,
  collectionId?: string | null
): Promise<ActionResult<{ productId: string; updated: boolean }>> {
  const parsed = productUrlSchema.safeParse(rawUrl);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const url = parsed.data;

  const user = await getUser();
  if (!user) return fail("Please sign in first");
  if (collectionId && !(await ownsCollection(user.id, collectionId))) return fail("Collection not found");

  let scraped: ScrapedProduct;
  try {
    scraped = (await findFreshScrape(url)) ?? (await scrapeWithFallback(url));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't read that page");
  }

  const existing = await db.query.products.findFirst({
    columns: { id: true, current_price: true, in_stock: true },
    where: and(eq(products.user_id, user.id), eq(products.url, url)),
  });

  const fields = {
    name: scraped.name,
    current_price: scraped.price,
    original_price: scraped.originalPrice,
    currency: scraped.currency,
    image_url: scraped.imageUrl,
    in_stock: scraped.inStock,
    last_checked_at: new Date().toISOString(),
    last_error: null,
    fail_count: 0,
    paused: false,
    ...(collectionId ? { collection_id: collectionId } : {}),
  };

  let productId: string;
  try {
    const [row] = await db
      .insert(products)
      .values({ user_id: user.id, url, ...fields })
      .onConflictDoUpdate({ target: [products.user_id, products.url], set: fields })
      .returning({ id: products.id });
    productId = row!.id;
  } catch (error) {
    console.error("addProduct upsert failed:", error);
    return fail("Couldn't save that product. Please try again.");
  }

  const changed =
    !existing || existing.current_price !== scraped.price || existing.in_stock !== scraped.inStock;
  if (changed) {
    await db.insert(priceHistory).values({
      product_id: productId,
      price: scraped.price,
      currency: scraped.currency,
      in_stock: scraped.inStock,
    });
  }

  // Categorise after the response is sent; the user never waits on the model.
  if (!existing && isAiEnabled()) {
    after(async () => {
      try {
        const category = await categorizeProduct(scraped.name);
        await db.update(products).set({ category }).where(eq(products.id, productId));
      } catch (err) {
        console.error("Categorize failed:", err);
      }
    });
  }

  revalidateApp();
  return {
    ok: true,
    productId,
    updated: Boolean(existing),
    message: existing ? "Price refreshed" : `Now tracking ${scraped.name.slice(0, 60)}`,
  };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const deleted = await db.delete(products).where(owned(productId, user.id)).returning({ id: products.id });
  if (deleted.length === 0) return fail("Product not found");
  revalidateApp();
  return { ok: true, message: "Stopped tracking" };
}

export async function refreshProduct(productId: string) {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const row = await db.query.products.findFirst({ columns: { url: true }, where: owned(productId, user.id) });
  if (!row) return fail("Product not found");
  const result = await addProduct(row.url);
  revalidatePath(`/products/${productId}`);
  return result;
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

export async function setProductPublic(
  productId: string,
  isPublic: boolean
): Promise<ActionResult<{ slug: string }>> {
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

export async function moveToCollection(
  productId: string,
  collectionId: string | null
): Promise<ActionResult> {
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

  const updated = await db
    .update(products)
    .set({ paused: false, fail_count: 0, last_error: null })
    .where(owned(productId, user.id))
    .returning({ id: products.id });
  if (updated.length === 0) return fail("Couldn't resume checks");

  revalidateApp();
  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Daily checks resumed" };
}

export async function generateVerdict(productId: string): Promise<ActionResult> {
  if (!isAiEnabled()) return fail("AI insights aren't configured on this deployment");
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const product = await db.query.products.findFirst({
    where: owned(productId, user.id),
    with: { priceHistory: { columns: { price: true, checked_at: true }, orderBy: asc(priceHistory.checked_at) } },
  });
  if (!product) return fail("Product not found");

  if (!(await consumeAiQuota(user.id, serverEnv("AI_DAILY_LIMIT")))) {
    return fail("Daily AI limit reached. Try again tomorrow.");
  }

  try {
    const insights = computeInsights(product.priceHistory, product.current_price);
    const verdict = await generateDealVerdict({
      name: product.name,
      currentPrice: product.current_price,
      currency: product.currency,
      originalPrice: product.original_price,
      inStock: product.in_stock,
      insights,
    });

    const values = {
      verdict: verdict.verdict,
      confidence: Math.round(verdict.confidence * 100) / 100,
      summary: verdict.summary,
      reasons: verdict.reasons,
      price_at_generation: product.current_price,
      model: aiModelId(),
      generated_at: new Date().toISOString(),
    };
    await db
      .insert(productInsights)
      .values({ product_id: product.id, ...values })
      .onConflictDoUpdate({ target: productInsights.product_id, set: values });
  } catch (error) {
    console.error("Verdict failed:", error);
    return fail("Couldn't generate a verdict right now");
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
