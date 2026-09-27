import { createElement } from "react";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import WeeklyDigestEmail, { type DigestItem } from "@/emails/WeeklyDigestEmail";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { products, userSettings } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { DAY_MS, percentChange } from "@/lib/format";
import { computeInsights } from "@/lib/insights";
import { sendEmail } from "@/lib/mailer";
import { loadRecipient } from "@/lib/pipeline-store";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const weekAgo = now - 7 * DAY_MS;

  const [rows, optedOut] = await Promise.all([
    db.query.products.findMany({
      columns: { id: true, user_id: true, name: true, current_price: true, currency: true },
      orderBy: desc(products.created_at),
      with: { priceHistory: { columns: { price: true, checked_at: true } } },
    }),
    db.select({ user_id: userSettings.user_id }).from(userSettings).where(eq(userSettings.weekly_digest, false)),
  ]);

  const skip = new Set(optedOut.map((s) => s.user_id));
  const byUser = new Map<string, DigestItem[]>();

  for (const p of rows) {
    if (skip.has(p.user_id)) continue;
    const history = [...p.priceHistory].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
    const insights = computeInsights(history, p.current_price, now);
    // Price in effect a week ago = last history point at or before then.
    const before = history.filter((h) => new Date(h.checked_at).getTime() <= weekAgo).at(-1);

    const items = byUser.get(p.user_id) ?? [];
    items.push({
      name: p.name,
      detailUrl: `${env.NEXT_PUBLIC_APP_URL}/products/${p.id}`,
      currentPrice: p.current_price,
      currency: p.currency,
      weekChangePct: before ? percentChange(before.price, p.current_price) : 0,
      dealLabel: insights.dealLabel,
    });
    byUser.set(p.user_id, items);
  }

  let sent = 0;
  for (const [userId, items] of byUser) {
    const recipient = await loadRecipient(userId);
    if (!recipient.email) continue;
    items.sort((a, b) => a.weekChangePct - b.weekChangePct);
    try {
      const settingsUrl = `${env.NEXT_PUBLIC_APP_URL}/settings`;
      await sendEmail({
        to: recipient.email,
        subject: "Your week in prices",
        react: createElement(WeeklyDigestEmail, {
          items: items.slice(0, 25),
          dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
          settingsUrl,
        }),
        unsubscribeUrl: settingsUrl,
      });
      sent++;
    } catch (err) {
      console.error(`Digest to ${userId} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, users: byUser.size, sent });
}
