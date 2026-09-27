import { describe, expect, it } from "vitest";
import { guardPrice, type GuardInput } from "@/lib/price-guard";

const base: GuardInput = { price: 2510, originalPrice: 5995, method: "jsonld", lastConfirmed: 2510, pending: null };
const guard = (o: Partial<GuardInput>) => guardPrice({ ...base, ...o });

describe("guardPrice", () => {
  it("rejects the ₹25 misread of a ₹5,995-MRP product, even as the first reading", () => {
    expect(guard({ price: 25, lastConfirmed: null })).toMatchObject({ action: "reject" });
  });

  it("rejects non-positive prices and prices far above MRP", () => {
    expect(guard({ price: 0 }).action).toBe("reject");
    expect(guard({ price: 9999 }).action).toBe("reject");
  });

  it("accepts a first reading and small moves", () => {
    expect(guard({ lastConfirmed: null, originalPrice: null, price: 499 })).toEqual({ action: "accept", confirmed: false });
    expect(guard({ price: 2410 })).toEqual({ action: "accept", confirmed: false });
  });

  it("holds a big move until a second reading agrees", () => {
    expect(guard({ price: 900 }).action).toBe("hold");
    expect(guard({ price: 905, pending: 900 })).toEqual({ action: "accept", confirmed: true });
    expect(guard({ price: 1500, pending: 900 }).action).toBe("accept"); // 40% move: plausible on its own
  });

  it("requires confirmation for price changes read by the LLM fallback", () => {
    expect(guard({ price: 2300, method: "llm" }).action).toBe("hold");
    expect(guard({ price: 2510, method: "llm" }).action).toBe("accept"); // unchanged: nothing to confirm
  });
});
