import { BadgePercent, ChevronRight, Package, PiggyBank, TrendingDown } from "lucide-react";
import type { DashboardStats } from "@/lib/data";
import { formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <Icon className={cn("size-4 shrink-0", tone === "success" ? "text-success" : "text-primary")} />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-xl font-bold sm:text-2xl", tone === "success" && "text-success")}>
        {value}
      </div>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Phones get one compact strip instead of four tiles, so the product list starts on the first screen. */
function StatsStrip({ stats, onShowDeals }: { stats: DashboardStats; onShowDeals?: () => void }) {
  const label = "flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground";
  return (
    <div className="grid grid-cols-[1.2fr_1fr_1fr] rounded-2xl border bg-card py-3 md:hidden">
      <div className="flex min-w-0 flex-col gap-0.5 px-3.5">
        <span className={label}>
          <PiggyBank className="size-3.5 text-success" /> Saved
        </span>
        <span className={cn("truncate text-[1.1875rem] font-bold tabular-nums", stats.totalSavings > 0 && "text-success")}>
          {formatPrice(stats.totalSavings, stats.currency)}
        </span>
      </div>
      <button
        type="button"
        onClick={onShowDeals}
        className="flex min-w-0 flex-col items-start gap-0.5 border-l px-3.5 text-left"
        aria-label={`${stats.greatDeals} great deals, show them`}
      >
        <span className={label}>
          <BadgePercent className="size-3.5 text-primary" /> Great deals
        </span>
        <span className="flex items-center gap-1 text-[1.1875rem] font-bold">
          {stats.greatDeals}
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-0.5 border-l px-3.5">
        <span className={label}>
          <TrendingDown className="size-3.5 text-success" /> Best drop
        </span>
        <span className={cn("text-[1.1875rem] font-bold", stats.biggestDrop && "text-success")}>
          {stats.biggestDrop ? formatPercent(stats.biggestDrop.percentChange, { signed: true }) : "—"}
        </span>
      </div>
    </div>
  );
}

export default function StatsRow({ stats, onShowDeals }: { stats: DashboardStats; onShowDeals?: () => void }) {
  return (
    <>
    <StatsStrip stats={stats} onShowDeals={onShowDeals} />
    <div className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-4">
      <Stat icon={Package} label="Tracking" value={String(stats.totalTracked)} hint={stats.totalTracked === 1 ? "product" : "products"} />
      <Stat
        icon={PiggyBank}
        label="Saved from drops"
        value={formatPrice(stats.totalSavings, stats.currency)}
        hint={`in ${stats.currency}`}
        tone={stats.totalSavings > 0 ? "success" : "default"}
      />
      <Stat
        icon={TrendingDown}
        label="Biggest drop"
        value={stats.biggestDrop ? formatPercent(stats.biggestDrop.percentChange, { signed: true }) : "—"}
        hint={stats.biggestDrop?.name ?? "No drops yet"}
        tone={stats.biggestDrop ? "success" : "default"}
      />
      <Stat
        icon={BadgePercent}
        label="Great deals now"
        value={String(stats.greatDeals)}
        hint="deal score 80+"
      />
    </div>
    </>
  );
}
