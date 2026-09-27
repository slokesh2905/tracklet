import { describe, expect, it, vi } from "vitest";
import { findOffers, heuristicMatch, pickCandidates, searchQuery } from "@/lib/compare";
import type { ScrapedProduct } from "@/lib/scraper";

const crocs = { key: "flipkart:SFFHNZ78MHFTK5EQ", retailer: "flipkart", name: "CROCS Men Flip Flops (Brown , 9)", currency: "INR" };

describe("searchQuery", () => {
  it("drops size/colour details and punctuation", () => {
    expect(searchQuery("CROCS Men Flip Flops (Brown , 9)")).toBe("CROCS Men Flip Flops");
    expect(searchQuery("Sony WH-1000XM5 Wireless Headphones | Black")).toBe("Sony WH-1000XM5 Wireless Headphones");
  });
});

describe("pickCandidates", () => {
  it("keeps one identifiable product page per other retailer", () => {
    const picked = pickCandidates(
      [
        { url: "https://www.flipkart.com/x/p/itm8c4700b912e7a?pid=SFFHNZ78MHFTK5EQ", title: "same page" },
        { url: "https://www.myntra.com/flip-flops/crocs/crocs-men/12345678/buy", title: "Crocs on Myntra" },
        { url: "https://www.myntra.com/flip-flops/crocs/other/87654321/buy", title: "second Myntra hit" },
        { url: "https://www.amazon.in/s?k=crocs", title: "a search page" },
        { url: "https://www.amazon.in/Crocs-Men/dp/B0ABCDEF12", title: "Crocs on Amazon" },
      ],
      crocs
    );
    expect(picked.map((p) => p.url)).toEqual(["https://www.myntra.com/12345678", "https://www.amazon.in/dp/B0ABCDEF12"]);
  });
});

describe("heuristicMatch", () => {
  it("only ever says 'similar' or 'different'", () => {
    expect(heuristicMatch("Crocs Men Flip Flops Brown", "Crocs Unisex Flip Flops Brown")).toBe("similar");
    expect(heuristicMatch("Crocs Men Flip Flops", "Sony WH-1000XM5 Headphones")).toBe("different");
  });
});

describe("findOffers", () => {
  const page = (o: Partial<ScrapedProduct>): ScrapedProduct => ({
    name: "Crocs Men Flip Flops",
    price: 2199,
    currency: "INR",
    imageUrl: null,
    inStock: true,
    originalPrice: null,
    ...o,
  });

  it("reads candidates, lets the judge filter them, and returns offers", async () => {
    const scrape = vi.fn(async (url: string) =>
      url.includes("myntra") ? page({ finalUrl: url }) : page({ name: "Crocs Classic Clog", price: 1999, finalUrl: url })
    );
    const offers = await findOffers(crocs, {
      search: async () => [
        { url: "https://www.myntra.com/a/b/12345678/buy", title: "" },
        { url: "https://www.amazon.in/dp/B0ABCDEF12", title: "" },
      ],
      scraper: { scrape },
      judge: async (_a, b) => (b.includes("Clog") ? "different" : "exact"),
    });
    expect(offers).toEqual([
      expect.objectContaining({ retailer: "myntra", price: 2199, match: "exact", url: "https://www.myntra.com/12345678" }),
    ]);
    expect(scrape).toHaveBeenCalledTimes(2);
  });

  it("skips unreadable pages and other currencies, and never claims 'exact' without a judge", async () => {
    const offers = await findOffers(crocs, {
      search: async () => [
        { url: "https://www.myntra.com/a/b/12345678/buy", title: "" },
        { url: "https://www.amazon.in/dp/B0ABCDEF12", title: "" },
        { url: "https://www.ajio.com/crocs/p/469999999_brown", title: "" },
      ],
      scraper: {
        scrape: async (url) => {
          if (url.includes("amazon")) throw new Error("blocked");
          if (url.includes("ajio")) return page({ currency: "USD", price: 30 });
          return page({});
        },
      },
      judge: null,
    });
    expect(offers).toEqual([expect.objectContaining({ retailer: "myntra", match: "similar" })]);
  });
});
