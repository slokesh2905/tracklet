import { createElement } from "react";
import { NextResponse } from "next/server";
import WeeklyDigestEmail, { type DigestItem } from "@/emails/WeeklyDigestEmail";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { DAY_MS, percentChange } from "@/lib/format";
import { computeInsights } from "@/lib/insights";
import { sendEmail } from "@/lib/notify";
import { loadRecipient } from "@/lib/pipeline-store";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const weekAgo = now - 7 * DAY_MS;

  const [{ data: products, error }, { data: optedOut }] = await Promise.all([
    supabase
      .from("products")
      .select("id, user_id, name, current_price, currency, price_history(price, checked_at)")
      .order("created_at", { ascending: false }),
    supabase.from("user_settings").select("user_id").eq("weekly_digest", false),
  ]);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const skip = new Set((optedOut ?? []).map((s) => s.user_id));
  const byUser = new Map<string, DigestItem[]>();

  for (const p of products ?? []) {
    if (skip.has(p.user_id)) continue;
    const history = (p.price_history ?? []) as Array<{ price: number; checked_at: string }>;
    const insights = computeInsights(history, Number(p.current_price), now);

    // Price in effect a week ago = last history point at or before then.
    const before = history
      .filter((h) => new Date(h.checked_at).getTime() <= weekAgo)
      .sort((a, b) => a.checked_at.localeCompare(b.checked_at))
      .at(-1);

    const items = byUser.get(p.user_id) ?? [];
    items.push({
      name: p.name,
      detailUrl: `${env.NEXT_PUBLIC_APP_URL}/products/${p.id}`,
      currentPrice: Number(p.current_price),
      currency: p.currency,
      weekChangePct: before ? percentChange(Number(before.price), Number(p.current_price)) : 0,
      dealLabel: insights.dealLabel,
    });
    byUser.set(p.user_id, items);
  }

  let sent = 0;
  for (const [userId, items] of byUser) {
    const recipient = await loadRecipient(supabase, userId);
    if (!recipient.email) continue;
    items.sort((a, b) => a.weekChangePct - b.weekChangePct);
    try {
      await sendEmail(
        recipient.email,
        "Your week in prices",
        createElement(WeeklyDigestEmail, {
          items: items.slice(0, 25),
          dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
          settingsUrl: `${env.NEXT_PUBLIC_APP_URL}/settings`,
        })
      );
      sent++;
    } catch (err) {
      console.error(`Digest to ${userId} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, users: byUser.size, sent });
}
