import { DAY_MS } from "@/lib/format";

/**
 * Firecrawl's free plan grants a fixed number of credits per period and has no
 * card on file, so running out just pauses scraping. Tracklet still budgets:
 * daily price checks come first; cross-store comparisons only use the surplus.
 */

/** Worst-case credits for one comparison: a search (2 credits minimum) + up to 3 Firecrawl page reads. */
export const COMPARE_COST = 5;
/** Credits never spent on optional work, as a safety margin. */
export const SAFETY_FLOOR = 50;

export type BudgetInput = {
  remainingCredits: number;
  periodEnd: string | Date;
  /** Catalog items the daily check will visit (each may need 1 Firecrawl credit). */
  activeItems: number;
  now?: number;
};

/** Credits that can go to optional work without endangering daily checks this period. */
export function spareCredits({ remainingCredits, periodEnd, activeItems, now = Date.now() }: BudgetInput) {
  const daysLeft = Math.max(1, Math.ceil((new Date(periodEnd).getTime() - now) / DAY_MS));
  const reserve = activeItems * daysLeft + SAFETY_FLOOR;
  return Math.max(0, remainingCredits - reserve);
}

export function canAffordComparison(input: BudgetInput) {
  return spareCredits(input) >= COMPARE_COST;
}
