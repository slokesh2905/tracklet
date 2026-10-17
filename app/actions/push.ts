"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { isPushConfigured, pushPayload, sendPush } from "@/lib/push";
import { getUser } from "@/lib/session";
import { firstIssue } from "@/lib/validation";

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/, message: "Invalid push endpoint" }).max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
});

export type PushSubscriptionInput = z.input<typeof subscriptionSchema>;

/** Remember this device. Re-subscribing from a shared browser moves it to whoever is signed in now. */
export async function subscribePush(input: PushSubscriptionInput, userAgent?: string): Promise<ActionResult> {
  if (!isPushConfigured()) return fail("Push notifications aren't set up on this deployment");
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const values = {
    user_id: user.id,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: userAgent?.slice(0, 300) ?? null,
  };
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: parsed.data.endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  return { ok: true, message: "Push alerts are on for this device" };
}

export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("Please sign in first");
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.user_id, user.id)));
  return { ok: true, message: "Push alerts are off for this device" };
}

/** Send one notification to the endpoint this device just subscribed with. */
export async function sendTestPush(endpoint: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("Please sign in first");
  const row = await db.query.pushSubscriptions.findFirst({
    where: and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.user_id, user.id)),
  });
  if (!row) return fail("This device isn't subscribed yet");

  const payload = {
    ...pushPayload({ kind: "price_drop", productId: "", productName: "Tracklet is connected", newPrice: 0, currency: "USD" }),
    title: "✅ Tracklet is connected",
    body: "Price alerts for your tracked products will show up here.",
    url: "/dashboard",
    tag: "tracklet-test",
  };
  const result = await sendPush(row, payload);
  if (result === "gone") {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
    return fail("This device's subscription expired. Turn push off and on again.");
  }
  return result === "ok" ? { ok: true, message: "Test notification sent" } : fail("Couldn't send the notification");
}
