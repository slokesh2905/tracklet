import { describe, expect, it } from "vitest";
import { isShortLink, productKeyFromUrl, resolveUrl } from "@/lib/product-key";

describe("productKeyFromUrl", () => {
  it("gives both Crocs share links the same Flipkart key once resolved", () => {
    const a = productKeyFromUrl(
      "https://dl.flipkart.com/dl/crocs-men-flip-flops/p/itm8c4700b912e7a?pid=SFFHNZ78MHFTK5EQ&marketplace=FLIPKART&affid=x"
    );
    const b = productKeyFromUrl(
      "https://www.flipkart.com/crocs-men-flip-flops/p/itm8c4700b912e7a?q=crocs&pid=SFFHNZ78MHFTK5EQ&_appId=CL"
    );
    expect(a.key).toBe("flipkart:SFFHNZ78MHFTK5EQ");
    expect(b.key).toBe(a.key);
    expect(a.canonicalUrl).toBe("https://www.flipkart.com/crocs-men-flip-flops/p/itm8c4700b912e7a?pid=SFFHNZ78MHFTK5EQ");
  });

  it("falls back to the itm id, or the page SKU, when pid is missing", () => {
    expect(productKeyFromUrl("https://www.flipkart.com/x/p/itmABC123").key).toBe("flipkart:itmabc123");
    expect(productKeyFromUrl("https://www.flipkart.com/x/p/itmabc123", "SKU9").key).toBe("flipkart:SKU9");
  });

  it("keys Amazon by marketplace + ASIN across URL shapes", () => {
    const k = "amazon.in:B09XS7JWHH";
    expect(productKeyFromUrl("https://www.amazon.in/Sony-WH-1000XM5/dp/B09XS7JWHH/ref=sr_1_1?th=1").key).toBe(k);
    expect(productKeyFromUrl("https://amazon.in/gp/product/b09xs7jwhh").key).toBe(k);
    expect(productKeyFromUrl("https://www.amazon.com/dp/B09XS7JWHH").key).toBe("amazon.com:B09XS7JWHH");
  });

  it("recognises other Indian stores and falls back to the normalised URL", () => {
    expect(productKeyFromUrl("https://www.myntra.com/tshirts/nike/nike-tee/12345678/buy").key).toBe("myntra:12345678");
    expect(productKeyFromUrl("https://shop.test/item/?utm_source=x").key).toBe("url:https://shop.test/item");
  });
});

describe("resolveUrl", () => {
  it("follows share-link redirects until a real product URL", async () => {
    const hops: Record<string, string> = {
      "https://dl.flipkart.com/s/cHpFZYNNNN": "https://dl.flipkart.com/dl/crocs-men-flip-flops/p/itm8c4700b912e7a?pid=SFFHNZ78MHFTK5EQ",
    };
    const fakeFetch = (async (url: string) =>
      new Response(null, { status: hops[url] ? 301 : 200, headers: hops[url] ? { location: hops[url] } : {} })) as typeof fetch;

    const final = await resolveUrl("https://dl.flipkart.com/s/cHpFZYNNNN", fakeFetch);
    expect(productKeyFromUrl(final).key).toBe("flipkart:SFFHNZ78MHFTK5EQ");
  });

  it("leaves ordinary URLs untouched without a request", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response(null);
    }) as typeof fetch;
    expect(await resolveUrl("https://www.amazon.in/dp/B09XS7JWHH", fakeFetch)).toBe("https://www.amazon.in/dp/B09XS7JWHH");
    expect(called).toBe(false);
    expect(isShortLink("https://amzn.in/d/abc")).toBe(true);
  });
});
