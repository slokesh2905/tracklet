import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractFromHtml, extractJsonLd, extractOpenGraph } from "@/lib/extract";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

describe("extractFromHtml (real page fixtures)", () => {
  it("reads Flipkart's JSON-LD", () => {
    const p = extractFromHtml(
      fixture("flipkart-product.html"),
      "https://www.flipkart.com/crocs-men-flip-flops/p/itm8c4700b912e7a?pid=SFFHNZ78MHFTK5EQ"
    );
    expect(p).toMatchObject({
      name: "CROCS Men Flip Flops",
      price: 2789,
      currency: "INR",
      inStock: true,
      sku: "SFFHNZ78MHFTK5EQ",
      method: "jsonld",
    });
  });

  it("reads Amazon.in via selectors, including MRP and stock", () => {
    const p = extractFromHtml(fixture("amazon-in-product.html"), "https://www.amazon.in/dp/B09XS7JWHH");
    expect(p).toMatchObject({ price: 29747, originalPrice: 34990, currency: "INR", inStock: true, method: "selector" });
    expect(p?.name).toMatch(/^Sony WH-1000XM5/);
    expect(p?.imageUrl).toMatch(/^https:\/\/m\.media-amazon\.com\//);
    expect(p?.canonicalUrl).toContain("/dp/B09XS7JWHH");
  });

  it("returns null for pages without machine-readable prices", () => {
    expect(extractFromHtml("<html><body>Nothing here</body></html>", "https://shop.test/x")).toBeNull();
  });
});

describe("extractJsonLd", () => {
  const page = (ld: unknown) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

  it("handles @graph, offer arrays, list prices and out-of-stock", () => {
    const p = extractJsonLd(
      page({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "BreadcrumbList" },
          {
            "@type": ["Product"],
            name: "Kettle",
            image: [{ "@type": "ImageObject", url: "https://cdn.test/k.jpg" }],
            offers: [
              {
                "@type": "Offer",
                price: "1,799.00",
                priceCurrency: "INR",
                availability: "https://schema.org/OutOfStock",
                priceSpecification: [{ priceType: "https://schema.org/ListPrice", price: 2995 }],
              },
            ],
          },
        ],
      })
    );
    expect(p).toMatchObject({ name: "Kettle", price: 1799, originalPrice: 2995, inStock: false, imageUrl: "https://cdn.test/k.jpg" });
  });

  it("uses AggregateOffer lowPrice and skips malformed blocks", () => {
    const html =
      `<script type="application/ld+json">{ not json</script>` +
      page({ "@type": "Product", name: "Shoe", offers: { "@type": "AggregateOffer", lowPrice: 999, priceCurrency: "INR" } });
    expect(extractJsonLd(html)).toMatchObject({ name: "Shoe", price: 999 });
  });
});

describe("extractOpenGraph", () => {
  it("reads product:price tags", () => {
    const html = `<meta property="og:title" content="Mug"><meta property="product:price:amount" content="12.50"><meta property="product:price:currency" content="USD">`;
    expect(extractOpenGraph(html)).toMatchObject({ name: "Mug", price: 12.5, currency: "USD" });
  });
});
