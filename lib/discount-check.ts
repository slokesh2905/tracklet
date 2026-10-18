import { DAY_MS } from "@/lib/format";
import { coveredMs, toSteps, windowStats, type PricePoint, type Step } from "@/lib/insights";

/** Under this many tracked days there is nothing to compare the list price against. */
const MIN_DAYS_TO_JUDGE = 7;
/** From this many tracked days "never charged" is a firm statement rather than "so far". */
const FIRM_DAYS = 30;
/** A price within this fraction of the list price counts as "the list price was charged". */
const LIST_REACHED = 0.95;
/** A pre-sale hike: the price rose at least this much … */
const HIKE_RISE = 1.15;
/** … within this window before the drop … */
const HIKE_WINDOW_DAYS = 21;
/** … and the drop landed back within this much of the pre-hike price. */
const HIKE_RETURN = 1.05;
/** Only a drop this recent is "the current sale". */
const SALE_RECENT_DAYS = 30;

export type DiscountCheck =
  /** No list price to check (or none above the price): nothing to say. */
  | { status: "none" }
  /** Too little history to judge the list price. */
  | { status: "unknown"; daysTracked: number }
  /** The price has been at or near the list price while we watched. */
  | { status: "verified"; daysTracked: number }
  /** The list price was never charged while we watched. `firm` once the window is long enough. */
  | { status: "unverified"; daysTracked: number; highestSeen: number; firm: boolean }
  /** The price was raised shortly before the current drop and fell back to where it started. */
  | { status: "inflated"; from: number; peak: number; daysAgo: number };

/** True when the shown discount should carry a warning. */
export function isDiscountFlagged(check: DiscountCheck): boolean {
  return check.status === "unverified" || check.status === "inflated";
}

/**
 * The most recent price rise that was undone by the latest drop, if the drop is recent. The history
 * is a step function checked about once a day, so a hike shorter than a day is invisible here.
 */
function findHike(steps: Step[], now: number) {
  let drop = -1;
  for (let i = steps.length - 1; i > 0; i--) {
    if (steps[i]!.price < steps[i - 1]!.price) {
      drop = i;
      break;
    }
  }
  const sale = steps[drop];
  if (!sale || now - sale.t > SALE_RECENT_DAYS * DAY_MS) return null;

  for (let r = drop - 1; r > 0 && sale.t - steps[r]!.t <= HIKE_WINDOW_DAYS * DAY_MS; r--) {
    const before = steps[r - 1]!.price;
    if (steps[r]!.price >= before * HIKE_RISE && sale.price <= before * HIKE_RETURN) {
      const peak = Math.max(...steps.slice(r, drop).map((s) => s.price));
      return { from: before, peak, daysAgo: Math.floor((now - sale.t) / DAY_MS) };
    }
  }
  return null;
}

/**
 * Was the crossed-out list price ever really charged, and was the price raised just before the sale?
 * The list price is only a snapshot (we don't store its history), so every claim is relative to the
 * window we tracked, never to the product's whole life.
 */
export function checkDiscount(input: {
  history: PricePoint[];
  currentPrice: number;
  originalPrice: number | null;
  now?: number;
}): DiscountCheck {
  const { history, currentPrice, originalPrice, now = Date.now() } = input;
  const steps = toSteps(history, currentPrice, now);

  // Archived sightings are too sparse to time a hike, but they do show what was charged.
  const hike = findHike(steps.filter((s) => !s.archived), now);
  if (hike) return { status: "inflated", ...hike };

  if (!originalPrice || originalPrice <= currentPrice) return { status: "none" };

  const daysTracked = Math.max(0, Math.floor(coveredMs(steps, now) / DAY_MS));
  if (daysTracked < MIN_DAYS_TO_JUDGE) return { status: "unknown", daysTracked };

  const { high } = windowStats(steps, now);
  if (high >= originalPrice * LIST_REACHED) return { status: "verified", daysTracked };
  return { status: "unverified", daysTracked, highestSeen: high, firm: daysTracked >= FIRM_DAYS };
}
