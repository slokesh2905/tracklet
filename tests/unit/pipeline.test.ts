import { describe, expect, it, vi } from "vitest";
import {
  groupByUrl,
  mapWithConcurrency,
  MAX_FAILURES,
  runPriceCheck,
  withRetry,
  type PipelineProduct,
  type PipelineStore,
} from "@/lib/pipeline";
import type { ScrapedProduct, Scraper } from "@/lib/scraper";

const noSleep = () => Promise.resolve();

function product(overrides: Partial<PipelineProduct> = {}): PipelineProduct {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    url: "https://shop.test/a",
    name: "Thing",
    current_price: 100,
    currency: "USD",
    image_url: null,
    in_stock: true,
    target_price: null,
    alert_pct: null,
    lowest_price: 100,
    fail_count: 0,
    ...overrides,
  };
}

function scraped(price: number, overrides: Partial<ScrapedProduct> = {}): ScrapedProduct {
  return {
    name: "Thing",
    price,
    currency: "USD",
    imageUrl: null,
    inStock: true,
    originalPrice: null,
    ...overrides,
  };
}

function fakeStore(products: PipelineProduct[]) {
  return {
    dueProducts: vi.fn(async () => products),
    saveResult: vi.fn(async () => {}),
    saveFailure: vi.fn(async () => {}),
    deliverAlert: vi.fn(async () => ["email"]),
  } satisfies PipelineStore;
}

describe("groupByUrl", () => {
  it("groups rows sharing a URL", () => {
    const groups = groupByUrl([{ url: "a" }, { url: "b" }, { url: "a" }]);
    expect(groups.get("a")).toHaveLength(2);
    expect(groups.size).toBe(2);
  });
});

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
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      1,
      async (n) => n * 2,
      () => started++ < 2
    );
    expect(results).toEqual([2, 4, undefined, undefined, undefined]);
  });
});

describe("withRetry", () => {
  it("retries with exponential backoff then succeeds", async () => {
    const sleep = vi.fn(noSleep);
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
  it("scrapes a URL once even when several users track it", async () => {
    const products = [
      product({ user_id: "u1" }),
      product({ user_id: "u2" }),
      product({ user_id: "u3", url: "https://shop.test/b" }),
    ];
    const scraper: Scraper = { scrape: vi.fn(async () => scraped(100)) };
    const store = fakeStore(products);

    const summary = await runPriceCheck(scraper, store, { sleep: noSleep });

    expect(scraper.scrape).toHaveBeenCalledTimes(2);
    expect(summary.urlsScraped).toBe(2);
    expect(summary.productsChecked).toBe(3);
    expect(store.saveResult).toHaveBeenCalledTimes(3);
  });

  it("records price changes and delivers alerts per user", async () => {
    const products = [product({ user_id: "u1" }), product({ user_id: "u2", target_price: 50 })];
    const scraper: Scraper = { scrape: async () => scraped(90) };
    const store = fakeStore(products);

    const summary = await runPriceCheck(scraper, store, { sleep: noSleep });

    expect(summary.priceChanges).toBe(2);
    // u1 has no rules -> alerted on the drop; u2's target (50) was not reached.
    expect(store.deliverAlert).toHaveBeenCalledTimes(1);
    expect(store.deliverAlert.mock.calls[0]![0]).toMatchObject({
      kind: "all_time_low",
      oldPrice: 100,
      newPrice: 90,
    });
    expect(summary.alertsSent).toBe(1);
  });

  it("does not alert or write history when nothing changed", async () => {
    const store = fakeStore([product()]);
    await runPriceCheck({ scrape: async () => scraped(100) }, store, { sleep: noSleep });
    expect(store.saveResult).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
    expect(store.deliverAlert).not.toHaveBeenCalled();
  });

  it("records failures and pauses after too many", async () => {
    const products = [
      product({ fail_count: 0 }),
      product({ fail_count: MAX_FAILURES - 1, url: "https://shop.test/z" }),
    ];
    const store = fakeStore(products);
    const scraper: Scraper = {
      scrape: async () => {
        throw new Error("blocked");
      },
    };

    const summary = await runPriceCheck(scraper, store, { retries: 0, sleep: noSleep });

    expect(summary.failures).toBe(2);
    expect(store.saveFailure.mock.calls.map(([, , pause]) => pause)).toEqual([false, true]);
  });

  it("stops scheduling new URLs once the time budget is spent", async () => {
    const products = ["a", "b", "c"].map((u) => product({ url: `https://shop.test/${u}` }));
    let clock = 0;
    const scraper: Scraper = {
      scrape: async () => {
        clock += 1000;
        return scraped(100);
      },
    };

    const summary = await runPriceCheck(scraper, fakeStore(products), {
      concurrency: 1,
      budgetMs: 1500,
      now: () => clock,
      sleep: noSleep,
    });

    expect(summary.urlsScraped).toBe(2);
    expect(summary.skippedForTime).toBe(1);
  });
});
