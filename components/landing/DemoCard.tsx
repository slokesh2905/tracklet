import { BellRing, Sparkles } from "lucide-react";
import { AllTimeLowBadge, DealBadge } from "@/components/product/Badges";
import PriceChart, { type ChartPoint } from "@/components/product/PriceChart";
import { formatPrice } from "@/lib/format";

/** A static showcase of what a tracked product looks like, with realistic sample data. */
export default function DemoCard({ history }: { history: ChartPoint[] }) {
  const current = history.at(-1)!.price;

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-linear-to-tr from-primary/25 via-primary/5 to-transparent blur-2xl" aria-hidden="true" />
      <div className="rounded-2xl border bg-card p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">amazon.in · Headphones</p>
            <p className="truncate font-semibold">Sony WH-1000XM5 Wireless Headphones</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{formatPrice(current, "INR")}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">
            <BellRing className="size-3" /> Target hit
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <AllTimeLowBadge />
          <DealBadge score={96} label="Great deal" />
        </div>
        <PriceChart
          history={history}
          currentPrice={current}
          currency="INR"
          targetPrice={24000}
          height={180}
          showRanges={false}
          className="mt-4"
        />
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            <span className="font-medium">Buy now.</span>{" "}
            <span className="text-muted-foreground">It’s 21% under its 90-day average and the lowest price in 4 months.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
