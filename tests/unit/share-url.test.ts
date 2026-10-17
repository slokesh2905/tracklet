import { describe, expect, it } from "vitest";
import { extractSharedUrl } from "@/lib/share-url";

describe("extractSharedUrl", () => {
  it("reads the url field", () => {
    expect(extractSharedUrl({ url: "https://www.amazon.in/dp/B0ABC" })).toBe("https://www.amazon.in/dp/B0ABC");
  });

  it("finds a link inside shared text", () => {
    expect(extractSharedUrl({ text: "Check out this deal: https://amzn.in/d/0abcXYZ" })).toBe("https://amzn.in/d/0abcXYZ");
    expect(extractSharedUrl({ title: "Flipkart", text: "Boat Airdopes\nhttps://dl.flipkart.com/s/abc123\nvia Flipkart" })).toBe(
      "https://dl.flipkart.com/s/abc123"
    );
  });

  it("prefers url over text and drops trailing punctuation", () => {
    expect(extractSharedUrl({ url: "https://a.test/1", text: "https://b.test/2" })).toBe("https://a.test/1");
    expect(extractSharedUrl({ text: "See https://a.test/item." })).toBe("https://a.test/item");
  });

  it("returns null when nothing looks like a link", () => {
    expect(extractSharedUrl({ text: "just words", title: "" })).toBeNull();
    expect(extractSharedUrl({})).toBeNull();
  });
});
