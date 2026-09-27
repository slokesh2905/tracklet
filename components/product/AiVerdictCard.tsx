"use client";

import { useTransition } from "react";
import { CalendarClock, Loader2, RefreshCw, Sparkles, Tag, Users } from "lucide-react";
import { toast } from "sonner";
import { generateVerdict } from "@/app/actions/products";
import { VERDICT_COPY } from "@/components/product/Badges";
import CompareStoresButton from "@/components/product/CompareStoresButton";
import { Button } from "@/components/ui/button";
import type { ItemInsightRow } from "@/lib/db/schema";
import type { Gate } from "@/lib/evidence";
import { formatDate, formatPrice, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Facts = {
  currency: string;
  originalPrice: number | null;
  discountPct: number | null;
  daysTracked: number;
  shoppers: number;
  firstSeen: string;
};

type Props = {
  productId: string;
  verdict: ItemInsightRow | null;
  stale: ItemInsightRow | null;
  aiEnabled: boolean;
  gate: Gate;
  facts: Facts;
};

function Fact({ icon: Icon, children }: { icon: typeof Tag; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>{children}</span>
    </li>
  );
}

export default function AiVerdictCard({ productId, verdict, stale, aiEnabled, gate, facts }: Props) {
  const [pending, startTransition] = useTransition();
  const shown = verdict ?? stale;
  const reasons = Array.isArray(shown?.reasons) ? (shown.reasons as string[]) : [];

  function run() {
    startTransition(async () => {
      const result = await generateVerdict(productId);
      if (!result.ok) toast.error(result.error);
    });
  }

  // Not enough evidence for a meaningful verdict: show facts, not a guess.
  if (gate.kind === "insufficient") {
    return (
      <div className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" /> Should I buy now?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It&apos;s too early to judge this price from its history. Here&apos;s what we know:
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {facts.discountPct !== null && facts.originalPrice !== null && (
            <Fact icon={Tag}>
              <span className="font-medium">{facts.discountPct.toFixed(0)}% off</span> the MRP of{" "}
              {formatPrice(facts.originalPrice, facts.currency)}
            </Fact>
          )}
          <Fact icon={Users}>
            Price watched since {formatDate(facts.firstSeen, { year: false })}
            {facts.shoppers > 1 ? ` by ${facts.shoppers} shoppers` : ""}
          </Fact>
          <Fact icon={CalendarClock}>A trend-based verdict unlocks around {formatDate(gate.readyOn, { year: false })}</Fact>
        </ul>
        <CompareStoresButton productId={productId} label="Compare other stores now" className="mt-4 w-full gap-2 sm:w-auto" />
        <p className="mt-3 text-[11px] text-muted-foreground">Comparing checks whether the same item is cheaper elsewhere.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" /> Should I buy now?
        </h2>
        {shown && aiEnabled && (
          <Button variant="ghost" size="sm" onClick={run} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </Button>
        )}
      </div>

      {shown ? (
        <div className={cn("mt-3", !verdict && "opacity-70")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-sm font-semibold", VERDICT_COPY[shown.verdict].className)}>
              {VERDICT_COPY[shown.verdict].label}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(Number(shown.confidence) * 100)}% confidence ·{" "}
              <span suppressHydrationWarning>{timeAgo(shown.generated_at)}</span>
            </span>
          </div>
          <p className="mt-3 text-sm">{shown.summary}</p>
          {reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {!verdict && (
            <p className="mt-3 text-xs text-muted-foreground">The price changed since this was written. Refresh for an updated take.</p>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-muted-foreground">
            {gate.kind === "buy_elsewhere"
              ? "The same item looks cheaper at another store. Get a plain-English summary."
              : "Get a plain-English verdict based on this product's price history, MRP and other stores."}
          </p>
          <Button onClick={run} disabled={pending || !aiEnabled} className="mt-3 w-full gap-2 sm:w-auto">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {pending ? "Analysing…" : "Analyse this price"}
          </Button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">AI-generated from price data only. Not financial advice.</p>
    </div>
  );
}
