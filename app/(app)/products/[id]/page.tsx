import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ImageOff, PackageX } from "lucide-react";
import AiVerdictCard from "@/components/product/AiVerdictCard";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import { AllTimeLowBadge, DealBadge } from "@/components/product/Badges";
import InsightsPanel from "@/components/product/InsightsPanel";
import PriceChart from "@/components/product/PriceChart";
import ProductActions from "@/components/product/ProductActions";
import ProductShare from "@/components/product/ProductShare";
import { ALERT_COPY } from "@/lib/alerts";
import { isAiEnabled } from "@/lib/ai";
import { getProductDetail } from "@/lib/data";
import { formatDate, formatPercent, formatPrice, hostname, percentChange, timeAgo } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return {};
  const detail = await getProductDetail(id);
  return { title: detail?.product.name.slice(0, 60) ?? "Product" };
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-4 ${className ?? ""}`}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProductPage({ params }: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const detail = await getProductDetail(id);
  if (!detail) notFound();

  const { product, history, insights, verdict, staleVerdict, alerts } = detail;
  const discount =
    product.original_price && Number(product.original_price) > product.current_price
      ? percentChange(Number(product.original_price), product.current_price)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard"
        className="-ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-2"
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

      <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:p-5">
        <div className="flex size-28 shrink-0 items-center justify-center self-center overflow-hidden rounded-xl border bg-white sm:size-32 sm:self-start">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" className="size-full object-contain p-2" />
          ) : (
            <ImageOff className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {hostname(product.url)}
            {product.category && ` · ${product.category}`}
          </p>
          <h1 className="mt-1 text-lg leading-snug font-semibold tracking-tight sm:text-xl">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tracking-tight">{formatPrice(product.current_price, product.currency)}</span>
            {discount !== null && (
              <span className="text-sm text-muted-foreground">
                <s>{formatPrice(Number(product.original_price), product.currency)}</s>{" "}
                <span className="font-medium text-success">{formatPercent(discount, { signed: true })} off list</span>
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!product.in_stock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
                <PackageX className="size-3" /> Out of stock
              </span>
            )}
            {insights.isAllTimeLow && <AllTimeLowBadge />}
            {insights.dataPoints > 1 && <DealBadge score={insights.dealScore} label={insights.dealLabel} />}
          </div>
          <p className="mt-2 text-xs text-muted-foreground" suppressHydrationWarning>
            Tracking since {formatDate(product.created_at)}
            {product.last_checked_at && ` · last checked ${timeAgo(product.last_checked_at)}`}
          </p>
          <div className="mt-4">
            <ProductActions productId={product.id} url={product.url} paused={product.paused} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Price history">
            <PriceChart
              history={history}
              currentPrice={product.current_price}
              currency={product.currency}
              targetPrice={product.target_price === null ? null : Number(product.target_price)}
              lowestPrice={insights.dataPoints > 1 ? insights.allTime.low : null}
            />
          </Section>
          <Section title="Insights">
            <InsightsPanel insights={insights} currency={product.currency} currentPrice={product.current_price} />
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <AiVerdictCard productId={product.id} verdict={verdict} stale={staleVerdict} enabled={isAiEnabled()} />
          <Section title="Price alert">
            <AlertRulesForm
              productId={product.id}
              currency={product.currency}
              currentPrice={product.current_price}
              targetPrice={product.target_price === null ? null : Number(product.target_price)}
              alertPct={product.alert_pct === null ? null : Number(product.alert_pct)}
            />
          </Section>
          <Section title="Share">
            <ProductShare productId={product.id} slug={product.share_slug} isPublic={product.is_public} name={product.name} />
          </Section>
          {alerts.length > 0 && (
            <Section title="Recent alerts">
              <ul className="flex flex-col divide-y text-sm">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate">
                      {ALERT_COPY[a.kind].emoji} {ALERT_COPY[a.kind].title}
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
    </div>
  );
}
