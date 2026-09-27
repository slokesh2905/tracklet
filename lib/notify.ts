import "server-only";
import { createElement, type ReactElement } from "react";
import { Resend } from "resend";
import type { AlertKind } from "@/lib/db/schema";
import { ALERT_COPY } from "@/lib/alerts";
import { env, serverEnv } from "@/lib/env";
import { formatPercent, formatPrice, percentChange } from "@/lib/format";
import PriceAlertEmail from "@/emails/PriceAlertEmail";

let resend: Resend | null = null;

/**
 * Send an email through Resend. Two non-production escape hatches:
 * - EMAIL_OUTBOX_FILE: append the message as a JSON line instead (E2E tests read it).
 *   Ignored on Vercel, so a stray variable can never swallow real emails.
 * - No RESEND_API_KEY in development: log it, so sign-in links still work locally.
 */
export async function sendEmail(
  to: string,
  subject: string,
  react: ReactElement,
  meta: Record<string, string> = {}
) {
  const outbox = process.env.EMAIL_OUTBOX_FILE;
  if (outbox && !process.env.VERCEL) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(outbox, JSON.stringify({ to, subject, meta, at: Date.now() }) + "\n");
    return;
  }
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "development") {
    console.info(`[email] to=${to} subject="${subject}"`, meta);
    return;
  }

  resend ??= new Resend(serverEnv("RESEND_API_KEY"));
  const { error } = await resend.emails.send({
    from: serverEnv("RESEND_FROM_EMAIL"),
    to,
    subject,
    react,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

type DiscordEmbed = {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  thumbnail?: { url: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
};

export async function sendDiscord(webhookUrl: string, embed: DiscordEmbed) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Tracklet", embeds: [embed] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord webhook returned ${res.status}`);
}

export type AlertMessage = {
  kind: AlertKind;
  productId: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  oldPrice: number;
  newPrice: number;
  currency: string;
};

export type AlertRecipient = {
  email: string | null;
  emailAlerts: boolean;
  discordWebhookUrl: string | null;
};

/** Send one alert to every channel the user enabled. Returns channels that succeeded. */
export async function deliverAlert(
  message: AlertMessage,
  recipient: AlertRecipient
): Promise<string[]> {
  const copy = ALERT_COPY[message.kind];
  const detailUrl = `${env.NEXT_PUBLIC_APP_URL}/products/${message.productId}`;
  const delivered: string[] = [];
  const jobs: Array<Promise<void>> = [];

  if (recipient.emailAlerts && recipient.email) {
    jobs.push(
      sendEmail(
        recipient.email,
        `${copy.emoji} ${copy.title}: ${message.productName.slice(0, 80)}`,
        createElement(PriceAlertEmail, {
          ...message,
          detailUrl,
          settingsUrl: `${env.NEXT_PUBLIC_APP_URL}/settings`,
        })
      ).then(() => void delivered.push("email"))
    );
  }

  if (recipient.discordWebhookUrl) {
    const change = percentChange(message.oldPrice, message.newPrice);
    jobs.push(
      sendDiscord(recipient.discordWebhookUrl, {
        title: `${copy.emoji} ${copy.title}`,
        description: message.productName.slice(0, 200),
        url: detailUrl,
        color: 0xf97316,
        ...(message.imageUrl ? { thumbnail: { url: message.imageUrl } } : {}),
        fields: [
          { name: "Now", value: formatPrice(message.newPrice, message.currency), inline: true },
          { name: "Was", value: formatPrice(message.oldPrice, message.currency), inline: true },
          { name: "Change", value: formatPercent(change, { signed: true }), inline: true },
        ],
      }).then(() => void delivered.push("discord"))
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") console.error("Alert delivery failed:", r.reason);
  }
  return delivered;
}
