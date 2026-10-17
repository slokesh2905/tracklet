"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, ImageOff, Sparkles, Target, TrendingDown, Trophy, type LucideIcon } from "lucide-react";
import { VERDICT_COPY } from "@/components/product/Badges";
import { formatPercent, formatPrice, hostname, timeAgo } from "@/lib/format";
import type { HeroCard, HeroKind } from "@/lib/home";
import { cn } from "@/lib/utils";

const TAGS: Record<HeroKind, { label: string; icon: LucideIcon; className: string }> = {
  target_reached: { label: "Target reached", icon: Target, className: "bg-primary/12 text-primary" },
  all_time_low: { label: "New all-time low", icon: Trophy, className: "bg-primary/12 text-primary" },
  price_drop: { label: "Price drop", icon: TrendingDown, className: "bg-success/12 text-success" },
};

const W = 280;
const H = 56;

/** Price history as a line and soft area, with the target as a dashed line when there is one. */
function Spark({ values, target, currency }: { values: number[]; target: number | null; currency: string }) {
  const pts = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const all = target === null ? pts : [...pts, target];
  const lo = Math.min(...all);
  const span = Math.max(...all) - lo || 1;
  const y = (v: number) => 6 + (1 - (v - lo) / span) * 44;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = pts.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible" role="img" aria-label="Price history">
      <path d={`${line} V${H} H0 Z`} className="fill-primary/10" />
      {target !== null && (
        <>
          <line x1="0" x2={W} y1={y(target)} y2={y(target)} strokeWidth="1.25" strokeDasharray="4 4" className="stroke-success" />
          <text x="2" y={Math.max(10, y(target) - 4)} fontSize="10" fontWeight="600" className="fill-success">
            Target {formatPrice(target, currency)}
          </text>
        </>
      )}
      <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-primary" />
      <circle cx={x(last)} cy={y(pts[last]!)} r="4" strokeWidth="2" className="fill-primary stroke-card" />
    </svg>
  );
}

function Card({ card }: { card: HeroCard }) {
  const tag = TAGS[card.kind];
  const Icon = tag.icon;
  const verdict = card.verdict ? VERDICT_COPY[card.verdict] : null;
  const host = hostname(card.url);

  return (
    <div className="flex w-[19.375rem] shrink-0 snap-start flex-col gap-3 rounded-2xl border bg-card p-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tag.className)}>
          <Icon className="size-3" /> {tag.label}
        </span>
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {timeAgo(card.at)}
        </span>
      </div>

      <Link href={`/products/${card.productId}`} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex size-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
            {card.imageUrl ? (
              // Retailer images come from arbitrary hosts; plain img avoids optimiser allow-lists.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageUrl} alt="" className="size-full object-contain p-1" />
            ) : (
              <ImageOff className="size-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm leading-snug font-medium">{card.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{host}</p>
          </div>
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[1.75rem] leading-[1.1] font-bold tracking-tight tabular-nums">{formatPrice(card.price, card.currency)}</span>
          {card.was !== null && card.was !== card.price && (
            <span className="text-[0.8125rem] text-muted-foreground line-through">{formatPrice(card.was, card.currency)}</span>
          )}
          {card.changePct !== null && card.changePct !== 0 && (
            <span className={cn("text-[0.8125rem] font-semibold", card.changePct < 0 ? "text-success" : "text-danger")}>
              {formatPercent(card.changePct, { signed: true })}
            </span>
          )}
        </p>
        <Spark values={card.spark} target={card.target} currency={card.currency} />
      </Link>

      {verdict && (
        <div className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2", verdict.className)}>
          <Sparkles className="size-3.5 shrink-0" />
          <span className="text-[0.8125rem] font-semibold whitespace-nowrap">{verdict.label}</span>
          {card.confidence !== null && (
            <span className="truncate text-xs text-muted-foreground">{Math.round(card.confidence * 100)}% confidence</span>
          )}
        </div>
      )}

      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[0.9375rem] font-semibold text-primary-foreground"
      >
        <ExternalLink className="size-4" /> View on {host}
      </a>
    </div>
  );
}

/** Swipeable cards for the products that did something worth acting on. */
export default function HomeHero({ cards }: { cards: HeroCard[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Card width (19.375rem = 310px) plus the 10px gap.
  const STRIDE = 320;

  return (
    <section aria-label="Worth a look">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Worth a look</h2>
        <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
          {index + 1} of {cards.length}
        </span>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => setIndex(Math.max(0, Math.min(cards.length - 1, Math.round(e.currentTarget.scrollLeft / STRIDE))))}
        className="no-scrollbar -mx-4 mt-2.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-0.5"
      >
        {cards.map((card) => (
          <Card key={card.productId} card={card} />
        ))}
      </div>

      {cards.length > 1 && (
        <div className="flex justify-center">
          {cards.map((card, i) => (
            <button
              key={card.productId}
              type="button"
              aria-label={`Show card ${i + 1}`}
              onClick={() => scroller.current?.scrollTo({ left: i * STRIDE, behavior: "smooth" })}
              className="flex h-9 w-6 items-center justify-center"
            >
              <span
                className={cn("h-1.5 rounded-full", i === index ? "bg-primary" : "bg-foreground/20")}
                style={{ width: i === index ? 18 : 6, transition: "width var(--spring-fast-duration) var(--spring-fast)" }}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
