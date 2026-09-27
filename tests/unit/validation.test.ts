import { describe, expect, it } from "vitest";
import { normalizeCurrency, parsePrice } from "@/lib/format";
import { toScrapedProduct } from "@/lib/scraper";
import {
  alertRulesSchema,
  bulkUrlsSchema,
  normalizeProductUrl,
  productUrlSchema,
  settingsSchema,
} from "@/lib/validation";

describe("normalizeProductUrl", () => {
  it("strips tracking params, hash and trailing slash", () => {
    expect(
      normalizeProductUrl("https://www.amazon.in/dp/B0ABC/?utm_source=x&ref_=nav&th=1#reviews")
    ).toBe("https://www.amazon.in/dp/B0ABC/?th=1");
    expect(normalizeProductUrl("https://shop.test/item/")).toBe("https://shop.test/item");
  });
});

describe("productUrlSchema", () => {
  it("rejects non-http URLs and junk", () => {
    expect(productUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(productUrlSchema.safeParse("not a url").success).toBe(false);
    expect(productUrlSchema.safeParse("ftp://x.test/a").success).toBe(false);
  });

  it("accepts and normalises a product URL", () => {
    expect(productUrlSchema.parse("  https://shop.test/a?gclid=1 ")).toBe("https://shop.test/a");
  });
});

describe("bulkUrlsSchema", () => {
  it("splits on whitespace/commas and dedupes", () => {
    const urls = bulkUrlsSchema.parse("https://a.test/1\nhttps://a.test/2, https://a.test/1");
    expect(urls).toEqual(["https://a.test/1", "https://a.test/2"]);
  });

  it("caps the batch size", () => {
    const text = Array.from({ length: 21 }, (_, i) => `https://a.test/${i}`).join("\n");
    expect(bulkUrlsSchema.safeParse(text).success).toBe(false);
  });
});

describe("alertRulesSchema", () => {
  const id = "3f1c2b8e-2a4d-4f6b-9c1e-0a2b3c4d5e6f";

  it("treats blanks as cleared rules", () => {
    expect(alertRulesSchema.parse({ productId: id, targetPrice: "", alertPct: "" })).toEqual({
      productId: id,
      targetPrice: null,
      alertPct: null,
    });
  });

  it("rejects out-of-range values", () => {
    expect(alertRulesSchema.safeParse({ productId: id, targetPrice: -5, alertPct: null }).success).toBe(false);
    expect(alertRulesSchema.safeParse({ productId: id, targetPrice: null, alertPct: 95 }).success).toBe(false);
  });
});

describe("settingsSchema", () => {
  const base = { preferredCurrency: "INR", emailAlerts: true, weeklyDigest: false };

  it("only accepts Discord webhook URLs", () => {
    expect(
      settingsSchema.safeParse({ ...base, discordWebhookUrl: "https://evil.test/api/webhooks/1/x" }).success
    ).toBe(false);
    expect(
      settingsSchema.parse({ ...base, discordWebhookUrl: "https://discord.com/api/webhooks/123/abc-DEF_9" })
        .discordWebhookUrl
    ).toBe("https://discord.com/api/webhooks/123/abc-DEF_9");
    expect(settingsSchema.parse({ ...base, discordWebhookUrl: "  " }).discordWebhookUrl).toBeNull();
  });
});

describe("parsePrice", () => {
  it.each([
    [1299, 1299],
    ["1,299.00", 1299],
    ["₹1,29,999", 129999],
    ["1.299,50", 1299.5],
    ["$19.99", 19.99],
    ["free", null],
    [-5, null],
    [Number.NaN, null],
  ] as const)("%s -> %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });
});

describe("normalizeCurrency", () => {
  it("maps symbols and codes", () => {
    expect(normalizeCurrency("₹")).toBe("INR");
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("Rs.")).toBe("INR");
    expect(normalizeCurrency("???", "EUR")).toBe("EUR");
    expect(normalizeCurrency(undefined)).toBe("USD");
  });
});

describe("toScrapedProduct", () => {
  it("validates and cleans extractor output", () => {
    expect(
      toScrapedProduct({
        productName: "  Kettle ",
        currentPrice: "₹1,499",
        currencyCode: "₹",
        originalPrice: 1999,
        inStock: true,
        productImageUrl: "javascript:alert(1)",
      })
    ).toEqual({
      name: "Kettle",
      price: 1499,
      currency: "INR",
      imageUrl: null,
      inStock: true,
      originalPrice: 1999,
    });
  });

  it("rejects output without a usable price", () => {
    expect(toScrapedProduct({ productName: "X", currentPrice: 0 })).toBeNull();
    expect(toScrapedProduct({ productName: "", currentPrice: 10 })).toBeNull();
    expect(toScrapedProduct(null)).toBeNull();
  });
});

describe("withStrictSsl", () => {
  it("upgrades lenient sslmodes to verify-full and leaves others alone", async () => {
    const { withStrictSsl } = await import("@/lib/db/url");
    expect(withStrictSsl("postgres://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require")).toBe(
      "postgres://u:p@ep-x.neon.tech/db?sslmode=verify-full&channel_binding=require"
    );
    expect(withStrictSsl("postgres://u:p@localhost:5433/db")).toBe("postgres://u:p@localhost:5433/db");
  });
});
