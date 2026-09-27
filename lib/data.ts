import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { convert, getRates } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  alerts,
  collections,
  ITEM_FIELDS,
  priceHistory,
  products,
  userSettings,
  type AlertRow,
  type CatalogItemRow,
  type CollectionRow,
  type ItemInsightRow,
  type ProductRow,
  type StoreOfferRow,
  type TrackingRow,
  type UserSettingsRow,
} from "@/lib/db/schema";
import { isGreatDeal } from "@/lib/deals";
import { buildEvidence, gateVerdict, type Evidence, type Gate, type StoreOffer } from "@/lib/evidence";
import { DAY_MS } from "@/lib/format";
import { computeInsights, type Insights, type PricePoint } from "@/lib/insights";
import { getUser } from "@/lib/session";

// Every loader here scopes its queries to the signed-in user's tracking rows.
// Catalog data (prices, history, offers) is shared across users, but contains
// nothing personal. The database is never reachable from the browser.

export type ProductStatus = "new" | "dropped" | "increased" | "unchanged";

export type BestOffer = Pick<StoreOfferRow, "retailer" | "url" | "price"> & { savingPct: number };

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
  verdict: ItemInsightRow["verdict"] | null;
  /** How many users track this product (shared price data). */
  shoppers: number;
  bestOffer: BestOffer | null;
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

/** A tracking row flattened with the catalog fields the UI shows. */
export function flatten(tracking: TrackingRow, item: CatalogItemRow): ProductRow {
  const picked = Object.fromEntries(ITEM_FIELDS.map((f) => [f, item[f]])) as Pick<CatalogItemRow, (typeof ITEM_FIELDS)[number]>;
  return { ...tracking, ...picked };
}

export function toStoreOffers(offers: StoreOfferRow[]): StoreOffer[] {
  return offers.map((o) => ({
    retailer: o.retailer,
    url: o.url,
    price: o.price,
    currency: o.currency,
    inStock: o.in_stock,
    match: o.match,
    checkedAt: o.checked_at,
  }));
}

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

function statusOf(created: string, current: number, firstPrice: number, points: number, now: number): ProductStatus {
  if (points <= 1 && now - new Date(created).getTime() < DAY_MS) return "new";
  if (current < firstPrice) return "dropped";
  if (current > firstPrice) return "increased";
  return "unchanged";
}

type ItemWithRelations = CatalogItemRow & {
  priceHistory: PricePoint[];
  insight: Pick<ItemInsightRow, "verdict"> | null;
  offers: StoreOfferRow[];
  trackers: { id: string }[];
};

export function enrichProduct(tracking: TrackingRow, item: ItemWithRelations, now = Date.now()): DashboardProduct {
  const history = [...item.priceHistory].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  const insights = computeInsights(history, item.current_price, now);
  const firstPrice = history[0]?.price ?? item.current_price;
  const evidence = buildEvidence({
    currentPrice: item.current_price,
    currency: item.currency,
    originalPrice: item.original_price,
    inStock: item.in_stock,
    firstSeen: history[0]?.checked_at ?? item.created_at,
    shoppers: item.trackers.length,
    insights,
    offers: toStoreOffers(item.offers),
  });

  return {
    ...flatten(tracking, item),
    status: statusOf(tracking.created_at, item.current_price, firstPrice, history.length, now),
    percentChange: insights.changeFromFirst,
    firstPrice,
    dealScore: insights.dealScore,
    dealLabel: insights.dealLabel,
    isAllTimeLow: insights.isAllTimeLow,
    trend: insights.trend,
    spark: history.slice(-30).map((h) => h.price),
    verdict: item.insight?.verdict ?? null,
    shoppers: item.trackers.length,
    bestOffer: evidence.bestOffer
      ? { retailer: evidence.bestOffer.retailer, url: evidence.bestOffer.url, price: evidence.bestOffer.price, savingPct: evidence.bestOffer.savingPct }
      : null,
  };
}

const ITEM_WITH = {
  priceHistory: { columns: { price: true, checked_at: true } },
  insight: { columns: { verdict: true } },
  offers: true,
  trackers: { columns: { id: true } },
} as const;

export const getDashboardData = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  const [rows, settings, unreadAlerts, userCollections] = await Promise.all([
    db.query.products.findMany({
      where: eq(products.user_id, user.id),
      orderBy: desc(products.created_at),
      with: { item: { with: ITEM_WITH } },
    }),
    getSettings(),
    getUnreadAlertCount(),
    db.query.collections.findMany({
      where: eq(collections.user_id, user.id),
      orderBy: asc(collections.created_at),
    }),
  ]);

  const now = Date.now();
  const enriched = rows.map(({ item, ...tracking }) => enrichProduct(tracking, item, now));

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
      item: {
        with: {
          priceHistory: { columns: { price: true, checked_at: true, in_stock: true }, orderBy: asc(priceHistory.checked_at) },
          insight: true,
          offers: true,
          trackers: { columns: { id: true } },
        },
      },
      alerts: {
        columns: { id: true, kind: true, old_price: true, new_price: true, currency: true, created_at: true },
        orderBy: desc(alerts.created_at),
        limit: 10,
      },
    },
  });
  if (!row) return null;

  const { item, alerts: recentAlerts, ...tracking } = row;
  const history = item.priceHistory;
  const insights = computeInsights(history, item.current_price);
  const offers = toStoreOffers(item.offers);
  const evidence: Evidence = buildEvidence({
    currentPrice: item.current_price,
    currency: item.currency,
    originalPrice: item.original_price,
    inStock: item.in_stock,
    firstSeen: history[0]?.checked_at ?? item.created_at,
    shoppers: item.trackers.length,
    insights,
    offers,
  });
  const gate: Gate = gateVerdict(evidence);
  const insight = item.insight;
  const verdict = insight && insight.price_at_generation === item.current_price ? insight : null;

  return {
    product: flatten(tracking, item),
    catalogItemId: item.id,
    comparedAt: item.compared_at,
    history: history.map((h) => ({ price: h.price, checked_at: h.checked_at })),
    insights,
    evidence,
    gate,
    offers: [...offers].sort((a, b) => a.price - b.price),
    verdict,
    staleVerdict: insight && !verdict ? insight : null,
    alerts: recentAlerts,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

export async function getAlerts() {
  const user = await getUser();
  if (!user) return [];
  const rows = await db.query.alerts.findMany({
    where: eq(alerts.user_id, user.id),
    orderBy: desc(alerts.created_at),
    limit: 100,
    with: { product: { with: { item: { columns: { name: true, image_url: true, url: true } } } } },
  });
  return rows.map(({ product, ...alert }) => ({ ...alert, product: product?.item ?? null })) as Array<
    AlertRow & { product: Pick<CatalogItemRow, "name" | "image_url" | "url"> | null }
  >;
}

export async function getCollectionsWithCounts() {
  const user = await getUser();
  if (!user) return [];
  const rows = await db.query.collections.findMany({
    where: eq(collections.user_id, user.id),
    orderBy: asc(collections.created_at),
    with: {
      products: {
        orderBy: desc(products.created_at),
        with: { item: { columns: { name: true, image_url: true, current_price: true, currency: true } } },
      },
    },
  });
  return rows.map(({ products: tracked, ...c }) => ({
    ...c,
    products: tracked.map((t) => ({ id: t.id, ...t.item })),
  }));
}
