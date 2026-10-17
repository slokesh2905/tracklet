"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAlertRules } from "@/app/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AlertStepper, { type AlertMode, type PriceRange } from "@/components/product/AlertStepper";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";

type Props = {
  productId: string;
  currency: string;
  currentPrice: number;
  targetPrice: number | null;
  alertPct: number | null;
  /** Price history range, used to draw the phone's price scale. */
  range?: PriceRange | null;
  onSaved?: () => void;
};

export default function AlertRulesForm({
  productId,
  currency,
  currentPrice,
  targetPrice,
  alertPct,
  range,
  onSaved,
}: Props) {
  const [target, setTarget] = useState(targetPrice?.toString() ?? "");
  const [pct, setPct] = useState(alertPct?.toString() ?? "");
  const [mode, setMode] = useState<AlertMode>(alertPct !== null && targetPrice === null ? "pct" : "price");
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

  // The phone stepper edits one rule at a time; switching type drops the other so it can't linger unseen.
  function changeMode(next: AlertMode) {
    setMode(next);
    if (next === "price") {
      setPct("");
      setTarget((t) => t || String(Math.floor(currentPrice * 0.9)));
    } else {
      setTarget("");
      setPct((p) => p || "10");
    }
  }

  const stepperValue = mode === "price" ? (target ? Number(target) : null) : pct ? Number(pct) : null;

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <AlertStepper
        currency={currency}
        currentPrice={currentPrice}
        range={range}
        mode={mode}
        onModeChange={changeMode}
        value={stepperValue}
        onChange={(v) => (mode === "price" ? setTarget(String(v)) : setPct(String(v)))}
      />

      <div className="flex flex-col gap-2 max-md:hidden">
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
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:py-2"
            >
              −{[5, 10, 20][i]}% · {formatPrice(s, currency)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 max-md:hidden">
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

      <div className="flex gap-2.5 sm:justify-end">
        {(target || pct) && (
          <Button type="button" variant="outline" className="text-danger hover:text-danger max-md:h-12" onClick={() => { setTarget(""); setPct(""); }}>
            Clear<span className="max-md:hidden">&nbsp;rules</span>
          </Button>
        )}
        <Button type="submit" disabled={pending} className="max-md:h-12 max-md:flex-1 max-md:text-base">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save alert
        </Button>
      </div>
    </form>
  );
}
