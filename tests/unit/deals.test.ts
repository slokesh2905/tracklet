import { describe, expect, it } from "vitest";
import { isGreatDeal } from "@/lib/deals";

describe("isGreatDeal", () => {
  it("needs a high score, history and stock", () => {
    expect(isGreatDeal({ dealScore: 90, status: "dropped", in_stock: true })).toBe(true);
    expect(isGreatDeal({ dealScore: 90, status: "dropped", in_stock: false })).toBe(false);
    expect(isGreatDeal({ dealScore: 90, status: "new", in_stock: true })).toBe(false);
    expect(isGreatDeal({ dealScore: 79, status: "dropped", in_stock: true })).toBe(false);
  });
});
