import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BellRing, ChevronRight, ImageOff, PiggyBank, Target } from "lucide-react";
import ClipboardSuggest from "@/components/app/ClipboardSuggest";
import HomeGreeting from "@/components/app/HomeGreeting";
import HomeHero from "@/components/app/HomeHero";
import { getAlerts, getDashboardData } from "@/lib/data";
import { formatPercent, formatPrice, timeAgo } from "@/lib/format";
import { closestToTarget, heroCards, withoutTarget } from "@/lib/home";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const [data, alerts] = await Promise.all([getDashboardData(), getAlerts()]);
  if (!data) redirect("/?signin=1");

  const { products, stats, user } = data;
  const cards = heroCards(products, alerts);
  const targets = closestToTarget(products);
  const untargeted = withoutTarget(products);
  const lastChecked = products.map((p) => p.last_checked_at).filter((t): t is string => !!t).sort().at(-1) ?? null;
  const name = user.name?.trim().split(/\s+/)[0] || user.email.split("@")[0] || "there";

  const summary =
    products.length === 0
      ? "Track your first product to see what to act on here."
      : `Your ${products.length} product${products.length === 1 ? " was" : "s were"} checked ${lastChecked ? timeAgo(lastChecked) : "recently"}.`;

  // Spacing follows the design screen by screen rather than one uniform gap.
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <HomeGreeting name={name} summary={summary} />
      <ClipboardSuggest trackedUrls={products.map((p) => p.url)} />

      {products.length === 0 ? (
        <section className="mt-6 flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
          <Target className="size-10 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Nothing tracked yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            <span className="md:hidden">Tap Track below and paste a link from any store.</span>
            <span className="max-md:hidden">Paste a product link on the Products page to start.</span>
          </p>
        </section>
      ) : (
        <>
          {cards.length > 0 ? (
            <HomeHero cards={cards} />
          ) : (
            <section className="mt-[1.375rem] flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-primary/12 text-primary">
                <BellRing className="size-[1.125rem]" />
              </span>
              <div>
                <h2 className="text-[0.9375rem] font-semibold">Nothing needs you right now</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Target hits, new lows and big drops show up here as soon as they happen.
                </p>
              </div>
            </section>
          )}

          {stats.totalSavings > 0 && (
            <div className={`${cards.length > 1 ? "mt-1.5" : "mt-3"} flex items-center gap-2.5 rounded-xl bg-success/8 px-3.5 py-3`}>
              <PiggyBank className="size-[1.125rem] shrink-0 text-success" />
              <p className="text-sm">
                <b className="font-semibold text-success">{formatPrice(stats.totalSavings, stats.currency)}</b> saved from price drops so far
              </p>
            </div>
          )}

          {(targets.length > 0 || untargeted > 0) && (
            <section aria-label="Close to your target" className="mt-6">
              <h2 className="text-xl font-semibold tracking-tight">Close to your target</h2>
              <div className="mt-2.5 overflow-hidden rounded-xl border bg-card shadow-xs">
                <ul className="divide-y px-3.5">
                  {targets.map((t) => (
                    <li key={t.productId}>
                      <Link href={`/products/${t.productId}`} className="flex flex-col gap-2.5 py-3">
                        <span className="flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[0.625rem] border bg-white">
                            {t.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.imageUrl} alt="" loading="lazy" className="size-full object-contain p-0.5" />
                            ) : (
                              <ImageOff className="size-4 text-muted-foreground" />
                            )}
                          </span>
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
                    </li>
                  ))}
                </ul>
                {untargeted > 0 && (
                  <Link
                    href="/dashboard"
                    className={`flex h-12 items-center gap-2 px-3.5 text-sm font-medium text-primary ${targets.length > 0 ? "border-t" : ""}`}
                  >
                    <Target className="size-4" />
                    <span className="flex-1">
                      Set targets for {untargeted} {targets.length > 0 ? "more " : ""}product{untargeted === 1 ? "" : "s"}
                    </span>
                    <ChevronRight className="size-4" />
                  </Link>
                )}
              </div>
            </section>
          )}

          <Link href="/dashboard" className="mt-3.5 flex h-11 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
            See all {products.length} product{products.length === 1 ? "" : "s"} <ArrowRight className="size-[0.9375rem]" />
          </Link>
        </>
      )}
    </div>
  );
}
