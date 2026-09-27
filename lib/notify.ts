import "server-only";
import { createElement } from "react";
import type { AlertKind } from "@/lib/db/schema";
import { ALERT_COPY } from "@/lib/alerts";
import { env } from "@/lib/env";
import { formatPercent, formatPrice, percentChange } from "@/lib/format";
import PriceAlertEmail from "@/emails/PriceAlertEmail";
import { sendEmail } from "@/lib/mailer";

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
  const settingsUrl = `${env.NEXT_PUBLIC_APP_URL}/settings`;
  const delivered: string[] = [];
  const jobs: Array<Promise<void>> = [];

  if (recipient.emailAlerts && recipient.email) {
    jobs.push(
      sendEmail({
        to: recipient.email,
        subject: `${copy.emoji} ${copy.title}: ${message.productName.slice(0, 80)}`,
        react: createElement(PriceAlertEmail, { ...message, detailUrl, settingsUrl }),
        unsubscribeUrl: settingsUrl,
      }).then(() => void delivered.push("email"))
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
