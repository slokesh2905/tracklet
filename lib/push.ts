import "server-only";
import webpush from "web-push";
import { ALERT_COPY } from "@/lib/alerts";
import type { AlertKind } from "@/lib/db/schema";
import { formatPrice } from "@/lib/format";

/** The three values web push needs, all free: generate them once with `npx web-push generate-vapid-keys`. */
type VapidEnv = Record<string, string | undefined>;

/** Push is off (UI hidden, delivery skipped) until all three are set, like the other optional channels. */
export function isPushConfigured(vars: VapidEnv = process.env) {
  return Boolean(vars.NEXT_PUBLIC_VAPID_PUBLIC_KEY && vars.VAPID_PRIVATE_KEY && vars.VAPID_SUBJECT);
}

/** The public key the browser needs to subscribe, or null when push isn't set up. */
export function vapidPublicKey() {
  return isPushConfigured() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushPayload = { title: string; body: string; url: string; tag: string; icon: string };

export function pushPayload(message: {
  kind: AlertKind;
  productId: string;
  productName: string;
  newPrice: number;
  currency: string;
}): PushPayload {
  const copy = ALERT_COPY[message.kind];
  return {
    title: `${copy.emoji} ${copy.title}`,
    body: `${message.productName.slice(0, 90)} · ${formatPrice(message.newPrice, message.currency)}`,
    url: `/products/${message.productId}`,
    // A newer alert for the same product replaces the older notification instead of stacking.
    tag: `product-${message.productId}`,
    icon: "/icons/192",
  };
}

export type PushSender = (target: PushTarget, body: string) => Promise<unknown>;

const send: PushSender = (target, body) =>
  webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, body, {
    vapidDetails: {
      subject: process.env.VAPID_SUBJECT!,
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      privateKey: process.env.VAPID_PRIVATE_KEY!,
    },
    TTL: 24 * 60 * 60,
    timeout: 10_000,
  });

/** `gone` means the browser dropped the subscription (404/410): delete it, retrying never works. */
export type PushResult = "ok" | "gone" | "error";

export async function sendPush(target: PushTarget, payload: PushPayload, sender: PushSender = send): Promise<PushResult> {
  try {
    await sender(target, JSON.stringify(payload));
    return "ok";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("Push failed:", status ?? error);
    return "error";
  }
}
