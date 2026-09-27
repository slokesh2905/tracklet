import type { AlertKind, CatalogItemRow, TrackingRow } from "@/lib/db/schema";
import { evaluateAlert } from "@/lib/alerts";
import { guardPrice } from "@/lib/price-guard";
import type { ScrapedProduct, Scraper } from "@/lib/scraper";

/** After this many consecutive failures an item stops being auto-checked. */
export const MAX_FAILURES = 5;

export type PipelineItem = Pick<
  CatalogItemRow,
  | "id"
  | "url"
  | "name"
  | "current_price"
  | "original_price"
  | "currency"
  | "image_url"
  | "in_stock"
  | "lowest_price"
  | "pending_price"
  | "fail_count"
>;

export type Tracker = Pick<TrackingRow, "id" | "user_id" | "target_price" | "alert_pct">;

export type AlertEvent = {
  kind: AlertKind;
  item: PipelineItem;
  tracker: Tracker;
  oldPrice: number;
  newPrice: number;
  currency: string;
};

export interface PipelineStore {
  /** Unpaused catalog items, least recently checked first. */
  dueItems(limit: number): Promise<PipelineItem[]>;
  /** Commit an accepted reading; write history when price or stock changed. Clears any pending price. */
  saveResult(item: PipelineItem, scraped: ScrapedProduct, opts: { priceChanged: boolean; confirmed: boolean }): Promise<void>;
  /** Park a surprising reading until the next check confirms it. */
  saveHeld(item: PipelineItem, scraped: ScrapedProduct): Promise<void>;
  saveFailure(item: PipelineItem, message: string, pause: boolean): Promise<void>;
  /** Everyone tracking this item, with their own alert rules. */
  trackersOf(itemId: string): Promise<Tracker[]>;
  /** Deliver an alert to one tracker; returns the channels it reached (and logs it). */
  deliverAlert(event: AlertEvent): Promise<string[]>;
}

export type RunSummary = {
  itemsChecked: number;
  priceChanges: number;
  held: number;
  rejected: number;
  alertsSent: number;
  failures: number;
  /** Pages that needed Firecrawl (1 credit each); the rest were fetched for free. */
  firecrawlFetches: number;
  skippedForTime: number;
};

export type RunOptions = {
  batchSize?: number;
  concurrency?: number;
  retries?: number;
  /** Stop starting new scrapes after this many ms (function time budget). */
  budgetMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** Run `fn` over items with at most `limit` in flight. `shouldStart` can stop early. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldStart: () => boolean = () => true
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = Array.from({ length: items.length }, () => undefined);
  let next = 0;

  async function worker() {
    while (next < items.length && shouldStart()) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseMs = 1000, sleep = defaultSleep } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastError;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One cron tick. Each catalog item is read once however many users track it;
 * the price guard decides whether the reading counts; alerts fan out to every
 * tracker, each evaluated against their own rules.
 */
export async function runPriceCheck(
  scraper: Scraper,
  store: PipelineStore,
  {
    batchSize = 200,
    concurrency = 5,
    retries = 2,
    budgetMs = 240_000,
    now = Date.now,
    sleep = defaultSleep,
  }: RunOptions = {}
): Promise<RunSummary> {
  const startedAt = now();
  const items = await store.dueItems(batchSize);

  const summary: RunSummary = {
    itemsChecked: 0,
    priceChanges: 0,
    held: 0,
    rejected: 0,
    alertsSent: 0,
    failures: 0,
    firecrawlFetches: 0,
    skippedForTime: 0,
  };

  const started = await mapWithConcurrency(
    items,
    concurrency,
    async (item) => {
      let scraped: ScrapedProduct;
      try {
        scraped = await withRetry(() => scraper.scrape(item.url), { retries, sleep });
      } catch (error) {
        summary.failures++;
        const message = error instanceof Error ? error.message : "Scrape failed";
        await store.saveFailure(item, message, item.fail_count + 1 >= MAX_FAILURES);
        return true;
      }
      summary.itemsChecked++;
      if (scraped.via === "firecrawl") summary.firecrawlFetches++;
      await processReading(item, scraped, store, summary);
      return true;
    },
    () => now() - startedAt < budgetMs
  );

  summary.skippedForTime = started.filter((r) => r === undefined).length;
  return summary;
}

export type ReadingOutcome = "rejected" | "held" | "unchanged" | "changed";

/**
 * Apply one fresh reading to a catalog item: guard it, persist it, and alert
 * every tracker when the price or stock changed. Shared by the cron and by
 * a user's manual "Check now", so both follow exactly the same rules.
 */
export async function processReading(
  item: PipelineItem,
  scraped: ScrapedProduct,
  store: Omit<PipelineStore, "dueItems">,
  summary?: Pick<RunSummary, "priceChanges" | "held" | "rejected" | "alertsSent">
): Promise<{ outcome: ReadingOutcome; reason?: string }> {
  const decision = guardPrice({
    price: scraped.price,
    originalPrice: scraped.originalPrice ?? item.original_price,
    method: scraped.method ?? "jsonld",
    lastConfirmed: item.current_price,
    pending: item.pending_price,
  });

  if (decision.action === "reject") {
    if (summary) summary.rejected++;
    await store.saveFailure(item, `Ignored an implausible reading: ${decision.reason}`, false);
    return { outcome: "rejected", reason: decision.reason };
  }
  if (decision.action === "hold") {
    if (summary) summary.held++;
    await store.saveHeld(item, scraped);
    return { outcome: "held", reason: decision.reason };
  }

  const oldPrice = item.current_price;
  const priceChanged = oldPrice !== scraped.price;
  const stockChanged = item.in_stock !== scraped.inStock;
  await store.saveResult(item, scraped, { priceChanged, confirmed: decision.confirmed });
  if (priceChanged && summary) summary.priceChanges++;
  if (!priceChanged && !stockChanged) return { outcome: "unchanged" };

  for (const tracker of await store.trackersOf(item.id)) {
    const kind = evaluateAlert({
      oldPrice,
      newPrice: scraped.price,
      wasInStock: item.in_stock,
      inStock: scraped.inStock,
      targetPrice: tracker.target_price,
      alertPct: tracker.alert_pct,
      previousLow: item.lowest_price,
    });
    if (!kind) continue;
    const channels = await store.deliverAlert({ kind, item, tracker, oldPrice, newPrice: scraped.price, currency: scraped.currency });
    if (channels.length > 0 && summary) summary.alertsSent++;
  }
  return { outcome: "changed" };
}
