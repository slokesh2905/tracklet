import { describe, expect, it } from "vitest";
import { evaluateAlert, type AlertInput } from "@/lib/alerts";

const base: AlertInput = {
  oldPrice: 100,
  newPrice: 100,
  wasInStock: true,
  inStock: true,
  targetPrice: null,
  alertPct: null,
  previousLow: 100,
};

const check = (overrides: Partial<AlertInput>) => evaluateAlert({ ...base, ...overrides });

describe("evaluateAlert", () => {
  it("alerts on any drop when no rules are set", () => {
    expect(check({ newPrice: 99, previousLow: 95 })).toBe("price_drop");
  });

  it("upgrades a drop below the previous low to all_time_low", () => {
    expect(check({ newPrice: 90, previousLow: 95 })).toBe("all_time_low");
  });

  it("ignores price increases and unchanged prices", () => {
    expect(check({ newPrice: 120 })).toBeNull();
    expect(check({})).toBeNull();
  });

  it("fires target_reached only when the target is crossed", () => {
    expect(check({ targetPrice: 80, newPrice: 79 })).toBe("target_reached");
    // Already below target last time: no repeat alert, and target-only means no generic drop alert.
    expect(check({ targetPrice: 80, oldPrice: 78, newPrice: 75, previousLow: 70 })).toBeNull();
  });

  it("with only a target set, ignores drops that stay above it", () => {
    expect(check({ targetPrice: 50, newPrice: 90 })).toBeNull();
  });

  it("respects the percentage threshold", () => {
    expect(check({ alertPct: 10, newPrice: 95 })).toBeNull();
    expect(check({ alertPct: 10, newPrice: 90, previousLow: 85 })).toBe("price_drop");
    expect(check({ alertPct: 10, newPrice: 80, previousLow: 85 })).toBe("all_time_low");
  });

  it("alerts back_in_stock, preferring target_reached if also crossed", () => {
    expect(check({ wasInStock: false, newPrice: 100 })).toBe("back_in_stock");
    expect(check({ wasInStock: false, targetPrice: 120, newPrice: 110, oldPrice: 110 })).toBe(
      "target_reached"
    );
  });

  it("never alerts on out-of-stock prices", () => {
    expect(check({ inStock: false, newPrice: 10, targetPrice: 50 })).toBeNull();
  });
});
