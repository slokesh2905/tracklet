import { DAY_MS, percentChange } from "@/lib/format";

export type PricePoint = {
  price: number;
  checked_at: string;
  /** The price was unknown from here until checked_at (nobody was checking the item). */
  gap_from?: string | null;
  source?: string | null;
};

/** History columns every consumer of these helpers should load. */
export const HISTORY_COLUMNS = { price: true, checked_at: true, gap_from: true, source: true } as const;

/** Archived snapshots are single sightings from before we tracked the item, not a continuous record. */
export const isArchived = (p: Pick<PricePoint, "source">) => p.source === "archive";

/** Readings we took ourselves, for anything that measures "since we started tracking". */
export const liveHistory = <T extends Pick<PricePoint, "source">>(history: T[]) => history.filter((p) => !isArchived(p));

/** When we first read the price ourselves (history sorted oldest first). */
export const firstSeenAt = (history: Pick<PricePoint, "source" | "checked_at">[], fallback: string) =>
  history.find((p) => !isArchived(p))?.checked_at ?? fallback;

export type WindowStats = {
  low: number;
  high: number;
  /** Time-weighted: a price that held for 20 days counts more than one that held for 1. */
  average: number;
};

export type TrendDirection = "down" | "up" | "flat";

export type DealLabel = "Great deal" | "Good price" | "Fair price" | "Pricey";

export type Insights = {
  allTime: WindowStats;
  last30: WindowStats;
  last90: WindowStats;
  isAllTimeLow: boolean;
  changeFromFirst: number;
  /** Regression slope over the last 90 days, as % of average price per week. */
  trendPctPerWeek: number;
  trend: TrendDirection;
  /** 0 (most expensive it has been) … 100 (cheapest it has been). */
  dealScore: number;
  dealLabel: DealLabel;
  daysTracked: number;
  dataPoints: number;
};

export type Step = {
  price: number;
  t: number;
  /** The price is known only up to here, not up to the next step (a gap, or an archived sighting). */
  until?: number;
  archived?: boolean;
};

/**
 * History only stores a row when the price changes, so it is a step function:
 * each price holds until the next point. Normalise it (sorted, current price
 * appended if it differs) before any maths. Two things cut a step short: a gap
 * (the next reading says nobody checked in between) and an archived snapshot,
 * which only tells us the price at that moment.
 */
export function toSteps(history: PricePoint[], currentPrice: number, now: number): Step[] {
  const points = history
    .map((p) => ({
      price: Number(p.price),
      t: new Date(p.checked_at).getTime(),
      gapFrom: p.gap_from ? new Date(p.gap_from).getTime() : null,
      archived: isArchived(p),
    }))
    .filter((p) => Number.isFinite(p.price) && Number.isFinite(p.t) && p.t <= now)
    .sort((a, b) => a.t - b.t);

  const steps: Step[] = points.map((p, i) => {
    const step: Step = { price: p.price, t: p.t };
    const nextGap = points[i + 1]?.gapFrom;
    if (p.archived) {
      step.archived = true;
      step.until = p.t;
    } else if (nextGap != null && Number.isFinite(nextGap)) {
      step.until = Math.max(p.t, Math.min(nextGap, points[i + 1]!.t));
    }
    return step;
  });

  const last = steps.at(-1);
  if (!last || last.price !== currentPrice || last.until !== undefined) {
    steps.push({ price: currentPrice, t: now });
  }
  return steps;
}

/** When step `i` stops counting: the next step, its own cut-off, or now. */
const stepEnd = (steps: Step[], i: number, now: number) => Math.min(steps[i + 1]?.t ?? now, steps[i]!.until ?? Infinity);

/** Steps clipped to [since, now], including the price that was in effect at `since` (if it was known then). */
export function clip(steps: Step[], since: number): Step[] {
  const inside = steps.filter((s) => s.t >= since);
  const before = steps.filter((s) => s.t < since).at(-1);
  const known = before && (before.until === undefined || before.until > since);
  return known ? [{ ...before, t: since }, ...inside] : inside;
}

/** Time the history actually covers (gaps and archived sightings excluded). */
export function coveredMs(steps: Step[], now: number) {
  return steps.reduce((sum, _, i) => sum + Math.max(stepEnd(steps, i, now) - steps[i]!.t, 0), 0);
}

export function windowStats(steps: Step[], now: number): WindowStats {
  const prices = steps.map((s) => s.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  let weighted = 0;
  let total = 0;
  steps.forEach((s, i) => {
    const duration = Math.max(stepEnd(steps, i, now) - s.t, 0);
    weighted += s.price * duration;
    total += duration;
  });

  const average = total > 0 ? weighted / total : prices.reduce((a, b) => a + b, 0) / prices.length;
  return { low, high, average };
}

/** Least-squares slope of daily samples of the step function (price units per day); unknown days are skipped. */
export function dailySlope(steps: Step[], now: number): number {
  const live = steps.filter((s) => !s.archived);
  const first = live[0];
  if (!first) return 0;
  const days = Math.floor((now - first.t) / DAY_MS);
  if (days < 2) return 0;

  const samples: Array<[number, number]> = [];
  let idx = 0;
  for (let d = 0; d <= days; d++) {
    const t = first.t + d * DAY_MS;
    while (idx + 1 < live.length && live[idx + 1]!.t <= t) idx++;
    const step = live[idx]!;
    if (step.until !== undefined && t > step.until) continue;
    samples.push([d, step.price]);
  }
  if (samples.length < 3) return 0;

  const n = samples.length;
  const meanX = samples.reduce((a, [x]) => a + x, 0) / n;
  const meanY = samples.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of samples) {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Where `price` sits in [low, high]: 1 at the low, 0 at the high, 0.5 if flat. */
function position(price: number, { low, high }: WindowStats) {
  if (high === low) return 0.5;
  return Math.min(1, Math.max(0, (high - price) / (high - low)));
}

export function dealLabel(score: number): DealLabel {
  if (score >= 80) return "Great deal";
  if (score >= 60) return "Good price";
  if (score >= 40) return "Fair price";
  return "Pricey";
}

export function computeInsights(
  history: PricePoint[],
  currentPrice: number,
  now = Date.now()
): Insights {
  const steps = toSteps(history, currentPrice, now);
  // "Since we started tracking" figures ignore archived sightings from before then.
  const firstStep = steps.find((s) => !s.archived)!;

  const allTime = windowStats(steps, now);
  const last30 = windowStats(clip(steps, now - 30 * DAY_MS), now);
  const window90 = clip(steps, now - 90 * DAY_MS);
  const last90 = windowStats(window90, now);

  const slope = dailySlope(window90, now);
  const trendPctPerWeek = last90.average > 0 ? ((slope * 7) / last90.average) * 100 : 0;
  const trend: TrendDirection =
    Math.abs(trendPctPerWeek) < 0.5 ? "flat" : trendPctPerWeek < 0 ? "down" : "up";

  // Recent range matters most; all-time range keeps a short spike from inflating the score.
  const hasRange = allTime.high > allTime.low;
  const dealScore = hasRange
    ? Math.round(100 * (0.7 * position(currentPrice, last90) + 0.3 * position(currentPrice, allTime)))
    : 50;

  return {
    allTime,
    last30,
    last90,
    isAllTimeLow: hasRange && currentPrice <= allTime.low,
    changeFromFirst: percentChange(firstStep.price, currentPrice),
    trendPctPerWeek,
    trend,
    dealScore,
    dealLabel: dealLabel(dealScore),
    daysTracked: Math.max(0, Math.floor(coveredMs(steps, now) / DAY_MS)),
    dataPoints: steps.length,
  };
}
