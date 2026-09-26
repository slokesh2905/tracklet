import Firecrawl from "@mendable/firecrawl-js";
import { normalizeCurrency, parsePrice } from "@/lib/format";

export type ScrapedProduct = {
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  originalPrice: number | null;
};

export interface Scraper {
  scrape(url: string): Promise<ScrapedProduct>;
}

export class ScrapeError extends Error {
  constructor(
    message: string,
    /** Page markdown when the page loaded but no price was found (AI fallback input). */
    readonly markdown?: string
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    productName: { type: "string", description: "The product's full title" },
    currentPrice: {
      type: "number",
      description: "The price a shopper pays right now, as a plain number",
    },
    currencyCode: {
      type: "string",
      description: "ISO 4217 currency code such as USD or INR",
    },
    originalPrice: {
      type: ["number", "null"],
      description: "List/MRP price before discount, if a sale is shown",
    },
    inStock: {
      type: "boolean",
      description: "Whether the product can currently be bought",
    },
    productImageUrl: {
      type: ["string", "null"],
      description: "Main product image URL",
    },
  },
  required: ["productName", "currentPrice"],
};

/** Turn loosely-typed extractor output into a validated ScrapedProduct, or null. */
export function toScrapedProduct(raw: unknown): ScrapedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name =
    typeof data.productName === "string" ? data.productName.trim() : "";
  const price = parsePrice(data.currentPrice);
  if (!name || price === null || price === 0) return null;

  const original = parsePrice(data.originalPrice);
  const image =
    typeof data.productImageUrl === "string" ? data.productImageUrl : null;

  return {
    name: name.slice(0, 300),
    price: Math.round(price * 100) / 100,
    currency: normalizeCurrency(
      typeof data.currencyCode === "string" ? data.currencyCode : null
    ),
    imageUrl: image && /^https?:\/\//.test(image) ? image : null,
    inStock: data.inStock !== false,
    originalPrice: original && original > price ? original : null,
  };
}

export function createFirecrawlScraper(apiKey: string): Scraper {
  const client = new Firecrawl({ apiKey });

  return {
    async scrape(url) {
      let doc;
      try {
        doc = await client.scrape(url, {
          formats: [
            {
              type: "json",
              schema: EXTRACTION_SCHEMA,
              prompt:
                "Extract the main product on this page. currentPrice is what a shopper pays now (the sale price if discounted).",
            },
            "markdown",
          ],
          onlyMainContent: true,
          timeout: 60_000,
        });
      } catch (error) {
        throw new ScrapeError(
          `Couldn't load that page: ${error instanceof Error ? error.message : "unknown error"}`
        );
      }

      const product = toScrapedProduct(doc.json);
      if (!product) {
        throw new ScrapeError(
          "Couldn't find a product price on that page",
          doc.markdown?.slice(0, 20_000)
        );
      }
      return product;
    },
  };
}
