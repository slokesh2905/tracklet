import { DAY_MS, percentChange } from "@/lib/format";
import type { Insights } from "@/lib/insights";

export type StoreOffer = {
  retailer: string;
  url: string;
  price: number;
  currency: string;
  inStock: boolean;
  match: "exact" | "similar";
  checkedAt: string;
};

export type Coverage = "none" | "thin" | "some" | "good";

export type Evidence = {
  currentPrice: number;
  currency: string;
  originalPrice: number | null;
  /** Discount off MRP in percent (positive = cheaper than MRP). */
  discountPct: number | null;
  inStock: boolean;
  firstSeen: string;
  shoppers: number;
  coverage: Coverage;
  insights: Insights;
  /** Cheapest in-stock exact match elsewhere, same currency. */
  bestOffer: (StoreOffer & { savingPct: number }) | null;
  similarOffers: StoreOffer[];
};

/** Minimum history before a trend-based verdict is meaningful. */
export const MIN_DAYS = 7;
/** An exact match elsewhere must be at least this much cheaper to recommend it. */
export const ELSEWHERE_MIN_SAVING = 3;

export function coverageOf(insights: Insights): Coverage {
  if (insights.daysTracked >= 30 && insights.dataPoints >= 3) return "good";
  if (insights.daysTracked >= MIN_DAYS) return "some";
  if (insights.daysTracked >= 1 || insights.dataPoints >= 2) return "thin";
  return "none";
}

export function buildEvidence(input: {
  currentPrice: number;
  currency: string;
  originalPrice: number | null;
  inStock: boolean;
  firstSeen: string;
  shoppers: number;
  insights: Insights;
  offers: StoreOffer[];
}): Evidence {
  const { currentPrice, currency, originalPrice, offers } = input;
  const usable = offers.filter((o) => o.currency === currency && o.inStock && o.price > 0);

  const best = usable
    .filter((o) => o.match === "exact" && o.price < currentPrice)
    .sort((a, b) => a.price - b.price)[0];

  return {
    ...input,
    discountPct: originalPrice && originalPrice > currentPrice ? -percentChange(originalPrice, currentPrice) : null,
    coverage: coverageOf(input.insights),
    bestOffer: best ? { ...best, savingPct: -percentChange(currentPrice, best.price) } : null,
    similarOffers: usable.filter((o) => o.match === "similar"),
  };
}

export type Gate =
  /** Decided in code: an identical product is meaningfully cheaper elsewhere. */
  | { kind: "buy_elsewhere"; confidence: number }
  /** Not enough to say anything useful: show facts, don't call the model. */
  | { kind: "insufficient"; readyOn: string }
  /** Enough evidence for the model to explain a buy / wait / fair verdict. */
  | { kind: "analyse"; confidence: number };

/**
 * Decide what kind of verdict the evidence supports before any model call.
 * Confidence comes from how much data there is, never from the model.
 */
export function gateVerdict(e: Evidence): Gate {
  const offerBoost = e.bestOffer || e.similarOffers.length > 0 ? 0.1 : 0;

  if (e.bestOffer && e.bestOffer.savingPct >= ELSEWHERE_MIN_SAVING) {
    return { kind: "buy_elsewhere", confidence: Math.min(0.9, 0.75 + offerBoost) };
  }

  const hasOffers = e.bestOffer !== null || e.similarOffers.length > 0;
  if (e.insights.daysTracked < MIN_DAYS && !hasOffers) {
    return { kind: "insufficient", readyOn: new Date(new Date(e.firstSeen).getTime() + MIN_DAYS * DAY_MS).toISOString() };
  }

  const base = { good: 0.8, some: 0.6, thin: 0.45, none: 0.4 }[e.coverage];
  return { kind: "analyse", confidence: Math.min(0.9, base + offerBoost) };
}
