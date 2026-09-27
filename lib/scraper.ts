import Firecrawl from "@mendable/firecrawl-js";
import { extractFromHtml, type ExtractMethod } from "@/lib/extract";
import { fetchDirect } from "@/lib/fetch-page";
import { normalizeCurrency, parsePrice } from "@/lib/format";
import { productKeyFromUrl, resolveUrl } from "@/lib/product-key";

export type ScrapedProduct = {
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  originalPrice: number | null;
  /** How the price was read; `llm` readings need a second confirmation. */
  method?: ExtractMethod;
  /** URL after redirects, used to derive the product key. */
  finalUrl?: string;
  sku?: string | null;
  canonicalUrl?: string | null;
  /** Which fetcher got the page (direct = free, firecrawl = 1 credit). */
  via?: "direct" | "firecrawl";
};

export interface Scraper {
  scrape(url: string): Promise<ScrapedProduct>;
}

export class ScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeError";
  }
}

/** Turn loosely-typed extractor output (e.g. from the LLM) into a validated ScrapedProduct, or null. */
export function toScrapedProduct(raw: unknown): ScrapedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name = typeof data.productName === "string" ? data.productName.trim() : "";
  const price = parsePrice(data.currentPrice);
  if (!name || price === null || price === 0) return null;

  const original = parsePrice(data.originalPrice);
  const image = typeof data.productImageUrl === "string" ? data.productImageUrl : null;

  return {
    name: name.slice(0, 300),
    price: Math.round(price * 100) / 100,
    currency: normalizeCurrency(typeof data.currencyCode === "string" ? data.currencyCode : null),
    imageUrl: image && /^https?:\/\//.test(image) ? image : null,
    inStock: data.inStock !== false,
    originalPrice: original && original > price ? original : null,
  };
}

export type ScraperOptions = {
  /** Firecrawl key for pages that block direct requests (1 credit per page). */
  firecrawlApiKey?: string;
  /** Last-resort reader for pages without machine-readable prices (free Nemotron). */
  llmExtract?: (url: string, markdown: string) => Promise<ScrapedProduct | null>;
  fetchImpl?: typeof fetch;
};

/**
 * Tiered, near-free product reader:
 *   1. direct fetch + JSON-LD / selectors / OpenGraph   (free)
 *   2. Firecrawl raw HTML + markdown, same extractors    (1 credit)
 *   3. LLM over the markdown                             (free, flagged `llm`)
 * The old single-step Firecrawl JSON extraction cost 5 credits per page.
 */
export function createScraper({ firecrawlApiKey, llmExtract, fetchImpl = fetch }: ScraperOptions = {}): Scraper {
  const firecrawl = firecrawlApiKey ? new Firecrawl({ apiKey: firecrawlApiKey }) : null;

  return {
    async scrape(url) {
      const resolved = await resolveUrl(url, fetchImpl);
      // Fetch the canonical product page when we know the retailer id: share links
      // often resolve to app deep links (dl.flipkart.com/dl/…) that serve less to browsers.
      let target = resolved;
      try {
        const key = productKeyFromUrl(resolved);
        if (!key.key.startsWith("url:")) target = key.canonicalUrl;
      } catch {
        // Unparseable URL: fetch it as given.
      }

      const direct = await fetchDirect(target, fetchImpl);
      if (direct) {
        const product = extractFromHtml(direct.html, direct.finalUrl);
        if (product) return { ...product, finalUrl: direct.finalUrl, via: "direct" };
      }

      if (!firecrawl) throw new ScrapeError("Couldn't read that page");

      let doc;
      try {
        doc = await firecrawl.scrape(target, { formats: ["rawHtml", "markdown"], timeout: 60_000 });
      } catch (error) {
        throw new ScrapeError(`Couldn't load that page: ${error instanceof Error ? error.message : "unknown error"}`);
      }

      const finalUrl = (doc.metadata?.url as string | undefined) ?? target;
      const product = doc.rawHtml ? extractFromHtml(doc.rawHtml, finalUrl) : null;
      if (product) return { ...product, finalUrl, via: "firecrawl" };

      if (llmExtract && doc.markdown) {
        const fromLlm = await llmExtract(finalUrl, doc.markdown.slice(0, 20_000)).catch(() => null);
        if (fromLlm) return { ...fromLlm, method: "llm", finalUrl, via: "firecrawl" };
      }

      throw new ScrapeError("Couldn't find a product price on that page");
    },
  };
}
