import { describe, expect, it } from "vitest";
import { DAY_MS } from "@/lib/format";
import { computeInsights, dealLabel, toSteps, windowStats } from "@/lib/insights";

const NOW = Date.UTC(2026, 8, 27);
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

describe("toSteps", () => {
  it("sorts history and appends the current price when it differs", () => {
    const steps = toSteps(
      [
        { price: 90, checked_at: daysAgo(5) },
        { price: 100, checked_at: daysAgo(10) },
      ],
      80,
      NOW
    );
    expect(steps.map((s) => s.price)).toEqual([100, 90, 80]);
  });

  it("does not duplicate the current price", () => {
    const steps = toSteps([{ price: 50, checked_at: daysAgo(3) }], 50, NOW);
    expect(steps).toHaveLength(1);
  });
});

describe("windowStats", () => {
  it("time-weights the average", () => {
    // 100 for 9 days, then 10 for 1 day -> (900 + 10) / 10 = 91
    const stats = windowStats(
      [
        { price: 100, t: NOW - 10 * DAY_MS },
        { price: 10, t: NOW - 1 * DAY_MS },
      ],
      NOW
    );
    expect(stats.low).toBe(10);
    expect(stats.high).toBe(100);
    expect(stats.average).toBeCloseTo(91);
  });
});

describe("computeInsights", () => {
  it("scores the all-time low as a great deal", () => {
    const i = computeInsights(
      [
        { price: 200, checked_at: daysAgo(60) },
        { price: 180, checked_at: daysAgo(30) },
        { price: 150, checked_at: daysAgo(2) },
      ],
      150,
      NOW
    );
    expect(i.isAllTimeLow).toBe(true);
    expect(i.dealScore).toBe(100);
    expect(i.dealLabel).toBe("Great deal");
    expect(i.changeFromFirst).toBeCloseTo(-25);
    expect(i.trend).toBe("down");
    expect(i.daysTracked).toBe(60);
  });

  it("scores the all-time high as pricey", () => {
    const i = computeInsights(
      [
        { price: 100, checked_at: daysAgo(40) },
        { price: 140, checked_at: daysAgo(1) },
      ],
      140,
      NOW
    );
    expect(i.dealScore).toBe(0);
    expect(i.dealLabel).toBe("Pricey");
    expect(i.isAllTimeLow).toBe(false);
  });

  it("is neutral with a single price", () => {
    const i = computeInsights([{ price: 99, checked_at: daysAgo(1) }], 99, NOW);
    expect(i.dealScore).toBe(50);
    expect(i.isAllTimeLow).toBe(false);
    expect(i.trend).toBe("flat");
    expect(i.changeFromFirst).toBe(0);
  });

  it("uses the price in effect at the start of the 30-day window", () => {
    const i = computeInsights(
      [
        { price: 500, checked_at: daysAgo(100) },
        { price: 300, checked_at: daysAgo(50) },
      ],
      300,
      NOW
    );
    // Only 300 was in effect for the whole last 30 days.
    expect(i.last30).toEqual({ low: 300, high: 300, average: 300 });
    expect(i.allTime.high).toBe(500);
  });

  it("works with empty history", () => {
    const i = computeInsights([], 42, NOW);
    expect(i.allTime.low).toBe(42);
    expect(i.dataPoints).toBe(1);
  });
});

describe("dealLabel", () => {
  it.each([
    [95, "Great deal"],
    [80, "Great deal"],
    [65, "Good price"],
    [40, "Fair price"],
    [10, "Pricey"],
  ] as const)("%i -> %s", (score, label) => {
    expect(dealLabel(score)).toBe(label);
  });
});
