import "server-only";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogItems, priceHistory, products, type CatalogItemRow } from "@/lib/db/schema";
import { extractFromHtml, type ExtractedProduct } from "@/lib/extract";
import { guardPrice } from "@/lib/price-guard";
import { productKeyFromUrl } from "@/lib/product-key";

/**
 * Prices from before we tracked an item, read from Internet Archive (Wayback Machine) snapshots of
 * its product page. Free and keyless. Coverage is patchy (popular products have a snapshot every
 * few months, others none, and many Amazon snapshots are a captcha page), so these are stored as
 * one-off sightings (`source: "archive"`), never as a continuous record.
 */

const CDX = "https://web.archive.org/cdx/search/cdx";
const USER_AGENT = "TrackletBot/1.0 (price history backfill)";
/** One sighting per month, for at most this many (most recent) months. */
export const MAX_MONTHS = 12;
/** Snapshots tried per month before giving up on it (the first is often a captcha page). */
const TRIES_PER_MONTH = 2;
/** Pause between requests to the archive, to stay well inside its rate limits. */
const PAUSE_MS = 1500;
/** Archived prices further than this factor from today's price are treated as misreads. */
const MAX_RATIO = 4;
/**
 * Captures smaller than this (stored, compressed size) are bot-check or error pages, not product
 * pages: Amazon's captcha is ~1-2 KB, a real product page 150 KB+. Skipping them saves the download.
 */
const MIN_PAGE_BYTES = 20_000;

export type Snapshot = { timestamp: string; original: string; /** Stored size, when the index gives one. */ length?: number };
export type ArchivedReading = { price: number; currency: string; inStock: boolean; at: string };
type ArchiveItem = Pick<CatalogItemRow, "key" | "url" | "currency" | "current_price">;

/** "20240530204248" -> "2024-05-30T20:42:48.000Z" (Wayback timestamps are UTC). */
export function snapshotDate(timestamp: string): string {
  const iso = timestamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6Z");
  return new Date(iso).toISOString();
}

const toTimestamp = (date: Date) => date.toISOString().replace(/\D/g, "").slice(0, 14);

/** Snapshot index query for every capture of the product page (any query string), before `before`. */
export function cdxUrl(canonicalUrl: string, before: Date): string {
  const u = new URL(canonicalUrl);
  const params = new URLSearchParams({
    url: `${u.hostname.replace(/^www\./, "")}${u.pathname}`,
    matchType: "prefix",
    output: "json",
    fl: "timestamp,original,length",
    to: toTimestamp(before),
    limit: "5000",
  });
  params.append("filter", "statuscode:200");
  params.append("filter", "mimetype:text/html");
  return `${CDX}?${params}`;
}

/** Parse the CDX JSON (a header row, then [timestamp, original, length] rows). */
export function parseCdx(body: unknown): Snapshot[] {
  if (!Array.isArray(body)) return [];
  return body.slice(1).flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const [timestamp, original, length] = row;
    if (typeof timestamp !== "string" || !/^\d{14}$/.test(timestamp) || typeof original !== "string") return [];
    const bytes = Number(length);
    return [{ timestamp, original, ...(length !== undefined && Number.isFinite(bytes) ? { length: bytes } : {}) }];
  });
}

const sameProduct = (url: string, key: string) => {
  try {
    return productKeyFromUrl(url).key === key;
  } catch {
    return false;
  }
};

/**
 * The snapshots worth reading: only full-size captures of this exact product (a Flipkart `itm` page
 * holds several variants, told apart by `pid`), newest months first, a couple of candidates per month.
 */
export function pickSnapshots(snapshots: Snapshot[], key: string, maxMonths = MAX_MONTHS): Snapshot[][] {
  const byMonth = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    if (!sameProduct(s.original, key)) continue;
    if (s.length !== undefined && s.length < MIN_PAGE_BYTES) continue;
    const month = s.timestamp.slice(0, 6);
    byMonth.set(month, [...(byMonth.get(month) ?? []), s]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, maxMonths)
    .map(([, candidates]) => candidates.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, TRIES_PER_MONTH));
}

/** Whether an archived reading is believable enough to store. */
export function acceptArchived(product: ExtractedProduct, item: Pick<ArchiveItem, "currency" | "current_price">): boolean {
  if (product.method === "llm" || product.currency !== item.currency) return false;
  const guard = guardPrice({
    price: product.price,
    originalPrice: product.originalPrice,
    method: product.method,
    lastConfirmed: null,
    pending: null,
  });
  if (guard.action === "reject") return false;
  const ratio = product.price / item.current_price;
  return ratio <= MAX_RATIO && ratio >= 1 / MAX_RATIO;
}

type FetchOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Stop starting new requests after this long. */
  budgetMs?: number;
  now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function get(url: string, fetchImpl: typeof fetch, timeoutMs = 25_000) {
  return fetchImpl(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * The snapshot index is slow (often 10-30s) and sometimes answers 503 straight away. A quick
 * failure is retried once; a slow one isn't, to keep the worst case bounded. Null means the index
 * couldn't be read at all (as opposed to an empty list: read fine, nothing archived).
 */
async function listSnapshots(url: string, fetchImpl: typeof fetch, sleep: (ms: number) => Promise<void>, now: () => number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = now();
    try {
      const res = await get(url, fetchImpl, 60_000);
      if (res.ok) {
        const body = await res.json().catch(() => undefined);
        if (body !== undefined) return parseCdx(body);
      }
    } catch {
      // Timeout or network error.
    }
    if (now() - startedAt > 20_000) break;
    await sleep(PAUSE_MS * 2);
  }
  return null;
}

/**
 * Read up to one archived price per month for `item`, from snapshots taken before `before`.
 * Null when the archive's index was unreachable, so the caller can try again another day.
 */
export async function fetchArchivedPrices(
  item: ArchiveItem,
  before: Date,
  { fetchImpl = fetch, sleep = defaultSleep, budgetMs = 60_000, now = Date.now }: FetchOptions = {}
): Promise<ArchivedReading[] | null> {
  const startedAt = now();
  const snapshots = await listSnapshots(cdxUrl(item.url, before), fetchImpl, sleep, now);
  if (!snapshots) return null;
  const months = pickSnapshots(snapshots, item.key);

  const readings: ArchivedReading[] = [];
  for (const candidates of months) {
    for (const snap of candidates) {
      if (now() - startedAt >= budgetMs) return readings;
      await sleep(PAUSE_MS);
      let product: ExtractedProduct | null = null;
      try {
        const res = await get(`https://web.archive.org/web/${snap.timestamp}id_/${snap.original}`, fetchImpl);
        // A captcha or error page simply has no product price in it.
        if (res.ok) product = extractFromHtml(await res.text(), snap.original);
      } catch {
        // Timeout or network error: try the month's next candidate.
      }
      if (product && acceptArchived(product, item)) {
        readings.push({ price: product.price, currency: product.currency, inStock: product.inStock, at: snapshotDate(snap.timestamp) });
        break;
      }
    }
  }
  return readings;
}

/**
 * Backfill one catalog item from the archive, once: the item is claimed first so a concurrent run
 * (cron and the add flow) never doubles the rows. If the archive couldn't be reached the claim is
 * released, so the daily cron retries it. Returns how many sightings were stored.
 */
export async function backfillFromArchive(itemId: string, options: FetchOptions = {}): Promise<number> {
  const [item] = await db
    .update(catalogItems)
    .set({ archived_at: new Date().toISOString() })
    .where(and(eq(catalogItems.id, itemId), isNull(catalogItems.archived_at)))
    .returning();
  if (!item) return 0;

  try {
    // Only what predates our own record: the archive can't add anything to days we watched.
    const [first] = await db
      .select({ at: priceHistory.checked_at })
      .from(priceHistory)
      .where(and(eq(priceHistory.catalog_item_id, item.id), ne(priceHistory.source, "archive")))
      .orderBy(asc(priceHistory.checked_at))
      .limit(1);
    const readings = await fetchArchivedPrices(item, new Date(first?.at ?? item.created_at), options);
    if (!readings) {
      await releaseClaim(item.id);
      return 0;
    }
    if (readings.length === 0) return 0;

    await db.insert(priceHistory).values(
      readings.map((r) => ({
        catalog_item_id: item.id,
        price: r.price,
        currency: r.currency,
        in_stock: r.inStock,
        source: "archive" as const,
        checked_at: r.at,
      }))
    );
    return readings.length;
  } catch (error) {
    console.error("Archive backfill failed:", error);
    await releaseClaim(item.id).catch(() => {});
    return 0;
  }
}

const releaseClaim = (itemId: string) => db.update(catalogItems).set({ archived_at: null }).where(eq(catalogItems.id, itemId));

/** Items still waiting for their one archive backfill, tracked ones first. */
export async function itemsAwaitingArchive(limit: number) {
  const rows = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(isNull(catalogItems.archived_at))
    .orderBy(sql`exists (select 1 from ${products} p where p.catalog_item_id = ${catalogItems.id}) desc`, asc(catalogItems.created_at))
    .limit(limit);
  return rows.map((r) => r.id);
}
