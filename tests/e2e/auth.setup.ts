import { expect, test as setup } from "@playwright/test";
import { DEMO_EMAIL } from "./helpers";

const STATE = "tests/e2e/.auth/demo.json";

type MailpitList = { messages: Array<{ ID: string; To: Array<{ Address: string }>; Created: string }> };

/**
 * Signs in through the real passwordless flow: submit the email in the UI,
 * read the magic link from the local Mailpit inbox, follow it through
 * /auth/callback, and save the resulting session cookies for other tests.
 */
setup("sign in with a magic link", async ({ page, request }) => {
  const mailpit = process.env.MAILPIT_URL!;
  await request.delete(`${mailpit}/api/v1/messages`);

  await page.goto("/?signin=1");
  const dialog = page.getByRole("dialog", { name: "Sign in to Tracklet" });
  await dialog.getByPlaceholder("you@example.com").fill(DEMO_EMAIL);
  await dialog.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(dialog.getByText("Check your inbox")).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = (await (await request.get(`${mailpit}/api/v1/messages`)).json()) as MailpitList;
        const msg = list.messages.find((m) => m.To.some((t) => t.Address === DEMO_EMAIL));
        if (!msg) return false;
        const body = (await (await request.get(`${mailpit}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
        link = body.Text.match(/https?:\/\/\S+verify\S+/)?.[0];
        return Boolean(link);
      },
      { timeout: 20_000 }
    )
    .toBe(true);

  await page.goto(link!);
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Track a new product" })).toBeVisible();
  await page.context().storageState({ path: STATE });
});
