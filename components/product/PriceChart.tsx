"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DAY_MS, formatDate, formatPercent, formatPrice, percentChange } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChartPoint = { price: number; checked_at: string };

const RANGES = [
  { value: "7", label: "7D", days: 7 },
  { value: "30", label: "30D", days: 30 },
  { value: "90", label: "90D", days: 90 },
  { value: "all", label: "All", days: Infinity },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

type Props = {
  history: ChartPoint[];
  currentPrice: number;
  currency: string;
  targetPrice?: number | null;
  lowestPrice?: number | null;
  height?: number;
  showRanges?: boolean;
  className?: string;
};

/**
 * Prices are a step function (a price holds until it changes), so the chart uses
 * stepAfter and extends the last price to "now" instead of drawing slopes between checks.
 */
export default function PriceChart({
  history,
  currentPrice,
  currency,
  targetPrice,
  lowestPrice,
  height = 260,
  showRanges = true,
  className,
}: Props) {
  const [range, setRange] = useState<RangeValue>("all");
  const [now] = useState(() => Date.now());

  const data = useMemo(() => {
    const points = history
      .map((p) => ({ t: new Date(p.checked_at).getTime(), price: Number(p.price) }))
      .sort((a, b) => a.t - b.t);
    if (points.length === 0 || points.at(-1)!.price !== currentPrice) {
      points.push({ t: now, price: currentPrice });
    }

    const days = RANGES.find((r) => r.value === range)!.days;
    const since = Number.isFinite(days) ? now - days * DAY_MS : -Infinity;
    const inside = points.filter((p) => p.t >= since);
    const before = points.filter((p) => p.t < since).at(-1);
    const clipped = before ? [{ t: since, price: before.price }, ...inside] : inside;
    // Extend to today so a flat recent price is visible.
    const last = clipped.at(-1)!;
    return last.t < now ? [...clipped, { t: now, price: last.price }] : clipped;
  }, [history, currentPrice, range, now]);

  const first = data[0]?.price ?? currentPrice;
  const prices = data.map((d) => d.price);
  const refs = [targetPrice, lowestPrice].filter((v): v is number => typeof v === "number");
  const min = Math.min(...prices, ...refs);
  const max = Math.max(...prices, ...refs);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;

  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <div className={cn("w-full", className)}>
      {showRanges && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {data.length > 1 ? (
              <>
                <span className={cn("font-medium", currentPrice < first ? "text-success" : currentPrice > first ? "text-danger" : "text-foreground")}>
                  {formatPercent(percentChange(first, currentPrice), { signed: true })}
                </span>{" "}
                in this range
              </>
            ) : (
              "Not enough history yet"
            )}
          </p>
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeValue)}>
            <TabsList className="h-8 pointer-coarse:h-10">
              {RANGES.map((r) => (
                <TabsTrigger key={r.value} value={r.value} className="px-2.5 text-xs">
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => formatDate(new Date(t), { year: false })}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={36}
            />
            <YAxis
              domain={[Math.max(0, min - pad), max + pad]}
              tickFormatter={(v: number) => compact.format(v)}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as { t: number; price: number } | undefined;
                if (!active || !point) return null;
                const change = percentChange(first, point.price);
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="text-muted-foreground">{formatDate(new Date(point.t))}</p>
                    <p className="mt-0.5 text-sm font-semibold text-popover-foreground">
                      {formatPrice(point.price, currency)}
                    </p>
                    {change !== 0 && (
                      <p className={change < 0 ? "text-success" : "text-danger"}>
                        {formatPercent(change, { signed: true })} vs range start
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {typeof lowestPrice === "number" && (
              <ReferenceLine
                y={lowestPrice}
                stroke="var(--color-success)"
                strokeDasharray="4 4"
                label={{ value: "Low", position: "insideBottomLeft", fontSize: 10, fill: "var(--color-success)" }}
              />
            )}
            {typeof targetPrice === "number" && (
              <ReferenceLine
                y={targetPrice}
                stroke="var(--color-chart-2)"
                strokeDasharray="4 4"
                label={{ value: "Target", position: "insideTopLeft", fontSize: 10, fill: "var(--color-chart-2)" }}
              />
            )}
            <Area
              type="stepAfter"
              dataKey="price"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#priceFill)"
              activeDot={{ r: 5, strokeWidth: 0, fill: "var(--color-primary)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
