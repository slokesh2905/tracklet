import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  PRIVATE_COLLECTION_SLUG,
  PUBLIC_COLLECTION_SLUG,
  PUBLIC_PRODUCT_SLUG,
} from "./helpers";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page renders and fits the screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("right price");
    await expect(page.getByLabel("Product URL")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("tracking without an account asks you to sign in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Product URL").fill("https://www.amazon.in/dp/B0BYS4SRJ7");
    await page.getByRole("button", { name: "Track price" }).click();
    await expect(page.getByRole("dialog", { name: "Sign in to Tracklet" })).toBeVisible();
  });

  test("protected pages redirect to sign-in and remember where you were going", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page).toHaveURL(/\/\?signin=1&next=%2Falerts/);
    await expect(page.getByRole("dialog", { name: "Sign in to Tracklet" })).toBeVisible();
  });

  test("a shared product page shows price history", async ({ page }) => {
    await page.goto(`/p/${PUBLIC_PRODUCT_SLUG}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sony WH-1000XM5");
    await expect(page.getByRole("heading", { name: "Price history" })).toBeVisible();
    await expect(page.getByText("All-time low").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("shared product has a generated social image", async ({ request }) => {
    const res = await request.get(`/p/${PUBLIC_PRODUCT_SLUG}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("a public collection lists its products; a private one is hidden", async ({ page }) => {
    await page.goto(`/c/${PUBLIC_COLLECTION_SLUG}`);
    await expect(page.getByRole("heading", { name: "Home office" })).toBeVisible();
    await expect(page.getByText("Kindle Paperwhite")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const res = await page.goto(`/c/${PRIVATE_COLLECTION_SLUG}`);
    expect(res?.status()).toBe(404);
  });

  test("the cron endpoint rejects unauthenticated calls", async ({ request }) => {
    const res = await request.get("/api/cron/check-prices");
    expect(res.status()).toBe(401);
  });

  test("auth callback refuses off-site redirects", async ({ page }) => {
    await page.goto("/auth/callback?next=//evil.example");
    await expect(page).toHaveURL(/\/auth\/error$/);
  });
});
