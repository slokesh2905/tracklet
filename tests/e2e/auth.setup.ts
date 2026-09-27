import { existsSync, readFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { OUTBOX } from "../../playwright.config";
import { DEMO_EMAIL } from "./helpers";

const STATE = "tests/e2e/.auth/demo.json";

type OutboxEntry = { to: string; subject: string; meta: { magicLink?: string } };

function latestMagicLink(email: string) {
  if (!existsSync(OUTBOX)) return undefined;
  return readFileSync(OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxEntry)
    .filter((m) => m.to === email && m.meta.magicLink)
    .at(-1)?.meta.magicLink;
}

/**
 * Signs in through the real passwordless flow: submit the email in the UI,
 * pick the magic link out of the email outbox, follow it through Better Auth's
 * verify endpoint, and save the session cookie for the other tests.
 */
setup("sign in with a magic link", async ({ page }) => {
  await page.goto("/?signin=1");
  const dialog = page.getByRole("dialog", { name: "Sign in to Tracklet" });
  await dialog.getByPlaceholder("you@example.com").fill(DEMO_EMAIL);
  await dialog.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(dialog.getByText("Check your inbox")).toBeVisible();

  let link: string | undefined;
  await expect.poll(() => (link = latestMagicLink(DEMO_EMAIL)), { timeout: 20_000 }).toBeTruthy();

  await page.goto(link!);
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Track a new product" })).toBeVisible();
  await page.context().storageState({ path: STATE });
});
