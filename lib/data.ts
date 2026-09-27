import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { convert, getRates } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  alerts,
  collections,
  priceHistory,
  products,
  userSettings,
  type AlertRow,
  type CollectionRow,
  type ProductInsightRow,
  type ProductRow,
  type UserSettingsRow,
} from "@/lib/db/schema";
import { isGreatDeal } from "@/lib/deals";
import { DAY_MS } from "@/lib/format";
import { computeInsights, type Insights, type PricePoint } from "@/lib/insights";
import { getUser } from "@/lib/session";

// Every loader here scopes its queries to the signed-in user. The database is
// never reachable from the browser, so this layer is the authorization boundary.

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
  const user = await getUser();
  if (!user) return DEFAULT_SETTINGS;
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.user_id, user.id) });
  return { ...DEFAULT_SETTINGS, ...row };
});

export const getUnreadAlertCount = cache(async () => {
  const user = await getUser();
  if (!user) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(alerts)
    .where(and(eq(alerts.user_id, user.id), isNull(alerts.read_at)));
  return row?.n ?? 0;
});

function statusOf(product: ProductRow, firstPrice: number, points: number, now: number): ProductStatus {
  if (points <= 1 && now - new Date(product.created_at).getTime() < DAY_MS) return "new";
  if (product.current_price < firstPrice) return "dropped";
  if (product.current_price > firstPrice) return "increased";
  return "unchanged";
}

type ProductWithRelations = ProductRow & {
  priceHistory: PricePoint[];
  insight: Pick<ProductInsightRow, "verdict"> | null;
};

export function enrichProduct(p: ProductWithRelations, now = Date.now()): DashboardProduct {
  const history = [...p.priceHistory].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  const insights = computeInsights(history, p.current_price, now);
  const firstPrice = history[0]?.price ?? p.current_price;
  const { priceHistory: _h, insight, ...product } = p;

  return {
    ...product,
    status: statusOf(product, firstPrice, history.length, now),
    percentChange: insights.changeFromFirst,
    firstPrice,
    dealScore: insights.dealScore,
    dealLabel: insights.dealLabel,
    isAllTimeLow: insights.isAllTimeLow,
    trend: insights.trend,
    spark: history.slice(-30).map((h) => h.price),
    verdict: insight?.verdict ?? null,
  };
}

export const getDashboardData = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  const [rows, settings, unreadAlerts, userCollections] = await Promise.all([
    db.query.products.findMany({
      where: eq(products.user_id, user.id),
      orderBy: desc(products.created_at),
      with: {
        priceHistory: { columns: { price: true, checked_at: true } },
        insight: { columns: { verdict: true } },
      },
    }),
    getSettings(),
    getUnreadAlertCount(),
    db.query.collections.findMany({
      where: eq(collections.user_id, user.id),
      orderBy: asc(collections.created_at),
    }),
  ]);

  const now = Date.now();
  const enriched = rows.map((p) => enrichProduct(p, now));

  // Convert every saving into the user's currency before summing.
  const rates = await getRates(settings.preferred_currency);
  let totalSavings = 0;
  let biggestDrop: DashboardStats["biggestDrop"] = null;
  for (const p of enriched) {
    if (p.status !== "dropped") continue;
    const saved = convert(p.firstPrice - p.current_price, p.currency, rates);
    if (saved !== null) totalSavings += saved;
    if (!biggestDrop || p.percentChange < biggestDrop.percentChange) {
      biggestDrop = { name: p.name, percentChange: p.percentChange };
    }
  }

  const stats: DashboardStats = {
    totalTracked: enriched.length,
    currency: settings.preferred_currency,
    totalSavings,
    biggestDrop,
    greatDeals: enriched.filter(isGreatDeal).length,
    unreadAlerts,
  };

  return { user, products: enriched, stats, settings, collections: userCollections as CollectionRow[] };
});

export async function getProductDetail(id: string) {
  const user = await getUser();
  if (!user) return null;

  const row = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.user_id, user.id)),
    with: {
      priceHistory: {
        columns: { price: true, checked_at: true, in_stock: true },
        orderBy: asc(priceHistory.checked_at),
      },
      insight: true,
      alerts: {
        columns: { id: true, kind: true, old_price: true, new_price: true, currency: true, created_at: true },
        orderBy: desc(alerts.created_at),
        limit: 10,
      },
    },
  });
  if (!row) return null;

  const { priceHistory: history, insight, alerts: recentAlerts, ...product } = row;
  const insights = computeInsights(history, product.current_price);
  const verdict = insight && insight.price_at_generation === product.current_price ? insight : null;

  return {
    product,
    history: history.map((h) => ({ price: h.price, checked_at: h.checked_at })),
    insights,
    verdict,
    staleVerdict: insight && !verdict ? insight : null,
    alerts: recentAlerts,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

export async function getAlerts() {
  const user = await getUser();
  if (!user) return [];
  return db.query.alerts.findMany({
    where: eq(alerts.user_id, user.id),
    orderBy: desc(alerts.created_at),
    limit: 100,
    with: { product: { columns: { name: true, image_url: true, url: true } } },
  }) as Promise<Array<AlertRow & { product: Pick<ProductRow, "name" | "image_url" | "url"> | null }>>;
}

export async function getCollectionsWithCounts() {
  const user = await getUser();
  if (!user) return [];
  return db.query.collections.findMany({
    where: eq(collections.user_id, user.id),
    orderBy: asc(collections.created_at),
    with: {
      products: {
        columns: { id: true, name: true, image_url: true, current_price: true, currency: true },
        orderBy: desc(products.created_at),
      },
    },
  });
}
