import Link from "next/link";
import { ArrowRight, BellRing, ChevronRight, ImageOff, Minus, PiggyBank, Target, TrendingDown, TrendingUp } from "lucide-react";
import CheckAllRow from "@/components/app/CheckAllRow";
import { DealCard, FeaturedDeal } from "@/components/app/HomeDeals";
import Sparkline from "@/components/product/Sparkline";
import type { DashboardStats } from "@/lib/data";
import { formatPercent, formatPrice, hostname, timeAgo } from "@/lib/format";
import type { ChangedRow, HeroCard, PriceWindow, TargetRow } from "@/lib/home";
import { cn } from "@/lib/utils";

type Props = {
  cards: HeroCard[];
  featuredWindow: PriceWindow | null;
  changed: ChangedRow[];
  targets: TargetRow[];
  untargeted: number;
  totalProducts: number;
  stores: number;
  lastChecked: string | null;
  stats: DashboardStats;
  className?: string;
};

/** Table columns: from 1200px there's room for when each price changed. */
const COLS = "grid-cols-[minmax(0,1fr)_84px_84px_88px] min-[1200px]:grid-cols-[minmax(0,1fr)_92px_92px_92px_72px]";

function Thumb({ src, className }: { src: string | null; className: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border bg-white", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-contain p-0.5" />
      ) : (
        <ImageOff className="size-3.5 text-muted-foreground" />
      )}
    </span>
  );
}

function ChangePill({ pct }: { pct: number }) {
  const Icon = pct < 0 ? TrendingDown : pct > 0 ? TrendingUp : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.1875rem] rounded-full px-[0.4375rem] py-0.5 text-xs font-medium whitespace-nowrap",
        pct < 0 ? "bg-success/12 text-success" : pct > 0 ? "bg-danger/12 text-danger" : "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="size-[0.6875rem]" />
      {formatPercent(pct, { signed: true })}
    </span>
  );
}

function RecentlyChanged({ rows, total }: { rows: ChangedRow[]; total: number }) {
  return (
    <section aria-labelledby="recently-changed">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="recently-changed" className="text-xl font-semibold tracking-tight">
          Recently changed
        </h2>
        <span className="text-[0.8125rem] text-muted-foreground">Last 7 days</span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className={cn("grid items-center gap-4 border-b bg-muted/60 px-4 py-2.5 text-xs font-medium text-muted-foreground", COLS)}>
          <span>Product</span>
          <span className="text-right">Price</span>
          <span>Change</span>
          <span>30 days</span>
          <span className="hidden text-right min-[1200px]:block">Changed</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No prices moved in the last 7 days.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.productId}>
                <Link href={`/products/${r.productId}`} className={cn("grid items-center gap-4 px-4 py-2.5 hover:bg-muted/70", COLS)}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Thumb src={r.imageUrl} className="size-9 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">{hostname(r.url)}</span>
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums">{formatPrice(r.price, r.currency)}</span>
                  <span>
                    <ChangePill pct={r.changePct} />
                  </span>
                  <Sparkline values={r.trend} dot width={80} />
                  <span className="hidden text-right text-xs whitespace-nowrap text-muted-foreground min-[1200px]:block" suppressHydrationWarning>
                    {timeAgo(r.changedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex h-12 items-center justify-between gap-3 border-t pr-2 pl-4">
          <span className="text-[0.8125rem] text-muted-foreground">
            {rows.length} of your {total} product{total === 1 ? "" : "s"} changed this week
          </span>
          <Link
            href="/dashboard"
            className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-primary hover:bg-primary/8"
          >
            All products <ArrowRight className="size-[0.9375rem]" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Home from 768px up: what to act on and what moved in the main column, savings, checks and
 * targets beside it from 1024px (below that the side column follows the main one).
 */
export default function HomeDesktop({
  cards,
  featuredWindow,
  changed,
  targets,
  untargeted,
  totalProducts,
  stores,
  lastChecked,
  stats,
  className,
}: Props) {
  const [featured, ...more] = cards;

  return (
    <div className={cn("mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]", className)}>
      <div className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="worth-a-look">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="worth-a-look" className="text-xl font-semibold tracking-tight">
              Worth a look
            </h2>
            <span className="text-[0.8125rem] text-muted-foreground">{cards.length} right now</span>
          </div>
          {featured ? (
            <>
              <FeaturedDeal card={featured} win={featuredWindow} />
              {more.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {more.map((c) => (
                    <DealCard key={c.productId} card={c} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border bg-card p-5 shadow-xs">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-primary/12 text-primary">
                <BellRing className="size-[1.125rem]" />
              </span>
              <div>
                <p className="text-[0.9375rem] font-semibold">Nothing needs you right now</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Target hits, new lows and big drops show up here as soon as they happen.
                </p>
              </div>
            </div>
          )}
        </section>

        <RecentlyChanged rows={changed} total={totalProducts} />
      </div>

      {/* Starts level with the cards, below the "Worth a look" heading. */}
      <aside className="flex min-w-0 flex-col gap-4 lg:pt-9">
        <section className="rounded-xl border bg-card p-[1.125rem] shadow-xs" aria-label="Savings and price checks">
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <PiggyBank className="size-4 text-success" /> Saved from price drops
          </p>
          <p className="mt-1.5 text-[2.125rem] leading-[1.1] font-bold tracking-tight text-success tabular-nums">
            {formatPrice(stats.totalSavings, stats.currency)}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-[1.45] text-pretty text-muted-foreground">
            Compared with each product&apos;s first recorded price.
          </p>
          <CheckAllRow lastChecked={lastChecked} products={totalProducts} stores={stores} />
        </section>

        {(targets.length > 0 || untargeted > 0) && (
          <section className="overflow-hidden rounded-xl border bg-card shadow-xs" aria-labelledby="close-to-target">
            <h2 id="close-to-target" className="px-4 pt-4 pb-1.5 text-base font-semibold">
              Close to your target
            </h2>
            {targets.map((t, i) => (
              <Link
                key={t.productId}
                href={`/products/${t.productId}`}
                className={cn("mx-4 flex flex-col gap-2.5 py-3", i > 0 && "border-t")}
              >
                <span className="flex items-center gap-3">
                  <Thumb src={t.imageUrl} className="size-9 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {formatPrice(t.price, t.currency)} now · target {formatPrice(t.target, t.currency)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-primary">{formatPercent(t.toGoPct)}</span>
                    <span className="block text-xs text-muted-foreground">to go</span>
                  </span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(t.fillPct)}% of the way to the target`}>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${t.fillPct}%` }} />
                </span>
              </Link>
            ))}
            {untargeted > 0 && (
              <Link
                href="/dashboard"
                className={cn("flex h-12 items-center gap-2 px-4 text-sm font-medium text-primary hover:bg-primary/6", targets.length > 0 && "border-t")}
              >
                <Target className="size-4" />
                <span className="flex-1">
                  Set targets for {untargeted} {targets.length > 0 ? "more " : ""}product{untargeted === 1 ? "" : "s"}
                </span>
                <ChevronRight className="size-4" />
              </Link>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
