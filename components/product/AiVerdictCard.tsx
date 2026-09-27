"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateVerdict } from "@/app/actions/products";
import { VERDICT_COPY } from "@/components/product/Badges";
import { Button } from "@/components/ui/button";
import type { ProductInsightRow } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  verdict: ProductInsightRow | null;
  stale: ProductInsightRow | null;
  enabled: boolean;
};

export default function AiVerdictCard({ productId, verdict, stale, enabled }: Props) {
  const [pending, startTransition] = useTransition();
  const shown = verdict ?? stale;
  const reasons = Array.isArray(shown?.reasons) ? (shown.reasons as string[]) : [];

  function run() {
    startTransition(async () => {
      const result = await generateVerdict(productId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" /> Should I buy now?
        </h2>
        {shown && enabled && (
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
          {!verdict && <p className="mt-3 text-xs text-muted-foreground">The price changed since this was written. Refresh for an updated take.</p>}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-muted-foreground">
            Get a plain-English verdict based on this product’s price history, deal score and trend.
          </p>
          <Button onClick={run} disabled={pending || !enabled} className="mt-3 w-full gap-2 sm:w-auto">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {enabled ? "Analyse this price" : "AI not configured"}
          </Button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">AI-generated from price data only. Not financial advice.</p>
    </div>
  );
}
