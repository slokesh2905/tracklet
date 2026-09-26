import type { AlertKind, ProductRow } from "@/lib/database.types";
import { evaluateAlert } from "@/lib/alerts";
import type { ScrapedProduct, Scraper } from "@/lib/scraper";

/** After this many consecutive failures a product stops being auto-checked. */
export const MAX_FAILURES = 5;

export type PipelineProduct = Pick<
  ProductRow,
  | "id"
  | "user_id"
  | "url"
  | "name"
  | "current_price"
  | "currency"
  | "image_url"
  | "in_stock"
  | "target_price"
  | "alert_pct"
  | "lowest_price"
  | "fail_count"
>;

export type AlertEvent = {
  kind: AlertKind;
  product: PipelineProduct;
  oldPrice: number;
  newPrice: number;
  currency: string;
};

export interface PipelineStore {
  /** Unpaused products, least recently checked first. */
  dueProducts(limit: number): Promise<PipelineProduct[]>;
  /** Persist a successful scrape; write history only when `priceChanged`. */
  saveResult(
    product: PipelineProduct,
    scraped: ScrapedProduct,
    priceChanged: boolean
  ): Promise<void>;
  saveFailure(product: PipelineProduct, message: string, pause: boolean): Promise<void>;
  /** Deliver an alert; returns the channels it reached (and logs it). */
  deliverAlert(event: AlertEvent): Promise<string[]>;
}

export type RunSummary = {
  productsChecked: number;
  urlsScraped: number;
  priceChanges: number;
  alertsSent: number;
  failures: number;
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

export function groupByUrl<T extends { url: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.url);
    if (group) group.push(item);
    else groups.set(item.url, [item]);
  }
  return groups;
}

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
 * One cron tick: scrape each distinct URL once, fan the result out to every
 * product row tracking it, record history, and fire alerts.
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
  const products = await store.dueProducts(batchSize);
  const groups = [...groupByUrl(products).entries()];

  const summary: RunSummary = {
    productsChecked: 0,
    urlsScraped: 0,
    priceChanges: 0,
    alertsSent: 0,
    failures: 0,
    skippedForTime: 0,
  };

  const started = await mapWithConcurrency(
    groups,
    concurrency,
    async ([url, rows]) => {
      let scraped: ScrapedProduct;
      try {
        scraped = await withRetry(() => scraper.scrape(url), { retries, sleep });
        summary.urlsScraped++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Scrape failed";
        for (const row of rows) {
          summary.failures++;
          await store.saveFailure(row, message, row.fail_count + 1 >= MAX_FAILURES);
        }
        return true;
      }

      for (const row of rows) {
        summary.productsChecked++;
        const oldPrice = Number(row.current_price);
        const priceChanged = oldPrice !== scraped.price;
        const stockChanged = row.in_stock !== scraped.inStock;

        await store.saveResult(row, scraped, priceChanged);
        if (priceChanged) summary.priceChanges++;
        if (!priceChanged && !stockChanged) continue;

        const kind = evaluateAlert({
          oldPrice,
          newPrice: scraped.price,
          wasInStock: row.in_stock,
          inStock: scraped.inStock,
          targetPrice: row.target_price === null ? null : Number(row.target_price),
          alertPct: row.alert_pct === null ? null : Number(row.alert_pct),
          previousLow: row.lowest_price === null ? null : Number(row.lowest_price),
        });

        if (kind) {
          const channels = await store.deliverAlert({
            kind,
            product: row,
            oldPrice,
            newPrice: scraped.price,
            currency: scraped.currency,
          });
          if (channels.length > 0) summary.alertsSent++;
        }
      }
      return true;
    },
    () => now() - startedAt < budgetMs
  );

  summary.skippedForTime = started.filter((r) => r === undefined).length;
  return summary;
}
