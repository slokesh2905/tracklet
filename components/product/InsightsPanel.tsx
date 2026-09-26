import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatPercent, formatPrice } from "@/lib/format";
import type { Insights } from "@/lib/insights";
import { cn } from "@/lib/utils";

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-semibold tabular-nums">{value}</span>
      {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
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
          <span className="text-sm font-medium">Deal score</span>
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
        <p className="mt-2 text-xs text-muted-foreground">
          Where today’s price sits between the highest and lowest it has been, weighted to the last 90 days.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="All-time low" value={p(i.allTime.low)} sub={i.isAllTimeLow ? "That’s today" : formatPercent(((currentPrice - i.allTime.low) / i.allTime.low) * 100, { signed: true }) + " vs now"} />
        <Cell label="All-time high" value={p(i.allTime.high)} />
        <Cell label="Average (time-weighted)" value={p(i.allTime.average)} />
        <Cell label="30-day range" value={`${p(i.last30.low)} – ${p(i.last30.high)}`} />
        <Cell label="90-day range" value={`${p(i.last90.low)} – ${p(i.last90.high)}`} />
        <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
          <span className="text-xs text-muted-foreground">90-day trend</span>
          <span
            className={cn(
              "flex items-center gap-1 font-semibold",
              i.trend === "down" ? "text-success" : i.trend === "up" ? "text-danger" : "text-foreground"
            )}
          >
            <TrendIcon className="size-4" />
            {i.trend === "flat" ? "Flat" : `${formatPercent(i.trendPctPerWeek, { signed: true })}/wk`}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Based on {i.dataPoints} price {i.dataPoints === 1 ? "point" : "changes"} over {i.daysTracked} day{i.daysTracked === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
