"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/action-result";
import {
  categorizeProduct,
  extractProductFromMarkdown,
  generateDealVerdict,
  isAiEnabled,
} from "@/lib/ai";
import { serverEnv } from "@/lib/env";
import { computeInsights } from "@/lib/insights";
import {
  createFirecrawlScraper,
  ScrapeError,
  type ScrapedProduct,
} from "@/lib/scraper";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  alertRulesSchema,
  firstIssue,
  productUrlSchema,
  uuidSchema,
} from "@/lib/validation";

/** A scrape of the same URL by anyone within this window is reused instead of re-fetched. */
const FRESH_SCRAPE_MS = 6 * 60 * 60 * 1000;

function revalidateApp() {
  revalidatePath("/dashboard");
  revalidatePath("/collections");
}

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

/** Reuse a recent scrape of this exact URL (any user) to save a paid scrape call. */
async function findFreshScrape(url: string): Promise<ScrapedProduct | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("products")
      .select("name, current_price, currency, image_url, in_stock, original_price, last_checked_at")
      .eq("url", url)
      .gte("last_checked_at", new Date(Date.now() - FRESH_SCRAPE_MS).toISOString())
      .order("last_checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      name: data.name,
      price: Number(data.current_price),
      currency: data.currency,
      imageUrl: data.image_url,
      inStock: data.in_stock,
      originalPrice: data.original_price === null ? null : Number(data.original_price),
    };
  } catch {
    return null; // Service key missing locally: just scrape.
  }
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

  const supabase = await createClient();

  let scraped: ScrapedProduct;
  try {
    scraped = (await findFreshScrape(url)) ?? (await scrapeWithFallback(url));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't read that page");
  }

  const { data: existing } = await supabase
    .from("products")
    .select("id, current_price, in_stock")
    .eq("url", url)
    .maybeSingle();

  const now = new Date().toISOString();
  const { data: product, error } = await supabase
    .from("products")
    .upsert(
      {
        user_id: user.id,
        url,
        name: scraped.name,
        current_price: scraped.price,
        original_price: scraped.originalPrice,
        currency: scraped.currency,
        image_url: scraped.imageUrl,
        in_stock: scraped.inStock,
        last_checked_at: now,
        last_error: null,
        fail_count: 0,
        paused: false,
        ...(collectionId ? { collection_id: collectionId } : {}),
      },
      { onConflict: "user_id,url" }
    )
    .select("id")
    .single();

  if (error || !product) {
    console.error("addProduct upsert failed:", error);
    return fail("Couldn't save that product. Please try again.");
  }

  const changed =
    !existing ||
    Number(existing.current_price) !== scraped.price ||
    existing.in_stock !== scraped.inStock;
  if (changed) {
    await supabase.from("price_history").insert({
      product_id: product.id,
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
        await createAdminClient().from("products").update({ category }).eq("id", product.id);
      } catch (err) {
        console.error("Categorize failed:", err);
      }
    });
  }

  revalidateApp();
  return {
    ok: true,
    productId: product.id,
    updated: Boolean(existing),
    message: existing ? "Price refreshed" : `Now tracking ${scraped.name.slice(0, 60)}`,
  };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(productId).success) return fail("Invalid product");
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return fail("Couldn't remove that product");
  revalidateApp();
  return { ok: true, message: "Stopped tracking" };
}

export async function refreshProduct(productId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("url").eq("id", productId).maybeSingle();
  if (!data) return fail("Product not found");
  const result = await addProduct(data.url);
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ target_price: parsed.data.targetPrice, alert_pct: parsed.data.alertPct })
    .eq("id", parsed.data.productId);
  if (error) return fail("Couldn't save alert rules");

  revalidateApp();
  revalidatePath(`/products/${parsed.data.productId}`);
  return { ok: true, message: "Alert rules saved" };
}

export async function setProductPublic(
  productId: string,
  isPublic: boolean
): Promise<ActionResult<{ slug: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_public: isPublic })
    .eq("id", productId)
    .select("share_slug")
    .single();
  if (error || !data) return fail("Couldn't update sharing");
  revalidatePath(`/products/${productId}`);
  return { ok: true, slug: data.share_slug };
}

export async function moveToCollection(
  productId: string,
  collectionId: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ collection_id: collectionId })
    .eq("id", productId);
  if (error) return fail("Couldn't move that product");
  revalidateApp();
  return { ok: true, message: collectionId ? "Added to collection" : "Removed from collection" };
}

export async function resumeChecks(productId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ paused: false, fail_count: 0, last_error: null })
    .eq("id", productId);
  if (error) return fail("Couldn't resume checks");
  revalidateApp();
  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Daily checks resumed" };
}

export async function generateVerdict(productId: string): Promise<ActionResult> {
  if (!isAiEnabled()) return fail("AI insights aren't configured on this deployment");

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name, current_price, currency, original_price, in_stock, price_history(price, checked_at)")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return fail("Product not found");

  const { data: allowed } = await supabase.rpc("consume_ai_quota", {
    daily_limit: serverEnv("AI_DAILY_LIMIT"),
  });
  if (!allowed) return fail("Daily AI limit reached. Try again tomorrow.");

  try {
    const current = Number(product.current_price);
    const insights = computeInsights(
      product.price_history.map((h) => ({ price: Number(h.price), checked_at: h.checked_at })),
      current
    );
    const verdict = await generateDealVerdict({
      name: product.name,
      currentPrice: current,
      currency: product.currency,
      originalPrice: product.original_price === null ? null : Number(product.original_price),
      inStock: product.in_stock,
      insights,
    });

    const { error } = await supabase.from("product_insights").upsert({
      product_id: product.id,
      verdict: verdict.verdict,
      confidence: Math.round(verdict.confidence * 100) / 100,
      summary: verdict.summary,
      reasons: verdict.reasons,
      price_at_generation: current,
      model: serverEnv("AI_MODEL"),
      generated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error("Verdict failed:", error);
    return fail("Couldn't generate a verdict right now");
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
