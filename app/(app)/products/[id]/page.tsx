import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronRight, ImageOff, PackageX, Store } from "lucide-react";
import AiVerdictCard from "@/components/product/AiVerdictCard";
import AlertKindIcon from "@/components/product/AlertKindIcon";
import OtherStores from "@/components/product/OtherStores";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import { AllTimeLowBadge, DealBadge } from "@/components/product/Badges";
import InsightsPanel from "@/components/product/InsightsPanel";
import PriceChart from "@/components/product/PriceChart";
import ProductActions from "@/components/product/ProductActions";
import ProductBar, { AlertRow } from "@/components/product/ProductBar";
import ProductShare from "@/components/product/ProductShare";
import { ALERT_COPY } from "@/lib/alerts";
import { isAiEnabled } from "@/lib/ai";
import { getProductDetail } from "@/lib/data";
import { formatDate, formatPercent, formatPrice, hostname, percentChange, timeAgo } from "@/lib/format";
import { retailerName } from "@/lib/retailers";
import { uuidSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return {};
  const detail = await getProductDetail(id);
  return { title: detail?.product.name.slice(0, 60) ?? "Product" };
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={`scroll-mt-24 rounded-xl border bg-card p-4 ${className ?? ""}`}>
      <h2 id={id} className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProductPage({ params }: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const detail = await getProductDetail(id);
  if (!detail) notFound();

  const { product, history, insights, evidence, gate, offers, comparedAt, verdict, staleVerdict, alerts } = detail;
  const discount =
    product.original_price && Number(product.original_price) > product.current_price
      ? percentChange(Number(product.original_price), product.current_price)
      : null;
  const targetPrice = product.target_price === null ? null : Number(product.target_price);
  const alertPct = product.alert_pct === null ? null : Number(product.alert_pct);
  // Price history is a step function; with a single point there is no range to draw a scale from.
  const range = insights.dataPoints > 1 ? insights.allTime : null;
  const cheaper = offers
    .filter((o) => o.inStock && o.currency === product.currency && o.price < product.current_price)
    .sort((a, b) => a.price - b.price)[0];

  // Below lg the two columns collapse into one list; `order` interleaves them so the chart, the
  // verdict and the cheaper-store offer come before the settings. At lg+ the orders are inert.
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard"
        className="-ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground max-md:hidden pointer-coarse:py-2"
      >
        <ArrowLeft className="size-4" /> All products
      </Link>

      {product.paused && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-medium">Daily checks are paused</p>
            <p className="text-muted-foreground">
              We couldn’t read this page {product.fail_count} times in a row
              {product.last_error ? ` (${product.last_error})` : ""}. Resume to try again.
            </p>
          </div>
        </div>
      )}

      {/* On a phone the header is unboxed: thumbnail and title side by side, then the price. */}
      <header className="flex flex-col gap-3.5 md:flex-row md:gap-4 md:rounded-xl md:border md:bg-card md:p-4 lg:p-5">
        <div className="flex items-start gap-3.5 md:contents">
          <div className="flex size-[4.75rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.875rem] border bg-white md:size-28 md:self-center md:rounded-xl lg:size-32 lg:self-start">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt="" className="size-full object-contain p-1.5 md:p-2" />
            ) : (
              <ImageOff className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1 md:hidden">
            <p className="text-xs text-muted-foreground">
              {hostname(product.url)}
              {product.category && ` · ${product.category}`}
            </p>
            <h1 className="mt-0.5 text-lg leading-snug font-semibold tracking-tight text-pretty">{product.name}</h1>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="max-md:hidden">
            <p className="text-xs text-muted-foreground">
              {hostname(product.url)}
              {product.category && ` · ${product.category}`}
            </p>
            <h1 className="mt-1 text-lg font-semibold sm:text-xl">{product.name}</h1>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 md:mt-2">
            <span className="text-4xl leading-[1.1] font-bold tracking-tight tabular-nums md:text-3xl">
              {formatPrice(product.current_price, product.currency)}
            </span>
            {discount !== null && (
              <span className="text-sm text-muted-foreground">
                <s>{formatPrice(Number(product.original_price), product.currency)}</s>{" "}
                <span className="font-medium text-success">{formatPercent(discount, { signed: true })} off list</span>
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 md:mt-2">
            {!product.in_stock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
                <PackageX className="size-3" /> Out of stock
              </span>
            )}
            {insights.isAllTimeLow && <AllTimeLowBadge />}
            {insights.dataPoints > 1 && <DealBadge score={insights.dealScore} label={insights.dealLabel} />}
            {targetPrice !== null && product.current_price <= targetPrice && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground md:hidden">
                Under your {formatPrice(targetPrice, product.currency)}
              </span>
            )}
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground md:mt-2" suppressHydrationWarning>
            Price data since {formatDate(evidence.firstSeen)}
            {evidence.shoppers > 1 && ` from ${evidence.shoppers} shoppers`}
            {product.last_checked_at && ` · last checked ${timeAgo(product.last_checked_at)}`}
          </p>
          <div className="mt-4 max-md:hidden">
            <ProductActions productId={product.id} url={product.url} paused={product.paused} />
          </div>
        </div>
      </header>

      {cheaper && (
        <a
          href="#section-other-stores"
          className="flex items-center gap-3 rounded-[0.875rem] border border-chart-2/25 bg-chart-2/10 p-3 md:hidden"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-chart-2/15 text-chart-2">
            <Store className="size-[1.125rem]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {formatPrice(product.current_price - cheaper.price, product.currency)} less on {retailerName(cheaper.retailer)}
            </span>
            <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
              {cheaper.match === "exact" ? "Exact match" : "Similar item"} · {formatPrice(cheaper.price, cheaper.currency)} ·
              checked {timeAgo(cheaper.checkedAt)}
            </span>
          </span>
          <ChevronRight className="size-[1.125rem] shrink-0 text-muted-foreground" />
        </a>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4 max-lg:contents">
          <Section title="Price history" className="max-lg:order-1">
            <PriceChart
              history={history}
              currentPrice={product.current_price}
              currency={product.currency}
              targetPrice={targetPrice}
              lowestPrice={insights.dataPoints > 1 ? insights.allTime.low : null}
            />
          </Section>
          <Section title="Insights" className="max-lg:order-3">
            <InsightsPanel insights={insights} currency={product.currency} currentPrice={product.current_price} />
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 max-lg:contents">
          {(isAiEnabled() || gate.kind === "insufficient") && (
            <div className="max-lg:order-2">
              <AiVerdictCard
                productId={product.id}
                verdict={verdict}
                stale={staleVerdict}
                aiEnabled={isAiEnabled()}
                gate={gate}
                facts={{
                  currency: product.currency,
                  originalPrice: product.original_price,
                  discountPct: evidence.discountPct,
                  daysTracked: insights.daysTracked,
                  shoppers: evidence.shoppers,
                  firstSeen: evidence.firstSeen,
                }}
              />
            </div>
          )}
          <Section title="Other stores" className="max-lg:order-4">
            <OtherStores productId={product.id} offers={offers} currentPrice={product.current_price} comparedAt={comparedAt} />
          </Section>
          {/* Desktop edits the alert inline; a phone gets a row that opens the sheet from the pinned bar. */}
          <Section title="Price alert" className="max-lg:order-5 max-md:hidden">
            <AlertRulesForm
              productId={product.id}
              currency={product.currency}
              currentPrice={product.current_price}
              targetPrice={targetPrice}
              alertPct={alertPct}
              range={range}
            />
          </Section>
          <div className="rounded-xl border bg-card max-lg:order-5 md:hidden">
            <AlertRow currency={product.currency} targetPrice={targetPrice} alertPct={alertPct} />
          </div>
          <Section title="Share" className="max-lg:order-6">
            <ProductShare productId={product.id} slug={product.share_slug} isPublic={product.is_public} name={product.name} />
          </Section>
          {alerts.length > 0 && (
            <Section title="Recent alerts" className="max-lg:order-7">
              <ul className="flex flex-col divide-y text-sm">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <AlertKindIcon kind={a.kind} />
                      <span className="truncate">{ALERT_COPY[a.kind].title}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground" suppressHydrationWarning>
                      {formatPrice(Number(a.new_price), a.currency)} · {timeAgo(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>

      <ProductActions productId={product.id} url={product.url} paused={product.paused} footer />
      <ProductBar
        productId={product.id}
        name={product.name}
        url={product.url}
        currency={product.currency}
        currentPrice={product.current_price}
        targetPrice={targetPrice}
        alertPct={alertPct}
        range={range}
      />
    </div>
  );
}
