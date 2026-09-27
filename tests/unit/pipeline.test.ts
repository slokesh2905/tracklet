import { describe, expect, it, vi } from "vitest";
import {
  mapWithConcurrency,
  MAX_FAILURES,
  runPriceCheck,
  withRetry,
  type PipelineItem,
  type PipelineStore,
  type Tracker,
} from "@/lib/pipeline";
import type { ScrapedProduct, Scraper } from "@/lib/scraper";

const noSleep = () => Promise.resolve();

function item(overrides: Partial<PipelineItem> = {}): PipelineItem {
  return {
    id: crypto.randomUUID(),
    url: "https://shop.test/a",
    name: "Thing",
    current_price: 100,
    original_price: 150,
    currency: "INR",
    image_url: null,
    in_stock: true,
    lowest_price: 100,
    pending_price: null,
    fail_count: 0,
    ...overrides,
  };
}

const tracker = (o: Partial<Tracker> = {}): Tracker => ({
  id: crypto.randomUUID(),
  user_id: "u1",
  target_price: null,
  alert_pct: null,
  ...o,
});

function scraped(price: number, overrides: Partial<ScrapedProduct> = {}): ScrapedProduct {
  return { name: "Thing", price, currency: "INR", imageUrl: null, inStock: true, originalPrice: 150, method: "jsonld", via: "direct", ...overrides };
}

function fakeStore(items: PipelineItem[], trackers: Tracker[] = [tracker()]) {
  return {
    dueItems: vi.fn<PipelineStore["dueItems"]>(async () => items),
    saveResult: vi.fn<PipelineStore["saveResult"]>(async () => {}),
    saveHeld: vi.fn<PipelineStore["saveHeld"]>(async () => {}),
    saveFailure: vi.fn<PipelineStore["saveFailure"]>(async () => {}),
    trackersOf: vi.fn<PipelineStore["trackersOf"]>(async () => trackers),
    deliverAlert: vi.fn<PipelineStore["deliverAlert"]>(async () => ["email"]),
  } satisfies PipelineStore;
}

describe("mapWithConcurrency", () => {
  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it("stops starting work when shouldStart turns false", async () => {
    let started = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 1, async (n) => n * 2, () => started++ < 2);
    expect(results).toEqual([2, 4, undefined, undefined, undefined]);
  });
});

describe("withRetry", () => {
  it("retries with exponential backoff then succeeds", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(noSleep);
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { retries: 2, baseMs: 100, sleep })).resolves.toBe("ok");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200]);
  });

  it("throws the last error after exhausting retries", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(withRetry(fn, { retries: 1, sleep: noSleep })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("runPriceCheck", () => {
  it("reads each catalog item once and alerts every tracker by their own rules", async () => {
    const a = tracker({ user_id: "u1" }); // no rules: any drop
    const b = tracker({ user_id: "u2", target_price: 50 }); // target not reached
    const c = tracker({ user_id: "u3", alert_pct: 5 }); // 10% ≥ 5%
    const store = fakeStore([item()], [a, b, c]);
    const scraper: Scraper = { scrape: vi.fn(async () => scraped(90)) };

    const summary = await runPriceCheck(scraper, store, { sleep: noSleep });

    expect(scraper.scrape).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ itemsChecked: 1, priceChanges: 1, alertsSent: 2 });
    expect(store.deliverAlert.mock.calls.map(([e]) => e.tracker.user_id)).toEqual(["u1", "u3"]);
    expect(store.saveResult).toHaveBeenCalledWith(expect.anything(), expect.anything(), { priceChanged: true, confirmed: false });
  });

  it("does not alert or record a change when nothing changed", async () => {
    const store = fakeStore([item()]);
    await runPriceCheck({ scrape: async () => scraped(100) }, store, { sleep: noSleep });
    expect(store.saveResult).toHaveBeenCalledWith(expect.anything(), expect.anything(), { priceChanged: false, confirmed: false });
    expect(store.trackersOf).not.toHaveBeenCalled();
  });

  it("rejects an implausible misread instead of recording it", async () => {
    const store = fakeStore([item({ current_price: 2510, original_price: 5995, lowest_price: 2510 })]);
    const summary = await runPriceCheck({ scrape: async () => scraped(25, { originalPrice: 5995 }) }, store, { sleep: noSleep });

    expect(summary.rejected).toBe(1);
    expect(store.saveResult).not.toHaveBeenCalled();
    expect(store.deliverAlert).not.toHaveBeenCalled();
  });

  it("holds a huge drop until the next reading confirms it, then alerts", async () => {
    const first = fakeStore([item({ original_price: null })]);
    await runPriceCheck({ scrape: async () => scraped(30, { originalPrice: null }) }, first, { sleep: noSleep });
    expect(first.saveHeld).toHaveBeenCalledTimes(1);
    expect(first.deliverAlert).not.toHaveBeenCalled();

    const second = fakeStore([item({ original_price: null, pending_price: 30 })]);
    const summary = await runPriceCheck({ scrape: async () => scraped(30, { originalPrice: null }) }, second, { sleep: noSleep });
    expect(second.saveResult).toHaveBeenCalledWith(expect.anything(), expect.anything(), { priceChanged: true, confirmed: true });
    expect(summary.alertsSent).toBe(1);
  });

  it("counts pages that needed Firecrawl credits", async () => {
    const store = fakeStore([item(), item({ url: "https://shop.test/b" })]);
    let n = 0;
    const summary = await runPriceCheck(
      { scrape: async () => scraped(100, { via: n++ === 0 ? "direct" : "firecrawl" }) },
      store,
      { sleep: noSleep }
    );
    expect(summary.firecrawlFetches).toBe(1);
  });

  it("records failures and pauses after too many", async () => {
    const store = fakeStore([item({ fail_count: 0 }), item({ fail_count: MAX_FAILURES - 1, url: "https://shop.test/z" })]);
    const scraper: Scraper = {
      scrape: async () => {
        throw new Error("blocked");
      },
    };
    const summary = await runPriceCheck(scraper, store, { retries: 0, sleep: noSleep });
    expect(summary.failures).toBe(2);
    expect(store.saveFailure.mock.calls.map(([, , pause]) => pause)).toEqual([false, true]);
  });

  it("stops scheduling new items once the time budget is spent", async () => {
    const items = ["a", "b", "c"].map((u) => item({ url: `https://shop.test/${u}` }));
    let clock = 0;
    const scraper: Scraper = {
      scrape: async () => {
        clock += 1000;
        return scraped(100);
      },
    };
    const summary = await runPriceCheck(scraper, fakeStore(items), {
      concurrency: 1,
      budgetMs: 1500,
      now: () => clock,
      sleep: noSleep,
    });
    expect(summary.itemsChecked).toBe(2);
    expect(summary.skippedForTime).toBe(1);
  });
});
