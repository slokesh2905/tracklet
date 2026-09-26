import "server-only";
import { cache } from "react";
import type {
  AlertRow,
  CollectionRow,
  ProductInsightRow,
  ProductRow,
  UserSettingsRow,
} from "@/lib/database.types";
import { convert, getRates } from "@/lib/currency";
import { isGreatDeal } from "@/lib/deals";
import { DAY_MS } from "@/lib/format";
import { computeInsights, type Insights, type PricePoint } from "@/lib/insights";
import { createClient, getUser } from "@/lib/supabase/server";

export type ProductStatus = "new" | "dropped" | "increased" | "unchanged";

export type DashboardProduct = ProductRow & {
  status: ProductStatus;
  percentChange: number;
  firstPrice: number;
  dealScore: number;
  dealLabel: Insights["dealLabel"];
  isAllTimeLow: boolean;
  trend: Insights["trend"];
  /** Up to 30 most recent prices for the card sparkline. */
  spark: number[];
  verdict: ProductInsightRow["verdict"] | null;
};

export type DashboardStats = {
  totalTracked: number;
  currency: string;
  totalSavings: number;
  biggestDrop: { name: string; percentChange: number } | null;
  greatDeals: number;
  unreadAlerts: number;
};

export const DEFAULT_SETTINGS: Omit<UserSettingsRow, "user_id" | "updated_at"> = {
  preferred_currency: "USD",
  email_alerts: true,
  weekly_digest: true,
  discord_webhook_url: null,
};

export const getSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("*").maybeSingle();
  return { ...DEFAULT_SETTINGS, ...data };
});

const NEW_WINDOW_MS = DAY_MS;

function statusOf(product: ProductRow, firstPrice: number, points: number, now: number): ProductStatus {
  const current = Number(product.current_price);
  if (points <= 1 && now - new Date(product.created_at).getTime() < NEW_WINDOW_MS) return "new";
  if (current < firstPrice) return "dropped";
  if (current > firstPrice) return "increased";
  return "unchanged";
}

type ProductWithRelations = ProductRow & {
  price_history: PricePoint[];
  product_insights: Pick<ProductInsightRow, "verdict"> | null;
};

export function enrichProduct(p: ProductWithRelations, now = Date.now()): DashboardProduct {
  const history = [...(p.price_history ?? [])].sort((a, b) =>
    a.checked_at.localeCompare(b.checked_at)
  );
  const current = Number(p.current_price);
  const insights = computeInsights(history, current, now);
  const firstPrice = Number(history[0]?.price ?? current);
  const { price_history: _h, product_insights, ...product } = p;

  return {
    ...product,
    current_price: current,
    status: statusOf(p, firstPrice, history.length, now),
    percentChange: insights.changeFromFirst,
    firstPrice,
    dealScore: insights.dealScore,
    dealLabel: insights.dealLabel,
    isAllTimeLow: insights.isAllTimeLow,
    trend: insights.trend,
    spark: history.slice(-30).map((h) => Number(h.price)),
    verdict: product_insights?.verdict ?? null,
  };
}

export const getDashboardData = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const [{ data: rows, error }, settings, { count: unreadAlerts }, { data: collections }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*, price_history(price, checked_at), product_insights(verdict)")
        .order("created_at", { ascending: false }),
      getSettings(),
      supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      supabase.from("collections").select("*").order("created_at"),
    ]);
  if (error) throw error;

  const now = Date.now();
  const products = (rows as unknown as ProductWithRelations[]).map((p) => enrichProduct(p, now));

  // Convert every saving into the user's currency before summing.
  const rates = await getRates(settings.preferred_currency);
  let totalSavings = 0;
  let biggestDrop: DashboardStats["biggestDrop"] = null;
  for (const p of products) {
    if (p.status !== "dropped") continue;
    const saved = convert(p.firstPrice - p.current_price, p.currency, rates);
    if (saved !== null) totalSavings += saved;
    if (!biggestDrop || p.percentChange < biggestDrop.percentChange) {
      biggestDrop = { name: p.name, percentChange: p.percentChange };
    }
  }

  const stats: DashboardStats = {
    totalTracked: products.length,
    currency: settings.preferred_currency,
    totalSavings,
    biggestDrop,
    greatDeals: products.filter(isGreatDeal).length,
    unreadAlerts: unreadAlerts ?? 0,
  };

  return { user, products, stats, settings, collections: (collections ?? []) as CollectionRow[] };
});

export async function getProductDetail(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "*, price_history(price, checked_at, in_stock), product_insights(*), alerts(id, kind, old_price, new_price, currency, created_at)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as ProductRow & {
    price_history: Array<PricePoint & { in_stock: boolean | null }>;
    product_insights: ProductInsightRow | null;
    alerts: Array<Pick<AlertRow, "id" | "kind" | "old_price" | "new_price" | "currency" | "created_at">>;
  };

  const history = [...row.price_history].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  const insights = computeInsights(history, Number(row.current_price));
  const { price_history: _h, product_insights, alerts, ...product } = row;

  const verdict =
    product_insights &&
    Number(product_insights.price_at_generation) === Number(product.current_price)
      ? product_insights
      : null;

  return {
    product: { ...product, current_price: Number(product.current_price) },
    history: history.map((h) => ({ price: Number(h.price), checked_at: h.checked_at })),
    insights,
    verdict,
    staleVerdict: product_insights && !verdict ? product_insights : null,
    alerts: [...alerts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

export async function getAlerts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("alerts")
    .select("*, products(name, image_url, url)")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as Array<
    AlertRow & { products: Pick<ProductRow, "name" | "image_url" | "url"> | null }
  >;
}

export async function getCollectionsWithCounts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select("*, products(id, name, image_url, current_price, currency)")
    .order("created_at");
  return (data ?? []) as unknown as Array<
    CollectionRow & {
      products: Array<Pick<ProductRow, "id" | "name" | "image_url" | "current_price" | "currency">>;
    }
  >;
}
