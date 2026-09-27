import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { OUTBOX } from "../../playwright.config";

/**
 * Authorization lives in the server data layer, so prove it end to end:
 * a second real account must not be able to see or export the demo user's data.
 */
test.describe("data isolation between accounts", () => {
  test.skip(({ isMobile }) => isMobile, "one run is enough; this is not layout-dependent");

  test("another user cannot see or export the demo user's product", async ({ page, browser }) => {
    // Find a product id that belongs to the demo user.
    await page.goto("/dashboard");
    const href = await page.getByRole("link", { name: /Sony WH-1000XM5/ }).getAttribute("href");
    expect(href).toMatch(/^\/products\/[0-9a-f-]{36}$/);

    // Sign in as a brand-new account in a clean context.
    const intruder = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const other = await intruder.newPage();
    const email = `intruder-${Date.now()}@tracklet.dev`;
    await other.goto("/?signin=1");
    const dialog = other.getByRole("dialog", { name: "Sign in to Tracklet" });
    await dialog.getByPlaceholder("you@example.com").fill(email);
    await dialog.getByRole("button", { name: "Email me a sign-in link" }).click();

    let link: string | undefined;
    await expect
      .poll(() => {
        if (!existsSync(OUTBOX)) return undefined;
        link = readFileSync(OUTBOX, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as { to: string; meta: { magicLink?: string } })
          .find((m) => m.to === email)?.meta.magicLink;
        return link;
      }, { timeout: 20_000 })
      .toBeTruthy();
    await other.goto(link!);
    await other.waitForURL("**/dashboard");

    // Their dashboard is empty, the demo product 404s, and export has nothing of the demo user's.
    await expect(other.getByText("Nothing tracked yet")).toBeVisible();
    // The route streams (loading.tsx), so the HTTP status is committed before
    // notFound() runs; assert on what the intruder actually sees instead.
    await other.goto(href!);
    await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(other.getByText(/Sony/)).toHaveCount(0);
    expect(await (await other.request.get("/api/export")).text()).not.toContain("Sony");

    await intruder.close();

    // The demo user's product is untouched.
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sony WH-1000XM5");
  });
});
