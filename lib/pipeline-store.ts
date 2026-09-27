import "server-only";
import { and, eq, not, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alerts, catalogItems, priceHistory, products, user, userSettings } from "@/lib/db/schema";
import { deliverAlert, type AlertRecipient } from "@/lib/notify";
import type { PipelineItem, PipelineStore } from "@/lib/pipeline";

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

const ITEM_COLUMNS = {
  id: catalogItems.id,
  url: catalogItems.url,
  name: catalogItems.name,
  current_price: catalogItems.current_price,
  original_price: catalogItems.original_price,
  currency: catalogItems.currency,
  image_url: catalogItems.image_url,
  in_stock: catalogItems.in_stock,
  lowest_price: catalogItems.lowest_price,
  pending_price: catalogItems.pending_price,
  fail_count: catalogItems.fail_count,
};

export async function loadPipelineItem(itemId: string): Promise<PipelineItem | null> {
  const [row] = await db.select(ITEM_COLUMNS).from(catalogItems).where(eq(catalogItems.id, itemId));
  return row ?? null;
}

export function createDbPipelineStore(): PipelineStore {
  const recipients = new Map<string, Promise<AlertRecipient>>();

  return {
    async dueItems(limit) {
      return db
        .select(ITEM_COLUMNS)
        .from(catalogItems)
        // Only items someone still tracks: untracked items would waste free credits.
        .where(
          and(
            not(catalogItems.paused),
            sql`exists (select 1 from ${products} p where p.catalog_item_id = ${catalogItems.id})`
          )
        )
        // Never-checked items first, then the stalest (matches catalog_items_stalest_idx).
        .orderBy(sql`${catalogItems.last_checked_at} asc nulls first`)
        .limit(limit);
    },

    async saveResult(item, scraped, { priceChanged, confirmed }) {
      const stockChanged = item.in_stock !== scraped.inStock;
      await db
        .update(catalogItems)
        .set({
          current_price: scraped.price,
          original_price: scraped.originalPrice ?? item.original_price,
          currency: scraped.currency,
          in_stock: scraped.inStock,
          image_url: item.image_url ?? scraped.imageUrl,
          pending_price: null,
          pending_since: null,
          last_checked_at: new Date().toISOString(),
          last_error: null,
          fail_count: 0,
        })
        .where(eq(catalogItems.id, item.id));

      if (priceChanged || stockChanged) {
        await db.insert(priceHistory).values({
          catalog_item_id: item.id,
          price: scraped.price,
          currency: scraped.currency,
          in_stock: scraped.inStock,
          source: confirmed ? "confirm" : "check",
        });
      }
    },

    async saveHeld(item, scraped) {
      await db
        .update(catalogItems)
        .set({
          pending_price: scraped.price,
          pending_since: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
        })
        .where(eq(catalogItems.id, item.id));
    },

    async saveFailure(item, message, pause) {
      await db
        .update(catalogItems)
        .set({
          last_error: message.slice(0, 500),
          fail_count: item.fail_count + 1,
          last_checked_at: new Date().toISOString(),
          paused: pause,
        })
        .where(eq(catalogItems.id, item.id));
    },

    async trackersOf(itemId) {
      return db
        .select({
          id: products.id,
          user_id: products.user_id,
          target_price: products.target_price,
          alert_pct: products.alert_pct,
        })
        .from(products)
        .where(eq(products.catalog_item_id, itemId));
    },

    async deliverAlert(event) {
      let recipient = recipients.get(event.tracker.user_id);
      if (!recipient) {
        recipient = loadRecipient(event.tracker.user_id);
        recipients.set(event.tracker.user_id, recipient);
      }

      const channels = await deliverAlert(
        {
          kind: event.kind,
          productId: event.tracker.id,
          productName: event.item.name,
          productUrl: event.item.url,
          imageUrl: event.item.image_url,
          oldPrice: event.oldPrice,
          newPrice: event.newPrice,
          currency: event.currency,
        },
        await recipient
      );

      await db.insert(alerts).values({
        user_id: event.tracker.user_id,
        product_id: event.tracker.id,
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
