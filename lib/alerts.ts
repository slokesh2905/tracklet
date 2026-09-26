import type { AlertKind } from "@/lib/database.types";
import { percentChange } from "@/lib/format";

export type AlertInput = {
  oldPrice: number;
  newPrice: number;
  wasInStock: boolean;
  inStock: boolean;
  targetPrice: number | null;
  alertPct: number | null;
  /** Lowest price seen before this check (null if no history). */
  previousLow: number | null;
};

export const ALERT_COPY: Record<AlertKind, { title: string; emoji: string }> = {
  target_reached: { title: "Target price reached", emoji: "🎯" },
  back_in_stock: { title: "Back in stock", emoji: "📦" },
  all_time_low: { title: "New all-time low", emoji: "🏆" },
  price_drop: { title: "Price drop", emoji: "📉" },
};

/**
 * Decide which single alert (if any) a price check should trigger. Only the most
 * important kind is returned, so a user never gets three emails for one change.
 *
 * Rules:
 * - target_reached fires when the price *crosses* the target, not on every check below it.
 * - With an alert_pct rule, drops smaller than that are ignored.
 * - With only a target set, generic drops are ignored (the user asked for a number).
 * - With no rules, any drop alerts (the original behaviour).
 * - Out-of-stock prices never trigger price alerts.
 */
export function evaluateAlert(input: AlertInput): AlertKind | null {
  const { oldPrice, newPrice, wasInStock, inStock, targetPrice, alertPct, previousLow } = input;

  if (!inStock) return null;

  if (targetPrice !== null && newPrice <= targetPrice && (oldPrice > targetPrice || !wasInStock)) {
    return "target_reached";
  }

  if (!wasInStock) return "back_in_stock";

  if (newPrice >= oldPrice) return null;

  const dropPct = -percentChange(oldPrice, newPrice);
  const passesRule =
    alertPct !== null ? dropPct >= alertPct : targetPrice === null;

  if (!passesRule) return null;

  if (previousLow !== null && newPrice < previousLow) {
    return "all_time_low";
  }

  return "price_drop";
}
