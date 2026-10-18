import { describe, expect, it } from "vitest";
import { acceptArchived, cdxUrl, fetchArchivedPrices, parseCdx, pickSnapshots, snapshotDate } from "@/lib/archive";
import type { ExtractedProduct } from "@/lib/extract";

const AMAZON_KEY = "amazon.in:B0BS1QB15L";
const amazon = (path = "") => `https://www.amazon.in/dp/B0BS1QB15L${path}`;

const product = (price: number, o: Partial<ExtractedProduct> = {}): ExtractedProduct => ({
  name: "Sony WH-CH520",
  price,
  currency: "INR",
  imageUrl: null,
  inStock: true,
  originalPrice: 5990,
  sku: null,
  canonicalUrl: null,
  method: "selector",
  ...o,
});

const amazonPage = (price: number) =>
  `<html><span id="productTitle">Sony WH-CH520</span><div id="corePriceDisplay_desktop_feature_div"><span class="priceToPay"><span class="a-offscreen">₹${price.toLocaleString("en-IN")}</span></span></div></html>`;

describe("snapshotDate", () => {
  it("reads a Wayback timestamp as UTC", () => {
    expect(snapshotDate("20240530204248")).toBe("2024-05-30T20:42:48.000Z");
  });
});

describe("cdxUrl", () => {
  it("prefix-matches every capture of the page before a date", () => {
    const url = new URL(cdxUrl(amazon(), new Date("2026-10-01T00:00:00Z")));
    expect(url.searchParams.get("url")).toBe("amazon.in/dp/B0BS1QB15L");
    expect(url.searchParams.get("matchType")).toBe("prefix");
    expect(url.searchParams.get("fl")).toBe("timestamp,original,length");
    expect(url.searchParams.get("to")).toBe("20261001000000");
    expect(url.searchParams.getAll("filter")).toEqual(["statuscode:200", "mimetype:text/html"]);
  });
});

describe("parseCdx", () => {
  it("skips the header and malformed rows", () => {
    expect(
      parseCdx([
        ["timestamp", "original"],
        ["20230726003659", amazon("/"), "264873"],
        ["20230804061217", amazon("/ref=x")],
        ["bad", amazon()],
        "nope",
      ])
    ).toEqual([
      { timestamp: "20230726003659", original: amazon("/"), length: 264873 },
      { timestamp: "20230804061217", original: amazon("/ref=x") },
    ]);
    expect(parseCdx(null)).toEqual([]);
  });
});

describe("pickSnapshots", () => {
  it("skips captures too small to be a product page (captcha and error pages)", () => {
    const months = pickSnapshots(
      [
        { timestamp: "20251113161321", original: amazon("?th=1"), length: 690 },
        { timestamp: "20250419211716", original: amazon("?th=1"), length: 238070 },
        { timestamp: "20250919043049", original: amazon("?psc=1"), length: -7245393939 },
      ],
      AMAZON_KEY
    );
    expect(months.flat().map((s) => s.timestamp)).toEqual(["20250419211716"]);
  });

  it("keeps the newest months first, a couple of candidates each, newest candidate first", () => {
    const months = pickSnapshots(
      [
        { timestamp: "20230726003659", original: amazon("/") },
        { timestamp: "20230725234000", original: amazon("/ref=x") },
        { timestamp: "20230701000000", original: amazon("?tag=a") },
        { timestamp: "20250419211716", original: amazon("?th=1") },
      ],
      AMAZON_KEY
    );
    expect(months.map((m) => m.map((s) => s.timestamp))).toEqual([["20250419211716"], ["20230726003659", "20230725234000"]]);
  });

  it("only keeps captures of the same Flipkart variant", () => {
    const page = "https://www.flipkart.com/sony-wh-ch520/p/itm3d1fdc7a05899";
    const months = pickSnapshots(
      [
        { timestamp: "20261007181341", original: `${page}?pid=ACCHBPMEU8EZ8HEH` },
        { timestamp: "20260907181341", original: `${page}?pid=ACCOTHERCOLOUR1` },
        { timestamp: "20260807181341", original: page },
      ],
      "flipkart:ACCHBPMEU8EZ8HEH"
    );
    expect(months.flat().map((s) => s.timestamp)).toEqual(["20261007181341"]);
  });

  it("caps the number of months", () => {
    const snaps = Array.from({ length: 30 }, (_, i) => ({
      timestamp: `${2024 + Math.floor(i / 12)}${String((i % 12) + 1).padStart(2, "0")}01000000`,
      original: amazon(),
    }));
    expect(pickSnapshots(snaps, AMAZON_KEY, 12)).toHaveLength(12);
  });
});

describe("acceptArchived", () => {
  const item = { currency: "INR", current_price: 4490 };

  it("accepts a plausible reading", () => {
    expect(acceptArchived(product(3989), item)).toBe(true);
  });

  it("rejects another currency, an AI read, a price far from today's, or one off its own MRP", () => {
    expect(acceptArchived(product(3989, { currency: "USD" }), item)).toBe(false);
    expect(acceptArchived(product(3989, { method: "llm" }), item)).toBe(false);
    expect(acceptArchived(product(499, { originalPrice: null }), item)).toBe(false);
    expect(acceptArchived(product(250, { originalPrice: 5990 }), item)).toBe(false);
  });
});

describe("fetchArchivedPrices", () => {
  const item = { key: AMAZON_KEY, url: amazon(), currency: "INR", current_price: 4490 };

  function fakeFetch(pages: Record<string, string>) {
    const calls: string[] = [];
    const impl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://web.archive.org/cdx/")) {
        return Response.json([
          ["timestamp", "original"],
          ["20250419211716", amazon("?th=1")],
          ["20250410000000", amazon("?tag=b")],
          ["20230804061217", amazon("/ref=x")],
        ]);
      }
      const ts = url.match(/\/web\/(\d{14})id_\//)?.[1] ?? "";
      return new Response(pages[ts] ?? "", { status: pages[ts] ? 200 : 404 });
    }) as typeof fetch;
    return { impl, calls };
  }

  it("reads one price per month, trying the month's next snapshot when one is a captcha page", async () => {
    const { impl, calls } = fakeFetch({
      "20250419211716": "<html>Enter the characters you see below</html>",
      "20250410000000": amazonPage(3989),
      "20230804061217": amazonPage(4490),
    });
    const readings = await fetchArchivedPrices(item, new Date("2026-10-01"), { fetchImpl: impl, sleep: async () => {} });
    expect(readings!.map((r) => [r.at.slice(0, 10), r.price])).toEqual([
      ["2025-04-10", 3989],
      ["2023-08-04", 4490],
    ]);
    expect(calls.filter((c) => c.includes("id_/")).every((c) => c.startsWith("https://web.archive.org/web/"))).toBe(true);
  });

  it("returns null when the index can't be read, and retries a quick failure once", async () => {
    let calls = 0;
    const down = (async () => {
      calls++;
      return new Response("busy", { status: 503 });
    }) as typeof fetch;
    expect(await fetchArchivedPrices(item, new Date("2026-10-01"), { fetchImpl: down, sleep: async () => {} })).toBeNull();
    expect(calls).toBe(2);
  });

  it("stops when its time budget runs out", async () => {
    let clock = 0;
    const { impl } = fakeFetch({ "20250419211716": amazonPage(3989), "20230804061217": amazonPage(4490) });
    const readings = await fetchArchivedPrices(item, new Date("2026-10-01"), {
      fetchImpl: impl,
      sleep: async () => {
        clock += 1000;
      },
      now: () => clock,
      budgetMs: 500,
    });
    expect(readings).toHaveLength(1);
  });
});
