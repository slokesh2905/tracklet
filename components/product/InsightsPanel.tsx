import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatCompactPrice, formatPercent, formatPrice } from "@/lib/format";
import type { Insights } from "@/lib/insights";
import { cn } from "@/lib/utils";

function Cell({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/50 p-3 max-md:rounded-[0.625rem] max-md:bg-muted/70 max-md:px-3 max-md:py-2.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-semibold tabular-nums max-md:text-[0.9375rem]">{value}</span>
      {sub && <span className="truncate text-xs text-muted-foreground max-md:hidden">{sub}</span>}
    </div>
  );
}

export default function InsightsPanel({
  insights: i,
  currency,
  currentPrice,
}: {
  insights: Insights;
  currency: string;
  currentPrice: number;
}) {
  const p = (n: number) => formatPrice(n, currency);
  const TrendIcon = i.trend === "down" ? TrendingDown : i.trend === "up" ? TrendingUp : Minus;
  const scoreColor =
    i.dealScore >= 80 ? "bg-success" : i.dealScore >= 60 ? "bg-chart-2" : i.dealScore >= 40 ? "bg-muted-foreground" : "bg-danger";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          {/* The section's heading on a phone, where the "Insights" title is hidden. */}
          <h3 className="text-sm font-medium max-md:text-[0.9375rem] max-md:font-semibold">Deal score</h3>
          <span className="text-sm text-muted-foreground">
            <span className="text-lg font-bold text-foreground tabular-nums">{i.dealScore}</span>/100 · {i.dealLabel}
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={i.dealScore}
          aria-label="Deal score"
        >
          <div className={cn("h-full rounded-full", scoreColor)} style={{ width: `${Math.max(i.dealScore, 3)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground max-md:hidden">
          Where today’s price sits between the highest and lowest it has been, weighted to the last 90 days.
        </p>
      </div>

      {/* A phone keeps the four cells the design shows; the low is already in the header badges. */}
      <div className="grid grid-cols-2 gap-2 max-md:-mt-1 sm:grid-cols-3">
        <Cell
          className="max-md:hidden"
          label="All-time low"
          value={p(i.allTime.low)}
          sub={i.isAllTimeLow ? "That’s today" : formatPercent(((currentPrice - i.allTime.low) / i.allTime.low) * 100, { signed: true }) + " vs now"}
        />
        <Cell label="All-time high" value={p(i.allTime.high)} />
        <Cell
          label={
            <>
              Average<span className="max-md:hidden"> (time-weighted)</span>
            </>
          }
          value={p(i.allTime.average)}
        />
        <Cell className="max-md:hidden" label="30-day range" value={`${p(i.last30.low)} – ${p(i.last30.high)}`} />
        <Cell
          label="90-day range"
          value={
            <>
              <span className="max-md:hidden">{`${p(i.last90.low)} – ${p(i.last90.high)}`}</span>
              <span className="md:hidden">{`${formatCompactPrice(i.last90.low, currency)}–${formatCompactPrice(i.last90.high, currency).replace(/^[^\d]+/, "")}`}</span>
            </>
          }
        />
        <Cell
          label="90-day trend"
          value={
            <span
              className={cn(
                "flex items-center gap-1",
                i.trend === "down" ? "text-success" : i.trend === "up" ? "text-danger" : "text-foreground"
              )}
            >
              <TrendIcon className="size-4" />
              {i.trend === "flat" ? "Flat" : `${formatPercent(i.trendPctPerWeek, { signed: true })}/wk`}
            </span>
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Based on {i.dataPoints} price {i.dataPoints === 1 ? "point" : "changes"} over {i.daysTracked} day{i.daysTracked === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
