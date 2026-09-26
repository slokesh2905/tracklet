import { Minus, Sparkles, Trophy, TrendingDown, TrendingUp } from "lucide-react";
import type { ProductStatus } from "@/lib/data";
import type { Verdict } from "@/lib/database.types";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function ChangeBadge({ status, percentChange }: { status: ProductStatus; percentChange: number }) {
  if (status === "new") {
    return (
      <span className={cn(pill, "bg-chart-2/15 text-chart-2")}>
        <Sparkles className="size-3" /> New
      </span>
    );
  }
  if (status === "unchanged") {
    return (
      <span className={cn(pill, "bg-muted text-muted-foreground")}>
        <Minus className="size-3" /> No change
      </span>
    );
  }
  const down = status === "dropped";
  const Icon = down ? TrendingDown : TrendingUp;
  return (
    <span className={cn(pill, down ? "bg-success/12 text-success" : "bg-danger/12 text-danger")}>
      <Icon className="size-3" />
      {formatPercent(percentChange, { signed: true })}
    </span>
  );
}

export function DealBadge({ score, label }: { score: number; label: string }) {
  const tone =
    score >= 80
      ? "bg-success/12 text-success"
      : score >= 60
        ? "bg-chart-2/15 text-chart-2"
        : score >= 40
          ? "bg-muted text-muted-foreground"
          : "bg-danger/12 text-danger";
  return (
    <span className={cn(pill, tone)} title={`Deal score ${score}/100`}>
      {label} · {score}
    </span>
  );
}

export function AllTimeLowBadge() {
  return (
    <span className={cn(pill, "bg-primary/12 text-primary")}>
      <Trophy className="size-3" /> All-time low
    </span>
  );
}

export const VERDICT_COPY: Record<Verdict, { label: string; className: string }> = {
  buy_now: { label: "Buy now", className: "bg-success/12 text-success" },
  fair: { label: "Fair price", className: "bg-muted text-muted-foreground" },
  wait: { label: "Wait", className: "bg-danger/12 text-danger" },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const copy = VERDICT_COPY[verdict];
  return (
    <span className={cn(pill, copy.className)}>
      <Sparkles className="size-3" /> AI: {copy.label}
    </span>
  );
}
