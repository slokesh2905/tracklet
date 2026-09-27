"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { sendDiscord } from "@/lib/notify";
import { getUser } from "@/lib/session";
import { firstIssue, settingsSchema, type SettingsInput } from "@/lib/validation";

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const values = {
    preferred_currency: parsed.data.preferredCurrency,
    email_alerts: parsed.data.emailAlerts,
    weekly_digest: parsed.data.weeklyDigest,
    discord_webhook_url: parsed.data.discordWebhookUrl,
  };
  try {
    await db
      .insert(userSettings)
      .values({ user_id: user.id, ...values })
      .onConflictDoUpdate({ target: userSettings.user_id, set: values });
  } catch {
    return fail("Couldn't save settings");
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}

export async function testDiscordWebhook(url: string): Promise<ActionResult> {
  const parsed = settingsSchema.shape.discordWebhookUrl.safeParse(url);
  if (!parsed.success || !parsed.data) {
    return fail(parsed.success ? "Enter a webhook URL first" : firstIssue(parsed.error));
  }
  if (!(await getUser())) return fail("Please sign in first");

  try {
    await sendDiscord(parsed.data, {
      title: "✅ Tracklet is connected",
      description: "Price alerts for your tracked products will show up here.",
      color: 0xf97316,
    });
    return { ok: true, message: "Test message sent" };
  } catch {
    return fail("Discord rejected the webhook. Check the URL.");
  }
}
