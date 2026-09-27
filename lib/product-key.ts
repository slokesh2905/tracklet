import { normalizeProductUrl } from "@/lib/validation";

/**
 * One identity per real product, whatever URL or share link it arrived by.
 * Two Flipkart short links for the same pair of shoes resolve to the same key,
 * so they share one catalog item, one scrape per day and one price history.
 */
export type ProductKey = { retailer: string; key: string; canonicalUrl: string };

const SHORTLINK = /^(dl\.flipkart\.com\/s\/|amzn\.(in|to|eu)\/|a\.co\/|myntr\.it\/|fkrt\.(it|cc|to)\/|bit\.ly\/|tinyurl\.com\/)/i;

export function isShortLink(url: string) {
  try {
    const u = new URL(url);
    return SHORTLINK.test(`${u.hostname.replace(/^www\./, "")}${u.pathname}`);
  } catch {
    return false;
  }
}

const bareHost = (h: string) => h.toLowerCase().replace(/^(www|m|dl)\./, "");

/** Derive a stable key from a (resolved) product URL, preferring the page's SKU when known. */
export function productKeyFromUrl(input: string, sku?: string | null): ProductKey {
  const url = new URL(input);
  const host = bareHost(url.hostname);
  const path = url.pathname;

  const amazon = host.match(/^amazon\.([a-z.]+)$/);
  if (amazon) {
    const asin = path.match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase();
    if (asin) {
      return { retailer: "amazon", key: `amazon.${amazon[1]}:${asin}`, canonicalUrl: `https://www.amazon.${amazon[1]}/dp/${asin}` };
    }
  }

  if (host === "flipkart.com") {
    const itm = path.match(/\/p\/(itm[a-z0-9]+)/i)?.[1]?.toLowerCase();
    const pid = (url.searchParams.get("pid") ?? sku ?? "").toUpperCase() || null;
    if (pid || itm) {
      const slug = path.match(/^\/(?:dl\/)?([^/]+)\/p\//)?.[1] ?? "product";
      const canonical = itm
        ? `https://www.flipkart.com/${slug}/p/${itm}${pid ? `?pid=${pid}` : ""}`
        : normalizeProductUrl(input);
      return { retailer: "flipkart", key: `flipkart:${pid ?? itm}`, canonicalUrl: canonical };
    }
  }

  const idPatterns: Array<[string, RegExp, (id: string) => string]> = [
    ["myntra", /\/(\d{5,})\/buy/, (id) => `https://www.myntra.com/${id}`],
    ["ajio", /\/p\/([a-z0-9_]+)$/i, () => normalizeProductUrl(input)],
    ["croma", /\/p\/(\d+)/, (id) => `https://www.croma.com/p/${id}`],
    ["tatacliq", /\/p-(mp\d+)/i, () => normalizeProductUrl(input)],
    ["nykaa", /\/p\/(\d+)/, () => normalizeProductUrl(input)],
  ];
  const retailer = host.split(".")[0]!;
  for (const [name, re, canonical] of idPatterns) {
    if (!host.startsWith(`${name}.`)) continue;
    const id = path.match(re)?.[1];
    if (id) return { retailer: name, key: `${name}:${id.toLowerCase()}`, canonicalUrl: canonical(id) };
  }

  const canonicalUrl = normalizeProductUrl(input);
  return { retailer, key: `url:${canonicalUrl}`, canonicalUrl };
}

/**
 * Follow redirects for known share links (dl.flipkart.com/s/…, amzn.in/…) with
 * cheap requests, so they resolve to the real product URL. Other URLs are
 * returned unchanged; their final URL comes from the page fetch itself.
 */
export async function resolveUrl(input: string, fetchImpl: typeof fetch = fetch, maxHops = 5): Promise<string> {
  if (!isShortLink(input)) return input;
  let current = input;
  for (let hop = 0; hop < maxHops; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; TrackletBot/1.0)" },
      });
    } catch {
      return current;
    }
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return current;
    current = new URL(location, current).toString();
    if (!isShortLink(current)) return current;
  }
  return current;
}
