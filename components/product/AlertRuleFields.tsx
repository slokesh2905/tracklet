"use client";

import { useState } from "react";
import AlertStepper, { type AlertMode, type PriceRange } from "@/components/product/AlertStepper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";

/** The alert being edited: a price target or a percent drop, kept as the strings the inputs hold. */
export function useAlertRule({
  currentPrice,
  targetPrice = null,
  alertPct = null,
}: {
  currentPrice: number;
  targetPrice?: number | null;
  alertPct?: number | null;
}) {
  const [target, setTarget] = useState(targetPrice?.toString() ?? "");
  const [pct, setPct] = useState(alertPct?.toString() ?? "");
  const [mode, setMode] = useState<AlertMode>(alertPct !== null && targetPrice === null ? "pct" : "price");

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

  return {
    target,
    pct,
    mode,
    setTarget,
    setPct,
    changeMode,
    clear: () => {
      setTarget("");
      setPct("");
    },
    hasRule: Boolean(target || pct),
  };
}

export type AlertRule = ReturnType<typeof useAlertRule>;

type Props = {
  /** Keeps the desktop inputs' ids unique when several forms are on one page. */
  idPrefix: string;
  currency: string;
  currentPrice: number;
  /** Price history range, used to draw the phone's price scale. */
  range?: PriceRange | null;
  rule: AlertRule;
};

/** The phone's stepper and the desktop's number inputs, both editing the same rule. */
export default function AlertRuleFields({ idPrefix, currency, currentPrice, range, rule }: Props) {
  const { target, pct, mode, setTarget, setPct, changeMode } = rule;
  const suggestions = [5, 10, 20].map((off) => Math.floor(currentPrice * (1 - off / 100)));
  const stepperValue = mode === "price" ? (target ? Number(target) : null) : pct ? Number(pct) : null;

  return (
    <>
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
        <Label htmlFor={`target-${idPrefix}`}>Alert me when the price is at or below</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            {currency}
          </span>
          <Input
            id={`target-${idPrefix}`}
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
        <Label htmlFor={`pct-${idPrefix}`}>…or when it drops by at least</Label>
        <div className="relative">
          <Input
            id={`pct-${idPrefix}`}
            inputMode="numeric"
            placeholder="e.g. 10"
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
            className="pr-8"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-xs text-muted-foreground">Leave both empty to be alerted on every price drop.</p>
      </div>
    </>
  );
}
