import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, isMobile } from "./helpers";

test.describe("signed in", () => {
  test("dashboard shows stats, filters and product cards", async ({ page }) => {
    await page.goto("/dashboard");
    // Phones fold the stat cards into one summary line under the heading.
    if (isMobile(page)) await expect(page.getByText(/^\d+ tracked · prices checked/)).toBeVisible();
    else await expect(page.getByText("Tracking", { exact: true })).toBeVisible();
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

  test("product detail shows chart, insights and alert rules", async ({ page }, testInfo) => {
    // Each device edits a different product, so the parallel runs can't overwrite each other's alert.
    const name = { iphone: "Apple AirPods Pro", pixel: "Dyson V12" }[testInfo.project.name] ?? "Sony WH-1000XM5";
    await page.goto("/dashboard");
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    await expect(page.getByText("Deal score", { exact: true })).toBeVisible();
    await expect(page.getByText("All-time low").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (!isMobile(page)) {
      const target = page.getByLabel("Alert me when the price is at or below");
      await target.fill("22000");
      await page.getByRole("button", { name: "Save alert" }).click();
      await expect(page.getByText("Alert rules saved")).toBeVisible();
      await page.reload();
      await expect(target).toHaveValue("22000");
      return;
    }

    // Phones set the alert in a sheet: step the price down, save, and it shows on the page.
    await page.getByRole("button", { name: "Price alert", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Price alert" });
    await sheet.getByRole("button", { name: "Lower price" }).click();
    const value = await sheet.getByText("Alert at or below", { exact: true }).locator("xpath=following-sibling::div").innerText();
    await sheet.getByRole("button", { name: "Save alert" }).click();
    await expect(page.getByText("Alert rules saved")).toBeVisible();
    await page.reload();
    await expect(page.getByText(`Alert at ${value} or below`).first()).toBeVisible();
  });

  test("touch targets are at least 44px on phones", async ({ page }) => {
    test.skip(!isMobile(page), "touch sizing applies to coarse pointers");
    await page.goto("/dashboard");
    // Phones reach card actions by swiping, so check the controls a thumb actually taps.
    const targets = [
      page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: /Alerts/ }),
      page.getByRole("tab", { name: /Great deals/ }),
      page.getByLabel("Search products"),
      page.getByRole("button", { name: /^Sort/ }),
    ];
    for (const target of targets) {
      const box = await target.first().boundingBox();
      expect(box?.height, `${target}`).toBeGreaterThanOrEqual(44);
    }
  });

  test("collections and settings pages fit the screen", async ({ page }) => {
    await page.goto("/collections");
    // Phones list collections as tappable rows; desktop shows each as a titled card.
    if (isMobile(page)) await expect(page.getByRole("button", { name: /^Home office/ })).toBeVisible();
    else await expect(page.getByRole("heading", { name: "Home office" })).toBeVisible();
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
    // A phone card shows at most two badges, and price news outranks the shopper count.
    if (!isMobile(page)) await expect(sony.getByText("2 tracking")).toBeVisible();
    await sony.getByRole("link", { name: /Sony WH-1000XM5/ }).click();
    await expect(page.getByText(/Price data since .* from 2 shoppers/)).toBeVisible();
  });

  test("a verified cheaper listing on another store is shown", async ({ page }) => {
    await page.goto("/dashboard");
    // Desktop cards carry the cheaper-store badge; phones (two-badge cap) show it on the product page.
    if (!isMobile(page)) await expect(page.getByText(/Cheaper on Croma/)).toBeVisible();

    await page.getByRole("link", { name: /Sony WH-1000XM5/ }).click();
    if (isMobile(page)) await expect(page.getByRole("link", { name: /less on Croma/ })).toBeVisible();
    const stores = page.getByRole("region", { name: "Other stores" });
    await expect(stores.getByRole("link", { name: /Croma.*Exact/ })).toBeVisible();
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
