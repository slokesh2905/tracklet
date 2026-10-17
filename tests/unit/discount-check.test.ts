import { describe, expect, it } from "vitest";
import { checkDiscount, isDiscountFlagged } from "@/lib/discount-check";
import { DAY_MS } from "@/lib/format";

const NOW = Date.UTC(2026, 8, 27);
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();
const at = (price: number, d: number) => ({ price, checked_at: daysAgo(d) });

describe("checkDiscount", () => {
  it("has nothing to say without a list price above the current price", () => {
    expect(checkDiscount({ history: [at(900, 40)], currentPrice: 900, originalPrice: null, now: NOW }).status).toBe("none");
    expect(checkDiscount({ history: [at(900, 40)], currentPrice: 900, originalPrice: 900, now: NOW }).status).toBe("none");
    expect(checkDiscount({ history: [at(900, 40)], currentPrice: 900, originalPrice: 800, now: NOW }).status).toBe("none");
  });

  it("does not judge a list price on a young history", () => {
    const c = checkDiscount({ history: [at(500, 3)], currentPrice: 500, originalPrice: 1000, now: NOW });
    expect(c).toEqual({ status: "unknown", daysTracked: 3 });
    expect(isDiscountFlagged(c)).toBe(false);
  });

  it("verifies a list price that was charged while we watched", () => {
    const c = checkDiscount({ history: [at(1000, 40), at(600, 5)], currentPrice: 600, originalPrice: 1000, now: NOW });
    expect(c).toMatchObject({ status: "verified", daysTracked: 40 });
  });

  it("counts a price close to the list price as charged", () => {
    const c = checkDiscount({ history: [at(960, 40), at(600, 5)], currentPrice: 600, originalPrice: 1000, now: NOW });
    expect(c.status).toBe("verified");
  });

  it("flags a list price that was never charged, hedged until 30 days", () => {
    const soft = checkDiscount({ history: [at(500, 10)], currentPrice: 500, originalPrice: 1000, now: NOW });
    expect(soft).toEqual({ status: "unverified", daysTracked: 10, highestSeen: 500, firm: false });

    const firm = checkDiscount({ history: [at(520, 45), at(500, 20)], currentPrice: 500, originalPrice: 1000, now: NOW });
    expect(firm).toMatchObject({ status: "unverified", highestSeen: 520, firm: true });
    expect(isDiscountFlagged(firm)).toBe(true);
  });

  it("flags a price that was raised shortly before the drop and fell back", () => {
    const c = checkDiscount({
      history: [at(1000, 60), at(1300, 12), at(1000, 2)],
      currentPrice: 1000,
      originalPrice: 1500,
      now: NOW,
    });
    expect(c).toEqual({ status: "inflated", from: 1000, peak: 1300, daysAgo: 2 });
  });

  it("flags a hike even when there is no list price", () => {
    const c = checkDiscount({ history: [at(1000, 60), at(1300, 12), at(1000, 2)], currentPrice: 1000, originalPrice: null, now: NOW });
    expect(c.status).toBe("inflated");
  });

  it("ignores a drop that is not back near the starting price", () => {
    const c = checkDiscount({ history: [at(1000, 60), at(1300, 12), at(1100, 2)], currentPrice: 1100, originalPrice: null, now: NOW });
    expect(c.status).toBe("none");
  });

  it("ignores a rise that happened long before the drop", () => {
    const c = checkDiscount({ history: [at(1000, 90), at(1300, 60), at(1000, 2)], currentPrice: 1000, originalPrice: null, now: NOW });
    expect(c.status).toBe("none");
  });

  it("ignores a rise that is too small to matter", () => {
    const c = checkDiscount({ history: [at(1000, 60), at(1100, 12), at(1000, 2)], currentPrice: 1000, originalPrice: null, now: NOW });
    expect(c.status).toBe("none");
  });

  it("ignores an old drop", () => {
    const c = checkDiscount({ history: [at(1000, 90), at(1300, 80), at(1000, 70)], currentPrice: 1000, originalPrice: null, now: NOW });
    expect(c.status).toBe("none");
  });

  it("copes with empty history", () => {
    const c = checkDiscount({ history: [], currentPrice: 500, originalPrice: 1000, now: NOW });
    expect(c).toEqual({ status: "unknown", daysTracked: 0 });
  });
});
