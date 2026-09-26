import { expect, type Page } from "@playwright/test";

export const DEMO_EMAIL = "demo@tracklet.dev";
export const PUBLIC_PRODUCT_SLUG = "aaaaaaaaaaa1";
export const PUBLIC_COLLECTION_SLUG = "bbbbbbbbbbb1";
export const PRIVATE_COLLECTION_SLUG = "bbbbbbbbbbb2";

/**
 * The page must never scroll sideways, and no visible content may be cut off at
 * the right edge (which `overflow: hidden` would hide from a scrollWidth check).
 * Content inside intentionally scrollable rows and decorative elements is exempt.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const vw = window.innerWidth;
    const scrollsSideways = (el: Element | null): boolean => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const x = getComputedStyle(n).overflowX;
        if (x === "auto" || x === "scroll") return true;
      }
      return false;
    };
    const selector = "a, button, input, textarea, h1, h2, h3, p, li, img, [role=tab]";
    const clipped = [...document.querySelectorAll(selector)]
      .filter((el) => !el.closest("[aria-hidden=true]") && !scrollsSideways(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > vw + 1;
      })
      .slice(0, 3)
      .map((el) => `<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 40)}"`);
    return { scroll: document.documentElement.scrollWidth, vw, clipped };
  });

  expect(result.scroll, `page is ${result.scroll}px wide in a ${result.vw}px viewport`).toBeLessThanOrEqual(result.vw);
  expect(result.clipped, "content extends past the right edge").toEqual([]);
}

export function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}
