import type { OfferMatch } from "@/lib/db/schema";
import { productKeyFromUrl } from "@/lib/product-key";
import type { ScrapedProduct, Scraper } from "@/lib/scraper";

/** Major Indian stores searched for the same product. */
export const COMPARE_DOMAINS = [
  "amazon.in",
  "flipkart.com",
  "myntra.com",
  "ajio.com",
  "croma.com",
  "reliancedigital.in",
  "tatacliq.com",
  "nykaa.com",
  "jiomart.com",
  "vijaysales.com",
];

/** How many other stores to read per comparison (each read may cost 1 credit). */
export const MAX_CANDIDATES = 3;

export type Candidate = { url: string; title: string };

export type FoundOffer = {
  retailer: string;
  url: string;
  name: string;
  price: number;
  currency: string;
  inStock: boolean;
  match: OfferMatch;
};

export type CompareDeps = {
  search: (query: string) => Promise<Candidate[]>;
  scraper: Scraper;
  /** Is `candidate` the same product as `original`? Null when no judge is available. */
  judge: ((original: string, candidate: string) => Promise<OfferMatch | "different">) | null;
};

/** Brand + model words for a search query: drop size/colour/pack details in brackets and after separators. */
export function searchQuery(name: string) {
  return name
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/\s[|–-]\s/)[0]!
    .replace(/[^\p{L}\p{N}\s.+&-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .join(" ");
}

/** Keep product pages from other retailers, one per retailer. */
export function pickCandidates(results: Candidate[], item: { key: string; retailer: string }) {
  const seen = new Set<string>([item.retailer]);
  const picked: Candidate[] = [];
  for (const r of results) {
    let key;
    try {
      key = productKeyFromUrl(r.url);
    } catch {
      continue;
    }
    // Only pages we can identify as a specific product (not search or category pages).
    if (key.key.startsWith("url:") || key.key === item.key || seen.has(key.retailer)) continue;
    seen.add(key.retailer);
    picked.push({ ...r, url: key.canonicalUrl });
    if (picked.length === MAX_CANDIDATES) break;
  }
  return picked;
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));

/** Without an AI judge, only call something "similar", never "exact". */
export function heuristicMatch(a: string, b: string): OfferMatch | "different" {
  const ta = tokens(a);
  const tb = tokens(b);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = shared / (ta.size + tb.size - shared || 1);
  return jaccard >= 0.4 ? "similar" : "different";
}

/**
 * Look for the same product on other stores. Reads use the tiered scraper
 * (free direct fetch first), and every candidate is checked by the judge so
 * a different model or variant is never presented as the same item.
 */
export async function findOffers(
  item: { key: string; retailer: string; name: string; currency: string },
  deps: CompareDeps
): Promise<FoundOffer[]> {
  const candidates = pickCandidates(await deps.search(searchQuery(item.name)), item);
  const offers: FoundOffer[] = [];

  for (const c of candidates) {
    let page: ScrapedProduct;
    try {
      page = await deps.scraper.scrape(c.url);
    } catch {
      continue;
    }
    if (page.currency !== item.currency || page.price <= 0) continue;

    const match = deps.judge
      ? await deps.judge(item.name, page.name).catch(() => heuristicMatch(item.name, page.name))
      : heuristicMatch(item.name, page.name);
    if (match === "different") continue;

    offers.push({
      retailer: productKeyFromUrl(page.finalUrl ?? c.url).retailer,
      url: c.url,
      name: page.name,
      price: page.price,
      currency: page.currency,
      inStock: page.inStock,
      match,
    });
  }
  return offers;
}
