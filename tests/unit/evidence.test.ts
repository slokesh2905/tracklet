import { describe, expect, it } from "vitest";
import { canAffordComparison, spareCredits } from "@/lib/credit-budget";
import { buildEvidence, gateVerdict, type StoreOffer } from "@/lib/evidence";
import { DAY_MS } from "@/lib/format";
import { computeInsights } from "@/lib/insights";

const NOW = Date.UTC(2026, 8, 27);
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY_MS).toISOString();

function evidence(historyDays: number[], offers: StoreOffer[] = [], price = 2510) {
  const history = historyDays.map((d) => ({ price, checked_at: iso(d) }));
  return buildEvidence({
    currentPrice: price,
    currency: "INR",
    originalPrice: 5995,
    inStock: true,
    firstSeen: iso(Math.max(0, ...historyDays)),
    shoppers: 1,
    insights: computeInsights(history, price, NOW),
    offers,
  });
}

const offer = (o: Partial<StoreOffer>): StoreOffer => ({
  retailer: "myntra",
  url: "https://www.myntra.com/1/buy",
  price: 2199,
  currency: "INR",
  inStock: true,
  match: "exact",
  checkedAt: iso(0),
  ...o,
});

describe("buildEvidence", () => {
  it("computes the discount off MRP and the best cheaper exact offer", () => {
    const e = evidence([0], [offer({}), offer({ retailer: "ajio", price: 2399 }), offer({ price: 1500, match: "similar" })]);
    expect(e.discountPct).toBeCloseTo(58.1, 1);
    expect(e.bestOffer).toMatchObject({ retailer: "myntra", price: 2199 });
    expect(e.bestOffer!.savingPct).toBeCloseTo(12.4, 1);
    expect(e.similarOffers).toHaveLength(1);
  });

  it("ignores out-of-stock and other-currency offers", () => {
    const e = evidence([0], [offer({ inStock: false }), offer({ currency: "USD", price: 20 })]);
    expect(e.bestOffer).toBeNull();
  });
});

describe("gateVerdict", () => {
  it("says 'not enough data' for a brand-new product with nothing to compare, without calling AI", () => {
    const g = gateVerdict(evidence([0]));
    expect(g.kind).toBe("insufficient");
    if (g.kind === "insufficient") expect(g.readyOn).toBe(new Date(NOW + 7 * DAY_MS).toISOString());
  });

  it("recommends another store in code when an identical item is ≥3% cheaper", () => {
    expect(gateVerdict(evidence([0], [offer({})]))).toMatchObject({ kind: "buy_elsewhere" });
    expect(gateVerdict(evidence([0], [offer({ price: 2480 })])).kind).toBe("analyse"); // only 1.2% cheaper
  });

  it("analyses with confidence that grows with coverage", () => {
    const some = gateVerdict(evidence([10, 2]));
    const good = gateVerdict(evidence([60, 30, 5]));
    expect(some).toMatchObject({ kind: "analyse", confidence: 0.6 });
    expect(good).toMatchObject({ kind: "analyse", confidence: 0.8 });
  });
});

describe("credit budget", () => {
  const periodEnd = new Date(NOW + 10 * DAY_MS).toISOString();

  it("reserves one credit per active item per remaining day, plus a floor", () => {
    expect(spareCredits({ remainingCredits: 1000, periodEnd, activeItems: 20, now: NOW })).toBe(1000 - 200 - 50);
  });

  it("refuses comparisons that would eat into daily checks", () => {
    expect(canAffordComparison({ remainingCredits: 254, periodEnd, activeItems: 20, now: NOW })).toBe(false);
    expect(canAffordComparison({ remainingCredits: 255, periodEnd, activeItems: 20, now: NOW })).toBe(true);
  });
});
