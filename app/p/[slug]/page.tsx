import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, ImageOff, PackageX } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { AllTimeLowBadge, DealBadge } from "@/components/product/Badges";
import InsightsPanel from "@/components/product/InsightsPanel";
import PriceChart from "@/components/product/PriceChart";
import { Button } from "@/components/ui/button";
import { formatPrice, hostname } from "@/lib/format";
import { computeInsights } from "@/lib/insights";
import { getSharedProduct } from "@/lib/share";

export const revalidate = 3600;

// Rendered on first visit, then cached (ISR) and purged when sharing changes.
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getSharedProduct(slug);
  if (!product) return { title: "Not found" };
  const title = `${product.name.slice(0, 60)}: ${formatPrice(Number(product.current_price), product.currency)}`;
  return {
    title,
    description: `Price history for ${product.name} on ${hostname(product.url)}, tracked with Tracklet.`,
    openGraph: { title },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function SharedProductPage({ params }: Params) {
  const { slug } = await params;
  const product = await getSharedProduct(slug);
  if (!product) notFound();

  const current = Number(product.current_price);
  const history = product.history.map((h) => ({ price: Number(h.price), checked_at: h.checked_at }));
  const insights = computeInsights(history, current);

  return (
    <PublicShell>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:p-5">
          <div className="flex size-28 shrink-0 items-center justify-center self-center overflow-hidden rounded-xl border bg-white sm:self-start">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt="" className="size-full object-contain p-2" />
            ) : (
              <ImageOff className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{hostname(product.url)} · shared price history</p>
            <h1 className="mt-1 text-lg leading-snug font-semibold tracking-tight sm:text-xl">{product.name}</h1>
            <p className="mt-2 text-3xl font-bold tracking-tight">{formatPrice(current, product.currency)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!product.in_stock && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
                  <PackageX className="size-3" /> Out of stock
                </span>
              )}
              {insights.isAllTimeLow && <AllTimeLowBadge />}
              {insights.dataPoints > 1 && <DealBadge score={insights.dealScore} label={insights.dealLabel} />}
            </div>
            <Button asChild className="mt-4 w-full gap-2 sm:w-auto">
              <a href={product.url} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink className="size-4" /> View on {hostname(product.url)}
              </a>
            </Button>
          </div>
        </header>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Price history</h2>
          <PriceChart history={history} currentPrice={current} currency={product.currency} lowestPrice={insights.dataPoints > 1 ? insights.allTime.low : null} />
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Insights</h2>
          <InsightsPanel insights={insights} currency={product.currency} currentPrice={current} />
        </section>
      </div>
    </PublicShell>
  );
}
