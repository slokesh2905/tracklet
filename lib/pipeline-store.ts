import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { deliverAlert, type AlertRecipient } from "@/lib/notify";
import type { PipelineProduct, PipelineStore } from "@/lib/pipeline";

const PRODUCT_COLUMNS =
  "id, user_id, url, name, current_price, currency, image_url, in_stock, target_price, alert_pct, lowest_price, fail_count";

/** Look up a user's email + notification settings (service role). */
export async function loadRecipient(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AlertRecipient> {
  const [{ data: userData }, { data: settings }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from("user_settings")
      .select("email_alerts, discord_webhook_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    email: userData.user?.email ?? null,
    emailAlerts: settings?.email_alerts ?? true,
    discordWebhookUrl: settings?.discord_webhook_url ?? null,
  };
}

export function createSupabasePipelineStore(
  supabase: SupabaseClient<Database>
): PipelineStore {
  const recipients = new Map<string, Promise<AlertRecipient>>();

  return {
    async dueProducts(limit) {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("paused", false)
        .order("last_checked_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PipelineProduct[];
    },

    async saveResult(product, scraped, priceChanged) {
      const stockChanged = product.in_stock !== scraped.inStock;
      const { error } = await supabase
        .from("products")
        .update({
          current_price: scraped.price,
          original_price: scraped.originalPrice,
          currency: scraped.currency,
          in_stock: scraped.inStock,
          image_url: product.image_url ?? scraped.imageUrl,
          last_checked_at: new Date().toISOString(),
          last_error: null,
          fail_count: 0,
        })
        .eq("id", product.id);
      if (error) throw error;

      if (priceChanged || stockChanged) {
        await supabase.from("price_history").insert({
          product_id: product.id,
          price: scraped.price,
          currency: scraped.currency,
          in_stock: scraped.inStock,
        });
      }
    },

    async saveFailure(product, message, pause) {
      await supabase
        .from("products")
        .update({
          last_error: message.slice(0, 500),
          fail_count: product.fail_count + 1,
          last_checked_at: new Date().toISOString(),
          paused: pause,
        })
        .eq("id", product.id);
    },

    async deliverAlert(event) {
      let recipient = recipients.get(event.product.user_id);
      if (!recipient) {
        recipient = loadRecipient(supabase, event.product.user_id);
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

      await supabase.from("alerts").insert({
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
