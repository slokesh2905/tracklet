import "server-only";
import { eq, not, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alerts, priceHistory, products, user, userSettings } from "@/lib/db/schema";
import { deliverAlert, type AlertRecipient } from "@/lib/notify";
import type { PipelineProduct, PipelineStore } from "@/lib/pipeline";

/** A user's email + notification settings (defaults when they never saved settings). */
export async function loadRecipient(userId: string): Promise<AlertRecipient> {
  const [row] = await db
    .select({
      email: user.email,
      emailAlerts: userSettings.email_alerts,
      discordWebhookUrl: userSettings.discord_webhook_url,
    })
    .from(user)
    .leftJoin(userSettings, eq(userSettings.user_id, user.id))
    .where(eq(user.id, userId));

  return {
    email: row?.email ?? null,
    emailAlerts: row?.emailAlerts ?? true,
    discordWebhookUrl: row?.discordWebhookUrl ?? null,
  };
}

export function createDbPipelineStore(): PipelineStore {
  const recipients = new Map<string, Promise<AlertRecipient>>();

  return {
    async dueProducts(limit) {
      return db
        .select({
          id: products.id,
          user_id: products.user_id,
          url: products.url,
          name: products.name,
          current_price: products.current_price,
          currency: products.currency,
          image_url: products.image_url,
          in_stock: products.in_stock,
          target_price: products.target_price,
          alert_pct: products.alert_pct,
          lowest_price: products.lowest_price,
          fail_count: products.fail_count,
        })
        .from(products)
        .where(not(products.paused))
        // Never-checked products first, then the stalest (matches products_stalest_idx).
        .orderBy(sql`${products.last_checked_at} asc nulls first`)
        .limit(limit);
    },

    async saveResult(product, scraped, priceChanged) {
      const stockChanged = product.in_stock !== scraped.inStock;
      await db
        .update(products)
        .set({
          current_price: scraped.price,
          original_price: scraped.originalPrice,
          currency: scraped.currency,
          in_stock: scraped.inStock,
          image_url: product.image_url ?? scraped.imageUrl,
          last_checked_at: new Date().toISOString(),
          last_error: null,
          fail_count: 0,
        })
        .where(eq(products.id, product.id));

      if (priceChanged || stockChanged) {
        await db.insert(priceHistory).values({
          product_id: product.id,
          price: scraped.price,
          currency: scraped.currency,
          in_stock: scraped.inStock,
        });
      }
    },

    async saveFailure(product, message, pause) {
      await db
        .update(products)
        .set({
          last_error: message.slice(0, 500),
          fail_count: product.fail_count + 1,
          last_checked_at: new Date().toISOString(),
          paused: pause,
        })
        .where(eq(products.id, product.id));
    },

    async deliverAlert(event) {
      let recipient = recipients.get(event.product.user_id);
      if (!recipient) {
        recipient = loadRecipient(event.product.user_id);
        recipients.set(event.product.user_id, recipient);
      }

      const channels = await deliverAlert(
        {
          kind: event.kind,
          productId: event.product.id,
          productName: event.product.name,
          productUrl: event.product.url,
          imageUrl: event.product.image_url,
          oldPrice: event.oldPrice,
          newPrice: event.newPrice,
          currency: event.currency,
        },
        await recipient
      );

      await db.insert(alerts).values({
        user_id: event.product.user_id,
        product_id: event.product.id,
        kind: event.kind,
        old_price: event.oldPrice,
        new_price: event.newPrice,
        currency: event.currency,
        channels,
      });

      return channels;
    },
  };
}
