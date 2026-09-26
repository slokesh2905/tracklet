"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAlertRules } from "@/app/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";

type Props = {
  productId: string;
  currency: string;
  currentPrice: number;
  targetPrice: number | null;
  alertPct: number | null;
  onSaved?: () => void;
};

export default function AlertRulesForm({
  productId,
  currency,
  currentPrice,
  targetPrice,
  alertPct,
  onSaved,
}: Props) {
  const [target, setTarget] = useState(targetPrice?.toString() ?? "");
  const [pct, setPct] = useState(alertPct?.toString() ?? "");
  const [pending, startTransition] = useTransition();

  const suggestions = [5, 10, 20].map((off) => Math.floor(currentPrice * (1 - off / 100)));

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateAlertRules({ productId, targetPrice: target, alertPct: pct });
      if (result.ok) {
        toast.success(result.message);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`target-${productId}`}>Alert me when the price is at or below</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            {currency}
          </span>
          <Input
            id={`target-${productId}`}
            inputMode="decimal"
            placeholder={`e.g. ${suggestions[1]}`}
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
            className="pl-14"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setTarget(String(s))}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:py-2"
            >
              −{[5, 10, 20][i]}% · {formatPrice(s, currency)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`pct-${productId}`}>…or when it drops by at least</Label>
        <div className="relative">
          <Input
            id={`pct-${productId}`}
            inputMode="numeric"
            placeholder="e.g. 10"
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
            className="pr-8"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave both empty to be alerted on every price drop.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {(target || pct) && (
          <Button type="button" variant="ghost" onClick={() => { setTarget(""); setPct(""); }}>
            Clear rules
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save alert
        </Button>
      </div>
    </form>
  );
}
