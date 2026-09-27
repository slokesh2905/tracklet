import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, isMobile } from "./helpers";

test.describe("signed in", () => {
  test("dashboard shows stats, filters and product cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Tracking", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sony WH-1000XM5/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Dyson V12/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("tab", { name: /Great deals/ }).click();
    await expect(page.getByRole("link", { name: /Sony WH-1000XM5/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Kindle Paperwhite/ })).toBeHidden();

    await page.getByLabel("Search products").fill("instant pot");
    // Out of stock, so not a deal you can act on, even at its lowest price.
    await expect(page.getByRole("link", { name: /Instant Pot/ })).toBeHidden();
    await page.getByRole("tab", { name: /^All/ }).click();
    await expect(page.getByRole("link", { name: /Instant Pot/ })).toBeVisible();
    await expect(page.getByText("Out of stock")).toBeVisible();
  });

  test("navigation matches the device: tab bar on phones, header links on desktop", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Main" });
    if (isMobile(page)) {
      await expect(nav.last()).toBeVisible();
      await nav.last().getByRole("link", { name: "Alerts" }).click();
    } else {
      await nav.first().getByRole("link", { name: /Alerts/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
    await expect(page.getByText("Target price reached")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("product detail shows chart, insights and alert rules", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Sony WH-1000XM5/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sony WH-1000XM5");
    await expect(page.getByText("Deal score", { exact: true })).toBeVisible();
    await expect(page.getByText("All-time low").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const target = page.getByLabel("Alert me when the price is at or below");
    await target.fill("22000");
    await page.getByRole("button", { name: "Save alert" }).click();
    await expect(page.getByText("Alert rules saved")).toBeVisible();
    await page.reload();
    await expect(target).toHaveValue("22000");
  });

  test("touch targets are at least 44px on phones", async ({ page }) => {
    test.skip(!isMobile(page), "touch sizing applies to coarse pointers");
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: "Product actions" }).first();
    const box = await trigger.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test("collections and settings pages fit the screen", async ({ page }) => {
    await page.goto("/collections");
    await expect(page.getByRole("heading", { name: "Home office" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/settings");
    await expect(page.getByText("Preferred currency")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("CSV export downloads history", async ({ page }) => {
    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(await res.text()).toContain("Sony WH-1000XM5");
  });
});

test.describe("shared data and useful verdicts from day one", () => {
  test("price history is shared between shoppers tracking the same product", async ({ page }) => {
    await page.goto("/dashboard");
    const sony = page.getByRole("article").filter({ hasText: "Sony WH-1000XM5" });
    await expect(sony.getByText("2 tracking")).toBeVisible();
    await sony.getByRole("link", { name: /Sony WH-1000XM5/ }).click();
    await expect(page.getByText(/Price data since .* from 2 shoppers/)).toBeVisible();
  });

  test("a verified cheaper listing on another store is shown", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/Cheaper on Croma/)).toBeVisible();

    await page.getByRole("link", { name: /Sony WH-1000XM5/ }).click();
    const stores = page.getByRole("region", { name: "Other stores" });
    await expect(stores.getByRole("link", { name: /Croma.*Same item/ })).toBeVisible();
    await expect(stores.getByText("Similar")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a product added today shows facts instead of an AI guess", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Logitech MX Master 3S/ }).click();
    await expect(page.getByText(/too early to judge this price/)).toBeVisible();
    await expect(page.getByText("17% off", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Compare other stores now" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyse this price" })).toHaveCount(0);
  });
});
