import type { DashboardProduct } from "@/lib/data";
import type { AlertKind } from "@/lib/db/schema";
import { DAY_MS, percentChange } from "@/lib/format";
import { clip, toSteps, windowStats, type PricePoint } from "@/lib/insights";

/** Only alerts this recent are still "worth a look". */
const RECENT_DAYS = 14;
const MAX_CARDS = 5;
const MAX_TARGETS = 3;

/** What deserves a card, most important first. Restocks and the like stay in Alerts. */
const PRIORITY = ["target_reached", "all_time_low", "price_drop"] as const;
export type HeroKind = (typeof PRIORITY)[number];

export type HomeAlert = {
  product_id: string;
  kind: AlertKind;
  old_price: number | string | null;
  created_at: string;
};

export type HeroCard = {
  productId: string;
  kind: HeroKind;
  name: string;
  url: string;
  imageUrl: string | null;
  currency: string;
  price: number;
  /** The price before the move that raised this card. */
  was: number | null;
  changePct: number | null;
  /** When the alert fired. */
  at: string;
  spark: number[];
  target: number | null;
  alertPct: number | null;
  verdict: DashboardProduct["verdict"];
  confidence: number | null;
  verdictSummary: string | null;
};

export type TargetRow = {
  productId: string;
  name: string;
  imageUrl: string | null;
  currency: string;
  price: number;
  target: number;
  /** How far the price still has to fall, in percent of today's price. */
  toGoPct: number;
  /** How close the price is to the target, 0–100. */
  fillPct: number;
};

const isHero = (kind: AlertKind): kind is HeroKind => (PRIORITY as readonly string[]).includes(kind);
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/**
 * One card per product that did something worth acting on lately: its most important recent alert
 * wins, then the newest. Built from alerts, so a card appears exactly when an alert fired.
 */
export function heroCards(products: DashboardProduct[], alerts: HomeAlert[], now = Date.now()): HeroCard[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const best = new Map<string, HomeAlert & { kind: HeroKind }>();

  for (const a of alerts) {
    if (!isHero(a.kind) || !byId.has(a.product_id)) continue;
    if (now - new Date(a.created_at).getTime() > RECENT_DAYS * DAY_MS) continue;
    const held = best.get(a.product_id);
    const better =
      !held ||
      PRIORITY.indexOf(a.kind) < PRIORITY.indexOf(held.kind) ||
      (a.kind === held.kind && a.created_at > held.created_at);
    if (better) best.set(a.product_id, { ...a, kind: a.kind });
  }

  return [...best.values()]
    .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_CARDS)
    .map((a) => {
      const p = byId.get(a.product_id)!;
      const was = num(a.old_price);
      return {
        productId: p.id,
        kind: a.kind,
        name: p.name,
        url: p.url,
        imageUrl: p.image_url,
        currency: p.currency,
        price: p.current_price,
        was,
        changePct: was ? percentChange(was, p.current_price) : null,
        at: a.created_at,
        spark: p.spark,
        target: num(p.target_price),
        alertPct: num(p.alert_pct),
        verdict: p.verdict,
        confidence: p.verdictConfidence,
        verdictSummary: p.verdictSummary,
      };
    });
}

/** Products with a price target that haven't reached it, nearest first. */
export function closestToTarget(products: DashboardProduct[]): TargetRow[] {
  return products
    .flatMap((p) => {
      const target = num(p.target_price);
      if (target === null || !p.in_stock || p.current_price <= target) return [];
      return [
        {
          productId: p.id,
          name: p.name,
          imageUrl: p.image_url,
          currency: p.currency,
          price: p.current_price,
          target,
          toGoPct: ((p.current_price - target) / p.current_price) * 100,
          fillPct: (target / p.current_price) * 100,
        },
      ];
    })
    .sort((a, b) => a.toGoPct - b.toGoPct)
    .slice(0, MAX_TARGETS);
}

/** Products with no price target, which Home nudges the user to set. */
export function withoutTarget(products: DashboardProduct[]) {
  return products.filter((p) => p.target_price === null).length;
}

export type PriceWindow = {
  /** Price steps from `days` ago to now: each price holds until the next point. */
  steps: Array<{ t: number; price: number }>;
  since: number;
  /** "Now" for this window: where today's price sits on the chart. */
  until: number;
  low: number;
  high: number;
  /** Time-weighted, so a price that held for weeks counts for more than a one-day blip. */
  average: number;
};

/** The last `days` of a price history, for the desktop's featured chart. */
export function priceWindow(history: PricePoint[], currentPrice: number, now = Date.now(), days = 90): PriceWindow {
  const since = now - days * DAY_MS;
  const steps = clip(toSteps(history, currentPrice, now), since);
  return { steps, since, until: now, ...windowStats(steps, now) };
}

export type ChangedRow = {
  productId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  currency: string;
  price: number;
  /** The last change, in percent of the price before it. */
  changePct: number;
  changedAt: string;
  trend: number[];
};

/** Products whose price moved in the last `days`, most recent first. */
export function recentlyChanged(products: DashboardProduct[], now = Date.now(), days = 7): ChangedRow[] {
  return products
    .flatMap((p) => {
      const change = p.lastChange;
      if (!change || now - new Date(change.at).getTime() > days * DAY_MS) return [];
      return [
        {
          productId: p.id,
          name: p.name,
          url: p.url,
          imageUrl: p.image_url,
          currency: p.currency,
          price: p.current_price,
          changePct: percentChange(change.from, p.current_price),
          changedAt: change.at,
          trend: p.trend30,
        },
      ];
    })
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}
