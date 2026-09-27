import * as cheerio from "cheerio";
import { normalizeCurrency, parsePrice } from "@/lib/format";

/** How a price was read. Deterministic methods are trusted; `llm` readings need confirming. */
export type ExtractMethod = "jsonld" | "og" | "selector" | "llm";

export type ExtractedProduct = {
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  originalPrice: number | null;
  /** Retailer SKU / product id when the page declares one. */
  sku: string | null;
  /** <link rel=canonical> or og:url, when present. */
  canonicalUrl: string | null;
  method: ExtractMethod;
};

type ProductFields = Omit<ExtractedProduct, "method" | "canonicalUrl">;

const toArray = <T,>(v: T | T[] | undefined | null): T[] => (Array.isArray(v) ? v : v ? [v] : []);

const round = (n: number) => Math.round(n * 100) / 100;

function httpUrl(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : null;
  return s && /^https?:\/\//.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org Product / Offer / AggregateOffer). Flipkart and most
// modern stores publish this for search engines: the cheapest, most reliable source.
// ---------------------------------------------------------------------------

function isType(node: Record<string, unknown>, type: string) {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function collectProducts(value: unknown, out: Record<string, unknown>[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v) => collectProducts(v, out));
    return;
  }
  const node = value as Record<string, unknown>;
  if (isType(node, "Product")) out.push(node);
  for (const child of Object.values(node)) collectProducts(child, out);
}

function offerPrice(offer: Record<string, unknown>) {
  const spec = offer.priceSpecification as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const specs = toArray(spec);
  const listSpec = specs.find((s) => /ListPrice|StrikethroughPrice|MSRP/i.test(String(s.priceType ?? "")));
  const saleSpec = specs.find((s) => s !== listSpec && s.price !== undefined);
  return {
    price: parsePrice(offer.price ?? offer.lowPrice ?? saleSpec?.price),
    currency: (offer.priceCurrency ?? saleSpec?.priceCurrency) as string | undefined,
    listPrice: listSpec ? parsePrice(listSpec.price) : null,
    availability: String(offer.availability ?? ""),
  };
}

export function extractJsonLd(html: string): ProductFields | null {
  const $ = cheerio.load(html);
  const products: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text().replace(/[\u0000-\u001f]+/g, " ");
    try {
      collectProducts(JSON.parse(text), products);
    } catch {
      // Malformed block on the page: skip it.
    }
  });

  for (const p of products) {
    type Node = Record<string, unknown>;
    // An AggregateOffer may carry its own lowPrice and/or nested offers.
    const offers = toArray(p.offers as Node | Node[]).flatMap((o) =>
      isType(o, "AggregateOffer") ? [...toArray(o.offers as Node | Node[]), o] : [o]
    );
    const priced = offers.map(offerPrice).find((o) => o.price !== null && o.price > 0);
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!priced || !name) continue;

    const image = Array.isArray(p.image) ? p.image[0] : p.image;
    const imageUrl = httpUrl(typeof image === "object" && image ? (image as { url?: string }).url : image);
    return {
      name: name.slice(0, 300),
      price: round(priced.price!),
      currency: normalizeCurrency(priced.currency ?? null, "INR"),
      imageUrl,
      inStock: !/OutOfStock|SoldOut|Discontinued/i.test(priced.availability),
      originalPrice: priced.listPrice && priced.listPrice > priced.price! ? round(priced.listPrice) : null,
      sku: typeof p.sku === "string" ? p.sku : typeof p.productID === "string" ? p.productID : null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// OpenGraph product tags (Shopify and many smaller stores).
// ---------------------------------------------------------------------------

export function extractOpenGraph(html: string): ProductFields | null {
  const $ = cheerio.load(html);
  const meta = (prop: string) =>
    $(`meta[property="${prop}"]`).attr("content") ?? $(`meta[name="${prop}"]`).attr("content") ?? null;

  const price = parsePrice(meta("product:price:amount") ?? meta("og:price:amount"));
  const name = (meta("og:title") ?? "").trim();
  if (!price || !name) return null;
  const availability = meta("product:availability") ?? meta("og:availability") ?? "";
  return {
    name: name.slice(0, 300),
    price: round(price),
    currency: normalizeCurrency(meta("product:price:currency") ?? meta("og:price:currency"), "INR"),
    imageUrl: httpUrl(meta("og:image")),
    inStock: !/out ?of ?stock|oos|sold ?out/i.test(availability),
    originalPrice: null,
    sku: meta("product:retailer_item_id"),
  };
}

// ---------------------------------------------------------------------------
// Retailer-specific selectors for stores without structured data (Amazon).
// ---------------------------------------------------------------------------

export function extractAmazon(html: string): ProductFields | null {
  const $ = cheerio.load(html);
  const text = (sel: string) => $(sel).first().text().trim();

  const name = text("#productTitle").replace(/\s+/g, " ");
  const priceText =
    text("#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen") ||
    text("#corePrice_feature_div .a-offscreen") ||
    text(".priceToPay .a-offscreen") ||
    (text(".priceToPay .a-price-whole") && `${text(".priceToPay .a-price-whole")}${text(".priceToPay .a-price-fraction")}`) ||
    text("#priceblock_dealprice") ||
    text("#priceblock_ourprice");
  const price = parsePrice(priceText);
  if (!name || !price) return null;

  const mrp = parsePrice(
    text("#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen") || text(".basisPrice .a-offscreen")
  );
  const availability = text("#availability").toLowerCase();
  const image = $("#landingImage").attr("data-old-hires") || $("#landingImage").attr("src");

  return {
    name: name.slice(0, 300),
    price: round(price),
    currency: normalizeCurrency(priceText.includes("₹") ? "INR" : priceText.includes("$") ? "USD" : null, "INR"),
    imageUrl: httpUrl(image),
    inStock: !/currently unavailable|out of stock/.test(availability),
    originalPrice: mrp && mrp > price ? round(mrp) : null,
    sku: null,
  };
}

function canonicalOf(html: string): string | null {
  const $ = cheerio.load(html);
  return httpUrl($('link[rel="canonical"]').attr("href")) ?? httpUrl($('meta[property="og:url"]').attr("content"));
}

/**
 * Read a product from raw HTML with deterministic methods only, in order of
 * reliability. Returns null when the page carries no machine-readable price;
 * the caller may then fall back to the LLM.
 */
export function extractFromHtml(html: string, pageUrl: string): ExtractedProduct | null {
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    // Keep generic extraction.
  }

  const attempts: Array<[ExtractMethod, () => ProductFields | null]> = [
    ["jsonld", () => extractJsonLd(html)],
    ...(/(^|\.)amazon\./.test(host) ? [["selector", () => extractAmazon(html)] as [ExtractMethod, () => ProductFields | null]] : []),
    ["og", () => extractOpenGraph(html)],
  ];

  for (const [method, run] of attempts) {
    const product = run();
    if (product) return { ...product, method, canonicalUrl: canonicalOf(html) };
  }
  return null;
}
