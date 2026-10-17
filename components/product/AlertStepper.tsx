"use client";

import { useRef } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { formatCompactPrice, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AlertMode = "price" | "pct";

export type PriceRange = { low: number; high: number; average: number };

/** A price worth offering as a one-tap target, like a cheaper store's. */
export type PriceSuggestion = { label: string; price: number };

type Props = {
  currency: string;
  currentPrice: number;
  range?: PriceRange | null;
  mode: AlertMode;
  onModeChange: (mode: AlertMode) => void;
  /** Target price when mode is "price", drop percent when mode is "pct". */
  value: number | null;
  onChange: (value: number) => void;
  /** An extra target chip, e.g. "Croma price · ₹22,490". */
  suggestion?: PriceSuggestion | null;
};

/** A step that's a round number for the price: ₹500 on a ₹23k item, ₹1 on a $9 one. */
function stepFor(price: number) {
  if (price >= 20000) return 500;
  if (price >= 5000) return 100;
  if (price >= 1000) return 50;
  if (price >= 200) return 10;
  if (price >= 50) return 5;
  return 1;
}

const chip = "h-10 shrink-0 rounded-full border px-3.5 text-[0.8125rem] font-medium whitespace-nowrap";

/**
 * Phone version of the alert rule: −/+ buttons and a draggable price scale instead of the keypad.
 * Controlled by AlertRulesForm, which owns the values and the save.
 */
export default function AlertStepper({ currency, currentPrice, range, mode, onModeChange, value, onChange, suggestion }: Props) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const step = stepFor(currentPrice);
  const isPrice = mode === "price";
  const lo = Math.max(step, Math.floor(Math.min(range?.low ?? currentPrice, currentPrice) * 0.8));
  // With history the scale ends at the highest price seen, so its right end reads "High".
  const hi = range ? Math.ceil(Math.max(range.high, currentPrice)) : Math.ceil(currentPrice * 1.1);

  const price = isPrice ? (value ?? Math.floor(currentPrice * 0.9)) : Math.round(currentPrice * (1 - (value ?? 10) / 100));
  const pct = isPrice ? null : (value ?? 10);
  const frac = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

  function setPrice(v: number) {
    onChange(Math.min(hi, Math.max(step, Math.round(v / step) * step)));
  }
  function setPct(v: number) {
    onChange(Math.min(50, Math.max(1, Math.round(v))));
  }
  function nudge(dir: 1 | -1) {
    if (isPrice) setPrice((value ?? price) + dir * step);
    else setPct((value ?? 10) + dir);
  }

  function fromPointer(e: React.PointerEvent) {
    const r = rulerRef.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = lo + f * (hi - lo);
    if (isPrice) setPrice(v);
    else setPct((1 - v / currentPrice) * 100);
  }

  let hint = "";
  let hintDanger = false;
  if (isPrice) {
    if (price >= currentPrice) {
      hint = `That's at or above today's ${formatPrice(currentPrice, currency)}. Pick a lower price.`;
      hintDanger = true;
    } else {
      const below = ((currentPrice - price) / currentPrice) * 100;
      hint = `${below.toFixed(1)}% below today.${range && price < range.low ? " It has never been this low, so this may take a while." : ""}`;
    }
  } else {
    hint = `Alerts once it reaches ${formatPrice(price, currency)} or less.`;
  }

  const priceChips = [5, 10, 20].map((off) => ({
    label: `−${off}% · ${formatPrice(Math.floor(currentPrice * (1 - off / 100)), currency)}`,
    on: isPrice && value === Math.floor(currentPrice * (1 - off / 100)),
    pick: () => onChange(Math.floor(currentPrice * (1 - off / 100))),
  }));
  if (suggestion && suggestion.price < currentPrice) {
    priceChips.push({
      label: `${suggestion.label} · ${formatPrice(suggestion.price, currency)}`,
      on: isPrice && value === suggestion.price,
      pick: () => onChange(suggestion.price),
    });
  }
  const pctChips = [5, 10, 15, 20].map((n) => ({
    label: `${n}% · ${formatPrice(Math.round(currentPrice * (1 - n / 100)), currency)}`,
    on: !isPrice && value === n,
    pick: () => onChange(n),
  }));
  const chips = isPrice ? priceChips : pctChips;
  const knob = frac(price) * 100;

  return (
    <div className="flex flex-col gap-4 md:hidden">
      <div className="grid grid-cols-2 rounded-xl bg-foreground/[0.06] p-[3px]" role="tablist" aria-label="Alert type">
        {(
          [
            ["price", "Target price"],
            ["pct", "% drop"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => onModeChange(key)}
            className={cn("h-9 rounded-[0.5625rem] text-sm font-medium", mode === key && "bg-background shadow-sm")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={isPrice ? "Lower price" : "Smaller drop"}
          className="flex size-13 shrink-0 items-center justify-center rounded-full border bg-card"
        >
          <Minus className="size-5" />
        </button>
        <div className="min-w-0 text-center">
          <div className="text-xs text-muted-foreground">{isPrice ? "Alert at or below" : "Alert on a drop of at least"}</div>
          <div className="text-4xl leading-[1.15] font-bold tracking-tight tabular-nums">
            {isPrice ? formatPrice(price, currency) : `${pct}%`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={isPrice ? "Higher price" : "Bigger drop"}
          className="flex size-13 shrink-0 items-center justify-center rounded-full border bg-card"
        >
          <Plus className="size-5" />
        </button>
      </div>
      <p className={cn("-mt-1 text-center text-[0.8125rem] leading-snug text-balance", hintDanger ? "text-danger" : "text-muted-foreground")}>
        {hint}
      </p>

      <div
        ref={rulerRef}
        role="slider"
        tabIndex={0}
        aria-label={isPrice ? "Target price" : "Drop percent"}
        aria-valuemin={isPrice ? lo : 1}
        aria-valuemax={isPrice ? hi : 50}
        aria-valuenow={isPrice ? price : (pct ?? 10)}
        onKeyDown={(e) => {
          // Arrow keys move the knob along the scale: left is the lower price (a bigger drop).
          const toward = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (toward) nudge(isPrice ? toward : (-toward as 1 | -1));
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        className="relative mx-2.5 h-[2.875rem] cursor-pointer touch-none select-none"
      >
        <div className="absolute top-3 right-0 left-0 h-1.5 rounded-full bg-foreground/10" />
        <div className="absolute top-3 left-0 h-1.5 rounded-full bg-success/45" style={{ width: `${knob}%` }} />
        <div className="absolute top-[0.4375rem] h-4 w-0.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${frac(currentPrice) * 100}%` }} />
        <span className="absolute top-7 -translate-x-1/2 text-[0.65625rem] font-semibold whitespace-nowrap text-primary" style={{ left: `${frac(currentPrice) * 100}%` }}>
          Today
        </span>
        {range && range.average > lo && range.average < hi && (
          <>
            <div className="absolute top-[0.5625rem] h-3 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground" style={{ left: `${frac(range.average) * 100}%` }} />
            <span className="absolute top-7 -translate-x-1/2 text-[0.65625rem] whitespace-nowrap text-muted-foreground" style={{ left: `${frac(range.average) * 100}%` }}>
              Avg {formatCompactPrice(range.average, currency)}
            </span>
          </>
        )}
        <span className="absolute top-7 left-0 text-[0.65625rem] text-muted-foreground">{formatCompactPrice(lo, currency)}</span>
        <span className="absolute top-7 right-0 text-[0.65625rem] text-muted-foreground">
          {range ? "High " : ""}
          {formatCompactPrice(hi, currency)}
        </span>
        <div
          className="absolute top-[0.3125rem] box-border size-5 -translate-x-1/2 rounded-full border-2 border-foreground bg-background shadow-md"
          style={{ left: `${knob}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={c.pick}
            className={cn(chip, c.on ? "border-primary bg-primary/12 text-primary" : "bg-card")}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        You&apos;ll also hear about new all-time lows and restocks.
      </p>
    </div>
  );
}
