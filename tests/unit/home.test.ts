import { describe, expect, it } from "vitest";
import type { DashboardProduct } from "@/lib/data";
import { DAY_MS } from "@/lib/format";
import { closestToTarget, heroCards, priceWindow, recentlyChanged, withoutTarget, type HomeAlert } from "@/lib/home";

const NOW = Date.UTC(2026, 9, 17);
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

function product(id: string, over: Partial<DashboardProduct> = {}) {
  return {
    id,
    name: `Product ${id}`,
    url: `https://shop.test/${id}`,
    image_url: null,
    currency: "INR",
    current_price: 1000,
    target_price: null,
    in_stock: true,
    spark: [1200, 1100, 1000],
    verdict: null,
    verdictConfidence: null,
    ...over,
  } as unknown as DashboardProduct;
}

const alert = (product_id: string, kind: HomeAlert["kind"], days: number, old_price: number | null = 1200): HomeAlert => ({
  product_id,
  kind,
  old_price,
  created_at: daysAgo(days),
});

describe("heroCards", () => {
  it("keeps one card per product, preferring the most important alert", () => {
    const cards = heroCards([product("a")], [alert("a", "price_drop", 1), alert("a", "target_reached", 5), alert("a", "all_time_low", 2)], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ productId: "a", kind: "target_reached", was: 1200 });
    expect(cards[0]!.changePct).toBeCloseTo(-16.7, 1);
  });

  it("orders by importance, then recency", () => {
    const cards = heroCards(
      [product("a"), product("b"), product("c")],
      [alert("a", "price_drop", 1), alert("b", "all_time_low", 6), alert("c", "price_drop", 3)],
      NOW
    );
    expect(cards.map((c) => c.productId)).toEqual(["b", "a", "c"]);
  });

  it("ignores old alerts, restocks and products that are no longer tracked", () => {
    const cards = heroCards(
      [product("a"), product("b")],
      [alert("a", "price_drop", 30), alert("b", "back_in_stock", 1), alert("gone", "target_reached", 1)],
      NOW
    );
    expect(cards).toEqual([]);
  });

  it("caps the number of cards", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const cards = heroCards(ids.map((i) => product(i)), ids.map((i) => alert(i, "price_drop", 1)), NOW);
    expect(cards).toHaveLength(5);
  });
});

describe("closestToTarget", () => {
  it("lists unreached targets by how little is left to fall", () => {
    const rows = closestToTarget([
      product("far", { current_price: 160, target_price: 125 }),
      product("near", { current_price: 44900, target_price: 42000 }),
      product("hit", { current_price: 900, target_price: 1000 }),
      product("none"),
      product("oos", { current_price: 500, target_price: 400, in_stock: false }),
    ]);
    expect(rows.map((r) => r.productId)).toEqual(["near", "far"]);
    expect(rows[0]!.toGoPct).toBeCloseTo(6.46, 1);
    expect(rows[0]!.fillPct).toBeCloseTo(93.5, 1);
  });
});

describe("withoutTarget", () => {
  it("counts products with no target", () => {
    expect(withoutTarget([product("a"), product("b", { target_price: 10 }), product("c")])).toBe(2);
  });
});

describe("priceWindow", () => {
  it("starts at the price in effect when the window opens and weights the average by time", () => {
    const w = priceWindow(
      [
        { price: 2000, checked_at: daysAgo(120) },
        { price: 1600, checked_at: daysAgo(60) },
        { price: 1400, checked_at: daysAgo(30) },
      ],
      1400,
      NOW
    );
    expect(w.steps[0]).toEqual({ t: NOW - 90 * DAY_MS, price: 2000 });
    expect(w.low).toBe(1400);
    expect(w.high).toBe(2000);
    // 30 days at 2000, 30 at 1600, 30 at 1400.
    expect(w.average).toBeCloseTo(1666.7, 1);
  });
});

describe("recentlyChanged", () => {
  it("lists last week's changes, newest first, with the size of the last move", () => {
    const rows = recentlyChanged(
      [
        product("old", { lastChange: { at: daysAgo(9), from: 1100 } }),
        product("a", { lastChange: { at: daysAgo(4), from: 1250 } }),
        product("b", { lastChange: { at: daysAgo(1), from: 900 } }),
        product("never", { lastChange: null }),
      ],
      NOW
    );
    expect(rows.map((r) => r.productId)).toEqual(["b", "a"]);
    expect(rows[0]!.changePct).toBeCloseTo(11.1, 1);
    expect(rows[1]!.changePct).toBeCloseTo(-20, 1);
  });
});
