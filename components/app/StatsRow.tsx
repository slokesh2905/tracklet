import { BadgePercent, Package, PiggyBank, TrendingDown } from "lucide-react";
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
      <div className={cn("text-xl font-bold tracking-tight sm:text-2xl", tone === "success" && "text-success")}>
        {value}
      </div>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function StatsRow({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
  );
}
