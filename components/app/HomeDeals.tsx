"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellPlus, ExternalLink, ImageOff, Sparkles } from "lucide-react";
import { TAGS } from "@/components/app/HomeHero";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import { VERDICT_COPY } from "@/components/product/Badges";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatPercent, formatPrice, hostname, timeAgo } from "@/lib/format";
import type { HeroCard, PriceWindow } from "@/lib/home";
import { cn } from "@/lib/utils";

function Thumb({ src, className }: { src: string | null; className: string }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden border bg-white", className)}>
      {src ? (
        // Retailer images come from arbitrary hosts; plain img avoids optimiser allow-lists.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain p-1" />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

function Tag({ card }: { card: HeroCard }) {
  const tag = TAGS[card.kind];
  const Icon = tag.icon;
  return (
    <div className="flex items-center justify-between">
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tag.className)}>
        <Icon className="size-3" /> {tag.label}
      </span>
      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
        {timeAgo(card.at)}
      </span>
    </div>
  );
}

/** The verdict box is a lighter tint than the verdict pill, so its reasoning reads easily. */
const VERDICT_BOX: Record<NonNullable<HeroCard["verdict"]>, string> = {
  buy_now: "bg-success/8 text-success",
  fair: "bg-muted text-muted-foreground",
  wait: "bg-danger/8 text-danger",
  buy_elsewhere: "bg-chart-2/10 text-chart-2",
};

/** Axis prices: round to tens once there are thousands, so the labels stay short. */
const axisPrice = (v: number, currency: string) => formatPrice(v >= 1000 ? Math.round(v / 10) * 10 : v, currency);

const CH = 170;
const X0 = 44;
const Y0 = 12;
const Y1 = 146;

/** The 90-day step chart with the average marked, as in the design's featured card. */
function WindowChart({ win, currency }: { win: PriceWindow; currency: string }) {
  const now = win.until;
  // Drawn at the box's real width, one unit per pixel: a wide stacked card stretches the line,
  // not the labels.
  const box = useRef<HTMLDivElement>(null);
  const [CW, setWidth] = useState(400);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pad = (win.high - win.low) * 0.15 || win.high * 0.05 || 1;
  const lo = win.low - pad;
  const hi = win.high + pad;
  const x = (t: number) => X0 + ((t - win.since) / (now - win.since)) * (CW - X0);
  const y = (v: number) => Y0 + ((hi - v) / (hi - lo)) * (Y1 - Y0);
  const [first, ...rest] = win.steps;
  let line = `M${X0},${y(first!.price).toFixed(1)}`;
  for (const s of rest) line += ` H${x(s.t).toFixed(1)} V${y(s.price).toFixed(1)}`;
  line += ` H${CW}`;
  const avgY = y(win.average);

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="block w-full overflow-visible" role="img" aria-label="Price over the last 90 days">
        <line x1={X0} x2={CW} y1={Y0} y2={Y0} strokeDasharray="3 3" className="stroke-border" />
        <line x1={X0} x2={CW} y1={(Y0 + Y1) / 2} y2={(Y0 + Y1) / 2} strokeDasharray="3 3" className="stroke-border" />
        <line x1={X0} x2={CW} y1={Y1} y2={Y1} className="stroke-border" />
        <g fontSize="10" className="fill-muted-foreground">
          <text x="0" y={Y0 + 3}>{axisPrice(hi, currency)}</text>
          <text x="0" y={(Y0 + Y1) / 2 + 3}>{axisPrice((hi + lo) / 2, currency)}</text>
          <text x="0" y={Y1 + 3}>{axisPrice(lo, currency)}</text>
          <text x={X0} y={CH - 4}>{formatDate(new Date(win.since), { year: false })}</text>
          <text x={(X0 + CW) / 2} y={CH - 4} textAnchor="middle">
            {formatDate(new Date((win.since + now) / 2), { year: false })}
          </text>
          <text x={CW} y={CH - 4} textAnchor="end">
            Today
          </text>
        </g>
        <path d={`${line} V${Y1} H${X0} Z`} className="fill-primary/8" />
        <line x1={X0} x2={CW} y1={avgY} y2={avgY} strokeDasharray="4 4" className="stroke-muted-foreground" />
        <text x={X0 + 4} y={avgY - 5} fontSize="10" className="fill-muted-foreground">
          Average {formatPrice(win.average, currency)}
        </text>
        <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-primary" />
        <circle cx={CW} cy={y(win.steps.at(-1)!.price)} r="4.5" strokeWidth="2" className="fill-primary stroke-card" />
      </svg>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-[0.625rem] bg-muted/70 px-[0.6875rem] py-[0.5625rem]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-[0.9375rem] font-semibold tabular-nums", className)}>{value}</p>
    </div>
  );
}

/** The top deal, wide: details and verdict beside its 90-day chart (stacked below 1200px). */
export function FeaturedDeal({ card, win }: { card: HeroCard; win: PriceWindow | null }) {
  const [alertOpen, setAlertOpen] = useState(false);
  const verdict = card.verdict ? VERDICT_COPY[card.verdict] : null;
  const host = hostname(card.url);

  return (
    <div
      className={cn(
        "grid gap-7 rounded-xl border bg-card p-5 shadow-xs",
        win && "min-[1200px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Tag card={card} />
        <Link href={`/products/${card.productId}`} className="flex gap-3.5">
          <Thumb src={card.imageUrl} className="size-16 rounded-xl" />
          <div className="min-w-0">
            <p className="text-base leading-snug font-medium text-pretty hover:underline">{card.name}</p>
            <p className="mt-[0.1875rem] text-[0.8125rem] text-muted-foreground">{host}</p>
          </div>
        </Link>
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-[2.5rem] leading-[1.05] font-bold tracking-tight tabular-nums">{formatPrice(card.price, card.currency)}</span>
          {card.was !== null && card.was !== card.price && (
            <span className="text-sm text-muted-foreground line-through">{formatPrice(card.was, card.currency)}</span>
          )}
          {card.changePct !== null && card.changePct !== 0 && (
            <span className={cn("text-sm font-semibold", card.changePct < 0 ? "text-success" : "text-danger")}>
              {formatPercent(card.changePct, { signed: true })}
            </span>
          )}
        </p>
        {verdict && (
          <div className={cn("flex gap-2.5 rounded-[0.625rem] px-3 py-2.5", VERDICT_BOX[card.verdict!])}>
            <Sparkles className="mt-px size-[0.9375rem] shrink-0" />
            <p className="text-[0.8125rem] leading-[1.45]">
              <b className="font-semibold">{verdict.label}</b>
              {card.confidence !== null && <span className="text-muted-foreground"> · {Math.round(card.confidence * 100)}% confidence</span>}
              {card.verdictSummary && <span className="block text-foreground">{card.verdictSummary}</span>}
            </p>
          </div>
        )}
        <div className="mt-auto flex gap-2">
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[0.9375rem] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <ExternalLink className="size-4" /> View on {host}
          </a>
          <button
            type="button"
            onClick={() => setAlertOpen(true)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm font-medium hover:bg-muted"
          >
            <BellPlus className="size-4" /> Set alert
          </button>
        </div>
      </div>

      {win && (
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Price history</span>
            <span className="text-xs text-muted-foreground">Last 90 days</span>
          </div>
          <WindowChart win={win} currency={card.currency} />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Lowest" value={formatPrice(win.low, card.currency)} className="text-success" />
            <Stat label="Average" value={formatPrice(win.average, card.currency)} />
            <Stat label="Highest" value={formatPrice(win.high, card.currency)} />
          </div>
        </div>
      )}

      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Price alert</DialogTitle>
            <DialogDescription className="line-clamp-2">{card.name}</DialogDescription>
          </DialogHeader>
          <AlertRulesForm
            productId={card.productId}
            currency={card.currency}
            currentPrice={card.price}
            targetPrice={card.target}
            alertPct={card.alertPct}
            onSaved={() => setAlertOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A stretched step line for the smaller deal cards. */
function StretchSpark({ values }: { values: number[] }) {
  const pts = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const lo = Math.min(...pts);
  const span = Math.max(...pts) - lo || 1;
  const y = (v: number) => 4 + (1 - (v - lo) / span) * 48;
  let line = `M0,${y(pts[0]!).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) line += ` H${((i / (pts.length - 1)) * 274).toFixed(1)} V${y(pts[i]!).toFixed(1)}`;
  line += " H280";
  return (
    <svg viewBox="0 0 280 56" preserveAspectRatio="none" className="block h-[2.125rem] min-w-0 flex-1 overflow-visible" aria-hidden="true">
      <path d={`${line} V56 H0 Z`} className="fill-primary/8" />
      <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="stroke-primary" />
    </svg>
  );
}

/** The other deals, two to a row below the featured one. */
export function DealCard({ card }: { card: HeroCard }) {
  const host = hostname(card.url);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
      <Tag card={card} />
      <Link href={`/products/${card.productId}`} className="flex gap-3">
        <Thumb src={card.imageUrl} className="size-12 rounded-[0.625rem]" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-snug font-medium hover:underline">{card.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{host}</p>
        </div>
      </Link>
      <div className="flex items-end gap-3">
        <p className="flex shrink-0 items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{formatPrice(card.price, card.currency)}</span>
          {card.changePct !== null && card.changePct !== 0 && (
            <span className={cn("text-[0.8125rem] font-semibold", card.changePct < 0 ? "text-success" : "text-danger")}>
              {formatPercent(card.changePct, { signed: true })}
            </span>
          )}
        </p>
        <StretchSpark values={card.spark} />
      </div>
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 items-center justify-center gap-1.5 rounded-lg border bg-card text-sm font-medium hover:bg-muted"
      >
        <ExternalLink className="size-[0.9375rem]" /> View on {host}
      </a>
    </div>
  );
}
